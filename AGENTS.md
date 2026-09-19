# AGENTS.md

**Repository:** `lutfi-zain/reedrich-mcp`
**Domain:** Personal Finance & Deterministic Wealth Planning System via Model Context Protocol (MCP) on Cloudflare Workers edge.

This file is the authoritative guide for AI coding agents working in this repository. It defines the layered architecture, code style rules, testing requirements, and hard constraints that every change must satisfy.

---

## Commands

```bash
# MANDATORY before finalising any change — run in this exact order:
npm run typecheck            # TypeScript static check (zero errors required)
npm test                     # Unit tests via MockD1 in-memory sqlite (node:sqlite)
npm run test:local           # Integration tests vs local Wrangler dev server
npm run test:remote          # Integration tests vs deployed Cloudflare Workers
```

> ⚠️ All four commands MUST pass with zero errors and zero test failures before submitting or finalizing any change.
> `test:local` requires `wrangler dev` running locally. `test:remote` requires a production deployment.
> **NEVER run destructive SQL on `--remote`** — read the Zero-Remote-Deletion Invariant below.

---

## Project Context & Business Domain (DDD)

**Ubiquitous Language** — all variable names, database columns, function parameters, API fields, and agent responses MUST strictly adhere to the following terms. Do **not** invent synonyms or abbreviations.

| Term | Definition |
|---|---|
| **Wallet** | A user's account, bank account, or digital wallet. Carries `walletId`, `walletBalance` (REAL), `walletCurrency`, `walletIsLocked` (0\|1), `walletType` (bank/cash/e-wallet/credit/crypto/investment). |
| **Transaction** | A recorded financial event. `type`: `expense` \| `income` \| `transfer`. `isPlanned` (0\|1) flags virtual/future entries that DO NOT modify balances. `adminFee` is always separate from `amount`. |
| **Category** | A classification for transactions. `categoryType`: `expense` \| `income`. |
| **Budget** | A spending limit for a category over a period. Defined by `budgetPeriodStart` and `budgetPeriodEnd` (ISO-8601). |
| **DebtLoan** | A liability or receivable. `debtLoanType`: `debt` (user owes) \| `loan` (user is owed). `debtLoanStatus`: `unpaid` \| `partially_paid` \| `paid`. `remainingAmount` tracks unpaid balance. |
| **Goal** | A savings milestone. `goalStatus`: `in_progress` \| `completed` \| `cancelled`. Pacing metrics (requiredMonthlySavings, progressPercentage) are computed, never stored. |
| **RecurringTemplate** | A blueprint for repeating transactions. `templateFrequency`: `daily` \| `weekly` \| `monthly` \| `yearly`. `templateNextRunDate` advances after each execution. |
| **Feedback** | User-submitted product input. `feedbackType`: `feedback` \| `bug` \| `feature_request` \| `question`. `feedbackStatus`: `new`. |
| **User** | An authenticated principal. Identified by `userId` (UUID). Credentials stored as `userApiKeyHash` (SHA-256). JWT claims use `sub` for userId. |
| **ServiceError** | Discriminated error with `code`: `VALIDATION` \| `NOT_FOUND` \| `UNAUTHORIZED` \| `FORBIDDEN` \| `CONFLICT` \| `INTERNAL`. Never use raw `Error` for domain failures. |
| **Safe-to-Spend** | Operational liquidity metric. Formula: `spendableCash − (plannedExpenses + recurringExpenses30Days + activeDebts)`. Sub-fields: `lockedCash`, `safeToSpend`, `dailySafeToSpend`, `isDeficit`. |

> Agents: Do not hallucinate variable names. When uncertain about a field name, read the schema in `src/db/schema.ts` first.

---

## Architecture Boundaries (Progressive Disclosure)

Logic flows strictly in this order and MUST NOT be violated:

```
MCP Tool Handler / Hono Route Handler
         │
         ▼  (pass: db, userId, typed params)
   Service Function  (src/services/*.ts)
         │
         ▼  (pure computation, no side effects)
   Utility Function  (src/utils/*.ts)
         │
         ▼  (Drizzle query builder, never raw SQL strings)
   Cloudflare D1  (src/db/schema.ts)
```

