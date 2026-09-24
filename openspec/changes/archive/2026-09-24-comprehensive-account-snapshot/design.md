## Context

See `proposal.md` for problem motivation and user scenarios.

Currently, Reedrich provides fine-grained MCP tools (`financial_summary`, `manage_wallet`, `list_transactions`, `manage_budget`, `manage_goal`, `manage_debt_loan`). AI planning agents often execute 5 to 6 tool turns sequentially to construct the current user balance and obligation state. 

This design establishes a dedicated snapshot architecture centered on a single domain service (`src/services/account-snapshot.ts`), an atomic MCP tool (`get_account_detail`), an authenticated REST endpoint (`GET /api/v1/account-detail`), and an optimized SQLite D1 Common Table Expression (CTE) to batch-resolve the latest mutation per wallet.

## Goals / Non-Goals

**Goals:**
- Implement transport-neutral `getAccountDetail(db, userId, params, fetchFn)` service returning a structured financial snapshot in < 50ms edge execution.
- Implement an efficient SQLite CTE with window function `ROW_NUMBER() OVER (PARTITION BY ... ORDER BY transaction_date DESC)` to retrieve the latest realized transaction for all wallets in a single query.
- Correctly resolve transaction direction (`in` vs `out`) for transfers, incomes, and expenses across both source and target wallets.
- Enrich `listWallets` and `manage_wallet(action: "list")` to include `lastTransaction` out-of-the-box.
- Expose `get_account_detail` MCP tool in `src/mcp.ts`.
- Expose `GET /api/v1/account-detail` in `src/routes/account-detail.ts` and document in `src/docs/openapi.ts`.

**Non-Goals:**
- Altering the mathematical formulas or output contracts of `financialSummary`: `financial_summary` remains unchanged for macro aggregates.
- Creating new database tables or running D1 schema migrations: fully utilizes existing tables and indexes.
- Performing any write mutations or balance adjustments.

## Decisions

### 1. Dedicated Service Module (`src/services/account-snapshot.ts`)
**Rationale:** Keeps domain responsibilities cleanly separated. `src/services/summary.ts` focuses on macro net worth, runways, and category percentages; `src/services/account-snapshot.ts` acts as the holistic situational aggregator combining wallets, transactions, budgets, goals, and debts.
**Alternatives Considered:**
- Adding a `snapshot: true` flag to `financialSummary`: Rejected because it would bloat `financialSummary`, mix two distinct response schemas, and risk regressions for existing consumers of the macro summary.

### 2. Batching Last Transaction via SQLite Window Function (CTE)
**Rationale:** A user may possess 10–20 wallets. Querying the last transaction wallet-by-wallet creates an N+1 problem (10–20 roundtrips to D1). Sorting all transactions in JS memory risks worker isolate memory exhaustion.
**Chosen Solution:** Execute a single query with a CTE that unpivots source and destination wallets, ranks them, and picks rank 1:
```sql
WITH WalletMutations AS (
  SELECT 
    t.transaction_id,
    t.transaction_wallet_id AS wallet_id,
    t.transaction_amount,
    t.transaction_type,
    CASE 
      WHEN t.transaction_type = 'income' THEN 'in'
      ELSE 'out'
    END AS direction,
    t.transaction_description,
    t.transaction_date,
    c.category_name
  FROM transactions t
  LEFT JOIN categories c ON t.transaction_category_id = c.category_id
  WHERE t.transaction_user_id = ? AND t.transaction_is_planned = 0
  
  UNION ALL
  
  SELECT 
    t.transaction_id,
    t.transaction_target_wallet_id AS wallet_id,
    t.transaction_amount,
    t.transaction_type,
    'in' AS direction,
    t.transaction_description,
    t.transaction_date,
    c.category_name
  FROM transactions t
  LEFT JOIN categories c ON t.transaction_category_id = c.category_id
  WHERE t.transaction_user_id = ? 
    AND t.transaction_is_planned = 0 
    AND t.transaction_target_wallet_id IS NOT NULL
),
Ranked AS (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY wallet_id ORDER BY transaction_date DESC) as rn
  FROM WalletMutations
)
SELECT * FROM Ranked WHERE rn = 1;
```
This handles:
- **Expenses**: Appears in branch 1 with `direction = 'out'`.
- **Incomes**: Appears in branch 1 with `direction = 'in'`.
- **Transfers**: Appears in branch 1 for sender (`direction = 'out'`) and branch 2 for receiver (`direction = 'in'`).

### 3. Parallel Independent Domain Queries with `Promise.all`
**Rationale:** The snapshot requires wallets, monthly cashflow, budgets, goals, debts, and FX rates. These reads have no interdependencies. Running them concurrently via `Promise.all` keeps the entire aggregation within one edge compute frame.

### 4. Zero Remote Schema Mutation
**Rationale:** In adherence to the Zero-Remote-Deletion Invariant and schema stability, no tables or columns are added or changed. The feature relies purely on Drizzle ORM queries and SQL expressions over existing indexed columns.

## Risks / Trade-offs

- **[Risk] High transaction volume impacting CTE execution time** ➔ *Mitigation:* The CTE filters immediately on indexed `transaction_user_id` and `transaction_is_planned = 0`. For individual users with thousands of transactions, SQLite index range scans on D1 execute in < 15ms.
- **[Risk] FX rate endpoint failure during snapshot** ➔ *Mitigation:* Reuses `getExchangeRates` with a 3-second timeout and immediate fallback to `FALLBACK_RATES_USD_BASE` in `src/utils/fx.ts`.
- **[Risk] Breaking existing consumers of `manage_wallet(list)`** ➔ *Mitigation:* `lastTransaction` is strictly additive. All existing fields (`walletId`, `walletName`, `walletBalance`, `walletCurrency`, `walletIsLocked`, etc.) remain identical.
