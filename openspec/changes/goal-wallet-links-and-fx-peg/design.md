# Technical Design: Goal Wallet Links & FX Stablecoin Peg

## Context

See `proposal.md` for motivation and background.

Currently, `goals` carries a single nullable `goalWalletId` FK plus a manually maintained `goalCurrentAmount` counter, and `contributeGoal` mutates that counter (optionally recording a transaction as a side effect). Live probing shows `convertCurrency` resolves USDT balances through the stale hardcoded fallback (`USDT: 1.0`, `IDR: 16350`) because no keyless FX provider returns stablecoin codes, producing ~9% conversion error on crypto-pocket wallets.

This design establishes the junction-table data model, the derived-read mechanics, the deprecation path, and the in-memory FX peg normalization — all within Cloudflare Workers / D1 SQLite constraints.

## Goals / Non-Goals

**Goals:**
- Add `goal_wallets(goal_id, wallet_id)` junction table with composite PK, RLS-safe indexes, and additive D1 migration.
- Serve goal reads as derived views (`Σ` converted linked balances + per-wallet breakdown) with graceful stored-counter fallback for unlinked goals.
- Remove `contribute` action with a clear `VALIDATION` deprecation error and changelog entry.
- Normalize `USDT`/`USDC`/`DAI` → `USD` in-memory before conversion, with `usedPeg` marking, zero new network dependencies.
- Expose link operations via `manage_goal` (`link_wallet` / `unlink_wallet`, `walletIds` on create) and extend goal payloads in `financial_summary`, `GET /api/v1/goals`, and OpenAPI.

**Non-Goals:**
- Weighted contributions, category/tag aggregation, separate crypto price API, wallet-lock semantic changes, frontend UI.

---

## Decisions & Architectural Rationale

### 1. Junction Table Without Weights vs. Alternatives

* **Context**: A goal funded from N wallets needs a many-to-many relation. Options were a weighted junction table, category-based aggregation, derived-from-balance, or tag-based linking.
* **Decision**: Plain junction table `goal_wallets(goal_id, wallet_id)`, no weight column; progress = unweighted `Σ` of converted balances.
* **Rationale**:
  1. Weights answer a question nobody asked — the user wants the total allocated amount, and plain summation answers it.
  2. Category/tag aggregation depends on user tagging discipline; one untagged transaction silently corrupts a metric that must be trustworthy by construction.
  3. Tags further blur MCP semantics: goal↔wallet links must be explicit and queryable, not string-matched.
* **Mechanics** (Drizzle + D1):
  ```ts
  export const goalWallets = sqliteTable("goal_wallets", {
    goalId: text("goal_id").notNull().references(() => goals.goalId, { onDelete: "cascade" }),
    walletId: text("wallet_id").notNull().references(() => wallets.walletId, { onDelete: "cascade" }),
    goalWalletCreatedAt: text("goal_wallet_created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  }, (table) => [
    primaryKey({ columns: [table.goalId, table.walletId] }),
    index("goal_wallets_goal_id_idx").on(table.goalId),
    index("goal_wallets_wallet_id_idx").on(table.walletId),
  ]);
  ```
* **Migration Script (`drizzle/0007_goal_wallet_links.sql`)**: `CREATE TABLE IF NOT EXISTS` + two `CREATE INDEX IF NOT EXISTS`, fully additive, Zero-Remote-Deletion compliant.
* **Wallet-delete semantics**: `ON DELETE cascade` on `walletId` — deleting a wallet silently drops its links (progress recomputes over remaining links). Goal-delete cascades the other direction. No orphan rows possible.

---

### 2. Derived-at-Read vs. Write-Through Counter

* **Context**: Progress could be recomputed on every linked-wallet transaction (write-through) or computed when the goal is read (derived view).
* **Decision**: **Derived at read time, no triggers, no cron, no background jobs.**
* **Rationale**:
  1. Write-through duplicates state (counter + balances) and every duplication is a future inconsistency — exactly the drift bug being fixed.
  2. Read-time derivation is O(links) indexed lookups; goal reads are infrequent relative to transaction writes, so the cost lands on the cheap path.
  3. Atomicity comes free: a balance update and the next goal read can never disagree because there is only one source of truth.
* **Mechanics** in `src/services/goal.ts`:
  ```ts
  // Pseudo-flow for every goal read path (list/get/summary-embed):
  const links = await db.select().from(schema.goalWallets).where(eq(goalWallets.goalId, goalId));
  if (links.length === 0) return { ...goal, currentAmount: goal.goalCurrentAmount, isDerived: false, linkedWallets: [] };
  const wallets = await db.select().from(schema.wallets).where(inArray(wallets.walletId, links.map(l => l.walletId)));
  // convert each balance to goalCurrency via convertCurrency (peg-aware), sum, attach breakdown
  return { ...goal, currentAmount: derivedTotal, isDerived: true, linkedWallets: breakdown };
  ```
