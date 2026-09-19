# Technical Design: Wallet Lock & Safe-to-Spend Runway Engine

## Context

See `proposal.md` for motivation and background.

Currently, Reedrich aggregates all user wallet balances into a monolithic net worth (`netWorthByCurrency` and `consolidatedNetWorth`). The service layer does not distinguish between operational cash (checking, cash, e-wallets) and protected capital reserves (time deposits, emergency savings, mutual funds). This creates misleading financial advice in AI prompts and inflates the perceived disposable budget of users.

This design establishes the technical architecture, database schema evolution, mathematical models, and service layer mechanics for soft wallet locking and safe-to-spend runway analytics on Cloudflare Workers and D1 SQLite.

## Goals / Non-Goals

**Goals:**
- Add `wallet_is_locked` integer flag (`0` or `1`) to the `wallets` table in SQLite D1.
- Provide backward-compatible D1 migration adhering to the Zero-Remote-Deletion Invariant.
- Update `createWallet`, `updateWallet`, and `listWallets` in `src/services/wallet.ts`.
- Implement liquidity partitioning (`spendableCash` vs `lockedCash`) in `src/services/summary.ts`.
- Implement deterministic mathematical engine for `safeToSpend` and `dailySafeToSpend`.
- Implement soft-lock informational notices when spending from locked wallets in `record_transaction` and `transfer_funds`.
- Expose updated schemas via MCP tools (`manage_wallet`, `financial_summary`), MCP resources (`reedrich://wallets/list`), and REST endpoints (`GET /api/v1/wallets`, `GET /api/v1/summary`).
- Update MCP prompt templates (`daily_briefing`, `financial_planning`).

**Non-Goals:**
- Hard blocking or throwing errors on expense transactions targeting locked wallets.
- Automatic time-lock expiration timers or cron-based auto-unlocking.
- Third-party bank account integration.

---

## Decisions & Architectural Rationale

### 1. Soft Lock Architecture vs. Hard Lock

* **Context**: Should marking a wallet as "locked" prevent any outgoing expenses or transfers at the database/service layer?
* **Decision**: Implement **Soft Lock (Analytical Segregation with Informational Warning)**.
* **Rationale**:
  1. Financial reality: Users occasionally encounter genuine medical or familial emergencies where dipping into a locked emergency fund or breaking a time deposit is intentional and unavoidable.
  2. Flexibility: A hard lock would require users or agents to execute multiple round-trips (`unlock_wallet` -> `record_transaction` -> `relock_wallet`), introducing unnecessary friction.
  3. Non-breaking: Historical transaction records, recurring templates, and background jobs continue to operate without unexpected constraint errors.
* **Mechanics**:
  - If a user records an expense or outgoing transfer on a locked wallet (`wallet_is_locked = 1`), the transaction succeeds, balance reconciles normally, and the service response attaches `notice: "Notice: Recorded expense on locked wallet '<name>'. Protected capital reserve reduced."`.

---

### 2. D1 SQLite Column Type & Drizzle Schema Modeling

* **Context**: SQLite does not have a native boolean data type. How should the locked flag be modeled?
* **Decision**: Model `walletIsLocked` as an `integer("wallet_is_locked").notNull().default(0)`.
* **Rationale**:
  - Consistent with existing boolean flags in the repo (e.g. `transactionIsPlanned: integer("transaction_is_planned").notNull().default(0)`, `templateIsActive: integer("template_is_active").notNull().default(1)`).
  - Add composite index:
    ```ts
    index("wallets_user_locked_idx").on(table.walletUserId, table.walletIsLocked)
    ```
    This enables sub-millisecond edge lookups when partitioning spendable and locked wallets per user.
* **Migration Script (`drizzle/0006_add_wallet_lock.sql`)**:
  ```sql
  ALTER TABLE `wallets` ADD COLUMN `wallet_is_locked` integer DEFAULT 0 NOT NULL;
  --> statement-breakpoint
  CREATE INDEX IF NOT EXISTS `wallets_user_locked_idx` ON `wallets` (`wallet_user_id`, `wallet_is_locked`);
  ```
* **Zero-Remote-Deletion Invariant Compliance**:
  - `ALTER TABLE ... ADD COLUMN` with a constant default is strictly additive and non-destructive.
  - Remote production tables in Cloudflare D1 retain 100% of existing rows with `wallet_is_locked = 0`.

---

### 3. Liquidity Partitioning & Mathematical Formulation