**Rules:**
- Route handlers (`src/routes/*.ts`) MUST be **thin** — extract `userId`, instantiate `drizzle(c.env.DB)`, call one service function, return `c.json()`. Zero business logic.
- Service functions (`src/services/*.ts`) MUST be transport-neutral — no `Request`, `Response`, `Hono`, or MCP SDK imports. Accept `(db, userId, params)`, return plain objects, or throw `ServiceError`.
- Utility functions (`src/utils/*.ts`) MUST be pure — no DB calls, no side effects, fully unit-testable in isolation.
- **Never write raw SQL strings.** Use Drizzle ORM query builder exclusively.

For the canonical implementation patterns, refer to these Gold Standard files:

- **Service Function Pattern:** [`src/services/goal.ts`](file:///home/ubuntu/projects/finnplan-mcp/src/services/goal.ts) — typed params, Drizzle RLS enforcement, utility delegation, clean return shape.
- **Error Handling Pattern:** [`src/services/errors.ts`](file:///home/ubuntu/projects/finnplan-mcp/src/services/errors.ts) — `ServiceError` discriminated union, `HTTP_STATUS_MAP`, typed helper functions (`validationError`, `notFound`, `unauthorized`).
- **Pure Utility Pattern:** [`src/utils/goals.ts`](file:///home/ubuntu/projects/finnplan-mcp/src/utils/goals.ts) — no side effects, well-typed interfaces (`GoalPacingMetrics`), deterministic math only.
- **Thin Route Handler Pattern:** [`src/routes/goals.ts`](file:///home/ubuntu/projects/finnplan-mcp/src/routes/goals.ts) — minimal: `userId`, `drizzle()`, `await service()`, `c.json()`. Nothing else.

*Agents: Read the Gold Standard files before creating any new service, utility, or route. Do not hallucinate structural patterns.*

---

## Security & Compliance Guardrails

- **Multi-Tenant RLS (MANDATORY):** Every Drizzle query touching user data MUST include `eq(schema.<table>.<table>UserId, userId)`. There are NO exceptions. Cross-tenant data leakage is a critical bug.
- **Zero-Remote-Deletion Invariant (ABSOLUTE):** NEVER execute `DELETE`, `DROP TABLE`, `TRUNCATE`, or any destructive SQL against the remote Cloudflare D1 database (`--remote`). All destructive operations target `--local` or in-memory test mocks only. D1 migrations are additive-only (`ALTER TABLE … ADD COLUMN` with defaults).
- **Credential Safety:** NEVER log, print, or expose `apiKey`, `rd_live_*`/`fp_live_*` tokens, `JWT_SECRET`, raw `user_api_key_hash`, OAuth codes, or access/refresh tokens to `console.log`, observability traces, or error messages. Use opaque identifiers only in logs.
- **Credential Storage:** API Keys are stored as SHA-256 hashes (`userApiKeyHash`) only. Plaintext keys must NEVER be persisted to D1.
- **JWT Parameters:** JWT tokens expire in 900 seconds (15 minutes). `iss`: `reedrich-mcp`, `aud`: `reedrich-client`. Backward compat: accept `eve-finance-mcp`/`eve-finance-client`.
- **Soft Lock Policy:** Expenses on locked wallets (`walletIsLocked = 1`) are permitted but MUST return an informational notice. Do NOT block the transaction — implement analytics segregation only.
- **Edge Runtime Only:** NEVER use Node.js native bindings (`fs`, native C++ addons). Use Web Standard APIs exclusively: `fetch`, `crypto.subtle`, `Headers`, `Request`, `Response`, `URL`.
- **Planned Transactions:** `isPlanned = 1` transactions MUST NOT modify wallet balances. This invariant must be enforced in all transaction recording paths.
- **Atomic Balance Reconciliation:** All balance mutations MUST use `sql\`wallet_balance + ${delta}\`` (atomic increment/decrement via D1 SQL expression). Never read-then-write balance.

---

## Git & Workflow Conventions

- **Branching Strategy:**
  - New features: `feat/<openspec-change-name>` (e.g. `feat/wallet-lock-and-safe-to-spend`)
  - Bug fixes: `fix/<short-description>` (e.g. `fix/balance-reconciliation-transfer`)
  - Docs/config: `docs/<short-description>` or `chore/<short-description>`
- **Commit Format:** Conventional Commits required on every commit:
  ```
  feat(scope): description
  fix(scope): description
  docs(openspec): update planning artifacts
  chore(deps): bump wrangler to 4.x
  ```
- **PR Rules:**
  - All PRs target `main`.
  - Planning artifacts (OpenSpec changes) get their own PR before any implementation begins.
  - Never force-push to `main`. Rebase feature branches before merging.
- **OpenSpec Workflow (MANDATORY):** `explore` → `propose` → create PR with artifacts → user reviews & comments → `apply` → `archive`. Never implement code before artifact PR is reviewed and approved.

---

## Dependencies & Environment

- **Runtime:** Cloudflare Workers (workerd / V8 Isolate). No Node.js process model. No persistent memory between requests.
- **Database:** Cloudflare D1 (SQLite at the edge). ORM: Drizzle (`drizzle-orm/d1`). Schema source of truth: `src/db/schema.ts`. Migrations: `drizzle/` directory.
- **Test DB:** `node:sqlite` in-memory (`DatabaseSync`) via `MockD1Database` in `tests/mcp.test.ts`. New migration files MUST be appended to the `migrationFiles` array in `createTestDB()`.
- **Secrets Management:** All secrets (`JWT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) are Cloudflare Worker Secrets. Local dev uses `.dev.vars`. NEVER hardcode secrets in source files.
- **Date/Time:** All dates stored as ISO-8601 strings with timezone. Use `src/utils/date.ts` (`currentIsoTimestamp`, `normalizeToIsoTimestamp`, `isValidIsoDateOrTimestamp`). Never use `new Date().toISOString()` directly in service functions.
- **FX Rates:** Live rates fetched from `open.er-api.com` with 3-second timeout. On timeout/error, fall back to `FALLBACK_RATES_USD_BASE` in `src/utils/fx.ts`. Never block on FX failure.
- **UUIDs:** All primary keys generated via `crypto.randomUUID()` (Web Standard). Never use external UUID libraries.
- **New Migration:** When adding a DB column, create `drizzle/000N_description.sql` with `ALTER TABLE ... ADD COLUMN ... DEFAULT <value> NOT NULL`. Never use `DROP COLUMN` or `TRUNCATE` in migrations.

---

## Historical Session Learnings (Dynamic Log)

*When consistently failing at a specific architectural nuance or repeating an edge-case mistake, add a note here to prevent future agents from making the same mistake.*

- **`migrationFiles` sync:** When adding a new Drizzle migration file, always append its filename to the `migrationFiles` array inside `createTestDB()` in `tests/mcp.test.ts`. Forgetting this causes the in-memory test DB to run on stale schema, producing silent false-positive test passes.
- **`isPlanned` balance guard:** The check `eq(schema.transactions.transactionIsPlanned, 0)` MUST be present on every query that feeds balance reconciliation (`applyBalanceDelta`). Omitting it silently corrupts wallet balances with phantom planned amounts.
- **OpenSpec MODIFIED blocks:** When writing a delta spec that modifies an existing requirement, copy ALL original scenarios into the `## MODIFIED Requirements` block. Dropping any scenario causes `openspec validate` to fail with a hard error at archive time.
- **`ServiceError` over raw `Error`:** Never `throw new Error("...")` for domain failures. Always use typed helpers: `validationError()`, `notFound()`, `unauthorized()`, `forbidden()`, `conflict()`. This ensures MCP and REST transports map errors to correct codes automatically.
- **YAML quoting:** In `openspec/config.yaml`, always quote rule strings containing colons (e.g. `'prefers-reduced-motion: reduce'`) to prevent YAML parsers from misinterpreting them as key-value objects.