* **Legacy fallback**: `goals.goal_current_amount` column stays (unlinked goals read it). It is never written by link operations; only the deprecated path used to write it.

---

### 3. Deprecate-and-Remove `contribute` (Breaking)

* **Context**: `contributeGoal` mutates the stored counter — directly contradictory to derived progress. Keeping it would let users write a number that the next read overwrites.
* **Decision**: Remove the `contribute` action from `manage_goal`; calls receive `VALIDATION` error naming the removal and pointing to link + `record_transaction`.
* **Rationale**: A half-kept action (e.g. "contribute only tops up the wallet") is just `record_transaction` with extra steps and preserves a misleading API. Clean removal + changelog + release notes + manual user migration is honest and matches the user's explicit decision.
* **Mechanics**: delete the `contribute` branch in `src/mcp.ts` handler, delete/ignore `ContributeGoalParams` in service (keep exported symbol removed — no shim), update OpenAPI `ManageGoalRequest`, document in changelog/release.

---

### 4. FX Stablecoin Peg (USDT/USDC/DAI → USD) vs. Crypto Price API

* **Context**: No keyless provider returns USDT/USDC; live IDR rate (~17.8k) vs hardcoded fallback (16.35k) = ~9% error. Options: explicit 1:1 peg, separate crypto API, or bump the fallback.
* **Decision**: **In-memory peg normalization** (`USDT`/`USDC`/`DAI` → `USD`, case-insensitive) applied at the top of `convertCurrency`, before rate lookup. Provider chain, timeout, and fallback untouched.
* **Rationale**:
  1. Peg error (USDT/USD deviation, typically <0.1%) is two orders of magnitude smaller than the stale-fallback error it replaces.
  2. Zero new dependencies, zero extra edge latency, zero new failure modes — fits workerd constraints perfectly.
  3. Bumping the fallback is cosmetic; it rots again next month. A crypto price API is justified only when volatile assets (BTC/ETH) need first-class support — explicitly deferred.
* **Mechanics** in `src/utils/fx.ts`:
  ```ts
  const USD_PEGGED = new Set(["USDT", "USDC", "DAI"]);
  export function normalizeCurrencyForFx(code: string): { code: string; usedPeg: boolean } {
    const upper = code.trim().toUpperCase();
    if (USD_PEGGED.has(upper)) return { code: "USD", usedPeg: true };
    return { code: upper, usedPeg: false };
  }
  // convertCurrency calls normalizeCurrencyForFx on both ends, ORs usedPeg into a returned meta
  // (signature extended to return { amount, usedPeg } or breakdown entries carry the flag —
  //  exact shape fixed at apply time, spec only requires the observable marker).
  ```
* **Depeg caveat**: during a stablecoin depeg event the peg overstates value. Mitigated by the `usedPeg: true` marker — consumers (summaries, prompts) can surface "includes pegged estimate" language.

---

### 5. Locked Wallets Count Toward Goals

* **Context**: A linked wallet may be `walletIsLocked = 1`. Exclude or include?
* **Decision**: **Include in full.**
* **Rationale**: Lock governs *spendability* (Safe-to-Spend runway), not *ownership*. A locked emergency pocket earmarked for "Sewa Rumah 2026" is still allocated to that goal. Excluding it would understate progress and confuse the two orthogonal concepts shipped in the previous change.

---

### 6. Multi-Tenancy & Edge Runtime Invariants

- **Multi-Tenant RLS**: link/unlink/read verify `goals.goalUserId = userId` AND `wallets.walletUserId = userId` before touching `goal_wallets`. Cross-tenant forgery → `NOT_FOUND` (never `FORBIDDEN`, to avoid existence oracle).
- **V8 Isolate Compatibility**: junction logic uses Drizzle query builder only; peg normalization is pure string/set operations. No new libraries.
- **D1 query budget**: per goal read = 1 indexed select on `goal_wallets` + 1 `IN` select on `wallets`. List-goals path batches links per user (`WHERE goal_id IN (...)`) to avoid N+1.

---

## Risks / Trade-offs

- **[Risk] Goal progress jumps on first link (stored counter ignored)**:
  A user linking wallets to a goal with a hand-maintained counter sees progress change discontinuously.
  -> *Mitigation*: breaking-change changelog + release notes; `linkedWallets` breakdown makes the new number auditable per wallet.

- **[Risk] Stablecoin depeg overstates goal progress**:
  1:1 peg misprices USDT during a depeg event.
  -> *Mitigation*: `usedPeg: true` marker flows into breakdowns and summaries; prompts can hedge ("includes pegged stablecoin estimate").

- **[Risk] N+1 queries on goal list with many links**:
  Naive per-goal link fetch multiplies D1 round trips.
  -> *Mitigation*: batch link fetch per user in `listGoals`; indexes on both junction columns.

- **[Risk] Test-runner schema drift**:
  New migration must be registered in `createTestDB()`.
  -> *Mitigation*: task explicitly appends `0007_goal_wallet_links.sql` to `migrationFiles` in `tests/mcp.test.ts`.
