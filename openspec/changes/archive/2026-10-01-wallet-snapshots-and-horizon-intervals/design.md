## Context

See `proposal.md` for motivation and background.

Currently, Reedrich operates on PostgreSQL 16 via Cloudflare Hyperdrive. Wallets store a mutable counter `wallet_balance` updated atomically by realized transactions (`isPlanned = 0`). Planned transactions (`isPlanned = 1`) do not mutate `wallet_balance`.

However:
1. `GET /api/v1/wallets` and MCP `manage_wallet(action: 'list')` only read the current live `wallet_balance`.
2. Initial non-zero balances on `createWallet` do not insert an opening transaction row, leading to "ghost balances".
3. `GET /api/v1/analytics/horizon` computes roll-forward projections strictly on full calendar months (`YYYY-MM`), making payday cycles (e.g. 25th-to-24th) or non-calendar intervals impossible.

This design introduces a shared, pure mathematical ledger accumulator in `src/utils/ledger.ts`, unifies single-period wallet snapshots with multi-period horizon chains, and establishes the Zero Ghost Transaction invariant.

## Goals / Non-Goals

**Goals:**
- Provide a unified calculation engine where `wallet list = single period` and `horizon = multi-period chain`.
- Allow arbitrary date range (`startDate`, `endDate`) and status filtering (`realized`, `planned`, `all`) on wallet listings, returning a structured `snapshot` object.
- Revamp Horizon `periods` parameter to accept flexible 2D interval arrays `[[startDate, endDate], ...]`.
- Guarantee every wallet balance is 100% auditable via transactions by inserting an opening transaction on wallet creation and providing a safe, idempotent reconciliation backfill.

**Non-Goals:**
- Removing or mutating existing columns in `wallets` or `transactions`.
- Breaking backward compatibility for clients calling `GET /api/v1/wallets` without date parameters.
- Client-side or frontend UI rendering components.

## Decisions

### 1. Shared Pure Mathematical Ledger Engine (`src/utils/ledger.ts`)

- **Context**: Both wallet snapshots (single period) and horizon boards (multi-period) need to compute `initialBalance`, `totalIn`, `totalOut`, `periodDelta`, and `totalBalance`.
- **Decision**: Create `src/utils/ledger.ts` containing pure mathematical functions:
  * `calculateWalletPeriodSnapshot(startingBalances, transactions, periodStart, periodEnd, filter)`: Pure reducer taking wallet states and transaction slices, returning computed inflow, outflow, delta, and ending balances.
  * Zero side-effects, zero database dependencies, 100% testable with in-memory fixtures.
- **Alternatives Considered**: Duplicating query and accumulation logic inside `wallet.ts` and `horizon.ts`. Rejected: High risk of mathematical divergence between wallet listing and horizon board projections.

### 2. Baseline Anchoring Strategy for Timeline Calculations

- **Context**: When a user queries a future period (e.g. 2 months ahead) with `filter = 'all'` or `filter = 'planned'`, how should the starting balance be determined?
- **Decision**: Adopt **Baseline Anchoring**:
  * Anchored point is `now` with current live balance $B_{\text{live}}$ (all realized transactions to date).
  * For periods starting in the future ($T_{\text{start}} > \text{now}$):
    $$\text{initialBalance} = B_{\text{live}} + \sum_{\text{planned tx between now and } T_{\text{start}}} \Delta$$
  * For periods ending in the past ($T_{\text{end}} < \text{now}$):
    $$\text{endingBalance} = B_{\text{live}} - \sum_{\text{realized tx between } T_{\text{end}} \text{ and now}} \Delta$$
  * For `filter = 'planned'`: Uses a zero baseline ($0$) to represent pure budget cashflow impact without existing capital.
- **Rationale**: Eliminates the catastrophic bug where existing real capital is dropped when evaluating future planned roadmap periods.

### 3. Database Single-Pass Aggregation via PostgreSQL