* **Spendable Cash vs. Locked Cash**:
  - In `src/services/summary.ts`, iterate over fetched `walletsData`:
    ```ts
    const spendableByCurrency: Record<string, number> = {};
    const lockedByCurrency: Record<string, number> = {};

    for (const w of walletsData) {
      const isLocked = Number(w.walletIsLocked) === 1;
      const target = isLocked ? lockedByCurrency : spendableByCurrency;
      target[w.walletCurrency] = Number(((target[w.walletCurrency] || 0) + w.walletBalance).toFixed(2));
    }
    ```
  - Convert both `spendableByCurrency` and `lockedByCurrency` into `consolidatedSpendableTotal` and `consolidatedLockedTotal` using the active exchange rates and `resolvedBaseCurrency`.

* **Safe-to-Spend Formula**:
  $$\text{safeToSpend} = \text{consolidatedSpendableTotal} - (\text{plannedExpenses} + \text{recurringExpenses30Days} + \text{totalActiveDebt})$$

  - `plannedExpenses`: Sum of non-locked planned transactions scheduled within the remaining days of the period.
  - `recurringExpenses30Days`: Sum of cashflow projections with `type === 'expense'` within forward 30 days.
  - `totalActiveDebt`: Sum of `debtLoanRemainingAmount` for active debts (`debt_loan_type === 'debt'`).

* **Daily Safe-to-Spend**:
  $$\text{dailySafeToSpend} = \frac{\text{safeToSpend}}{\max(1, \text{remainingDays})}$$
  Where `remainingDays` is computed as days between today and the end of the active month (or `endDate` parameter).

---

### 4. Service Layer Interface Evolution

* In `src/services/wallet.ts`:
  - `CreateWalletParams`:
    ```ts
    export interface CreateWalletParams {
      name: unknown;
      institution?: unknown;
      type?: unknown;
      balance?: unknown;
      currency?: unknown;
      isLocked?: unknown;
    }
    ```
    Validation: If `isLocked !== undefined`, ensure `typeof isLocked === 'boolean' || isLocked === 0 || isLocked === 1`. Defaults to `0`.
  - `UpdateWalletParams`:
    ```ts
    export interface UpdateWalletParams {
      name?: unknown;
      institution?: unknown;
      type?: unknown;
      balance?: unknown;
      currency?: unknown;
      isLocked?: unknown;
    }
    ```
    Updates `walletIsLocked: isLocked ? 1 : 0` if provided.

* In `src/services/summary.ts`:
  Output structure extended with:
  ```ts
  {
    ...existingFields,
    spendableCash: {
      byCurrency: spendableByCurrency,
      estimatedTotal: Number(consolidatedSpendableTotal.toFixed(2)),
      currency: resolvedBaseCurrency
    },
    lockedCash: {
      byCurrency: lockedByCurrency,
      estimatedTotal: Number(consolidatedLockedTotal.toFixed(2)),
      currency: resolvedBaseCurrency
    },
    safeToSpend: Number(safeToSpend.toFixed(2)),
    dailySafeToSpend: Number(dailySafeToSpend.toFixed(2)),
    safeToSpendDetails: {
      remainingDays,
      plannedExpensesDeducted: Number(plannedExpensesTotal.toFixed(2)),
      recurringExpensesDeducted: Number(recurringExpensesTotal.toFixed(2)),
      activeDebtDeducted: Number(totalDebt.toFixed(2)),
      isDeficit: safeToSpend < 0
    }
  }
  ```

---

### 5. Multi-Tenancy & Edge Runtime Invariants

- **Multi-Tenant RLS**:
  All queries on `wallets` MUST enforce `eq(schema.wallets.walletUserId, userId)`.
  The composite index `(wallet_user_id, wallet_is_locked)` ensures RLS and lock filtering share a single index scan.
- **V8 Isolate Compatibility**:
  All math operations use native standard JavaScript `Number` and `Math` functions without external dependencies.
  Timezone calculations rely on existing `src/utils/date.ts` Web Standard date functions.

---

## Risks / Trade-offs

- **[Risk] Confusion between Net Worth and Spendable Cash**:
  Users might believe their net worth decreased when they see a lower `safeToSpend` number.
  -> *Mitigation*: Clearly preserve `consolidatedNetWorth` and `netWorthByCurrency` as top-level properties; present `spendableCash` and `lockedCash` as transparent sub-components.

- **[Risk] Negative Safe-to-Spend (Deficit Runway)**:
  If a user has 2M in spendable cash but 5M in upcoming bills, `safeToSpend` evaluates to `-3M`.
  -> *Mitigation*: Support negative `safeToSpend`, flag `isDeficit: true`, and guide AI prompts to suggest either unfreezing specific locked reserves or delaying planned expenditures.

- **[Risk] Test Runner Migration Inconsistency**:
  `tests/mcp.test.ts` uses `createTestDB()` with an in-memory `node:sqlite` instance reading `migrationFiles`.
  -> *Mitigation*: Ensure `0006_add_wallet_lock.sql` is appended to the `migrationFiles` array in `tests/mcp.test.ts`.