- **Context**: In Cloudflare Workers edge environment, querying all historical transactions into memory to compute snapshots would exhaust memory and increase latency.
- **Decision**: Execute single-pass SQL aggregation with conditional `SUM(CASE WHEN ...)`:
  ```sql
  SELECT 
    w.wallet_id,
    COALESCE(SUM(CASE 
      WHEN t.transaction_type = 'income' AND t.transaction_wallet_id = w.wallet_id THEN (t.transaction_amount - t.transaction_admin_fee)
      WHEN t.transaction_type = 'expense' AND t.transaction_wallet_id = w.wallet_id THEN -(t.transaction_amount + t.transaction_admin_fee)
      WHEN t.transaction_type = 'transfer' AND t.transaction_wallet_id = w.wallet_id THEN -(t.transaction_amount + t.transaction_admin_fee)
      WHEN t.transaction_type = 'transfer' AND t.transaction_target_wallet_id = w.wallet_id THEN t.transaction_amount
      ELSE 0
    END), 0) AS period_delta
  FROM wallets w
  LEFT JOIN transactions t ON (t.transaction_wallet_id = w.wallet_id OR t.transaction_target_wallet_id = w.wallet_id)
    AND t.transaction_user_id = $userId
    AND t.transaction_date >= $periodStart AND t.transaction_date <= $periodEnd
    AND ($filterCondition)
  WHERE w.wallet_user_id = $userId
  GROUP BY w.wallet_id;
  ```
- **Rationale**: PostgreSQL calculates aggregation in < 2ms using the composite index `transactions_user_date_idx`.

### 4. 2D Date Interval Array Parser & Backward Normalizer

- **Context**: Horizon currently accepts `months: number` or `periods: string` ("2026-10,2026-11"). We need to support `periods: [[startDate, endDate], ...]`.
- **Decision**: Implement `normalizeHorizonPeriods(input: unknown): Array<{ startDate: string, endDate: string, periodKey: string }>`:
  * Accepts Array 2D: `[["2026-09-25", "2026-10-24"], ["2026-10-25", "2026-11-24"]]`.
  * Accepts JSON-encoded string: `'[["2026-09-25","2026-10-24"]]'` (for GET query parameters).
  * Accepts legacy comma-separated string: `'2026-10,2026-11'` (converted to full month boundaries).
  * Defaults to 6 consecutive calendar months starting from the current month if omitted.
  * Validates ISO format and ensures `startDate <= endDate` for every interval.
- **Rationale**: Completely unblocks non-calendar payday cycles while maintaining seamless compatibility with existing tools and API clients.

### 5. Zero Ghost Transaction Enforcement & Idempotent Backfill

- **Context**: When `createWallet` is called with `balance > 0`, no transaction row is currently inserted.
- **Decision**:
  1. In `createWallet`: When `cleanBalance > 0`, immediately insert an opening transaction:
     ```ts
     await db.insert(schema.transactions).values({
       transactionUserId: userId,
       transactionWalletId: newWalletId,
       transactionCategoryId: adjustmentCategory.categoryId,
       transactionAmount: cleanBalance,
       transactionAdminFee: 0,
       transactionType: "income",
       transactionDescription: `Initial balance: ${walletName.trim()}`,
       transactionIsPlanned: 0,
       transactionDate: nowIso,
     });
     ```
  2. Implement an idempotent reconciliation backfill utility `reconcileMissingOpeningBalances(db, userId)`:
     * Calculates `delta = wallet.walletBalance - SUM(existing realized transactions)`.
     * If `delta > 0.001`, inserts an opening balance transaction at `walletCreatedAt`.
     * Zero remote deletion, 100% additive.

## Risks / Trade-offs

- **[Risk: Heavy aggregation on accounts with 10,000+ transactions]** ➔ *Mitigation*: Aggregation utilizes PostgreSQL indexes on `(transaction_user_id, transaction_date)` and `(transaction_wallet_id)`. Timeouts capped at 5s.
- **[Risk: Breaking existing GET /api/v1/wallets consumers]** ➔ *Mitigation*: The `snapshot` object is strictly opt-in: returned only if `startDate`, `endDate`, or `filter` query parameter is present.
- **[Risk: Timezone ambiguity in date intervals]** ➔ *Mitigation*: All date strings are normalized via `src/utils/date.ts` to explicit UTC ISO-8601 timestamps (`T00:00:00.000Z` and `T23:59:59.999Z`).
- **[Risk: Double-counting opening balance on legacy wallets]** ➔ *Mitigation*: Reconciliation backfill calculates the exact mathematical delta between `wallet_balance` and `SUM(transactions)`. If the delta is 0, no transaction is created.
