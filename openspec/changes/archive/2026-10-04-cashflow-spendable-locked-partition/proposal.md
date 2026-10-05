## Why

When clients inspect periodic cashflow projections on `GET /api/v1/analytics/horizon` (and MCP tool `get_horizon_projections`), `GET /api/v1/account-detail` (`monthlyCashFlow`), or `GET /api/v1/summary` (`financial_summary`), the existing `net` / `netSavings` field only reports `income - expense`. Because internal transfers from spendable wallets (`isLocked = 0`) to locked savings/investment wallets (`isLocked = 1`) are not external expenses (aside from `adminFee`), `cashflow.net` overstates how much liquid spendable cash actually remains from that period's cashflow, while `netWorth.spendable` and `netWorth.locked` are cumulative running balances that mix in prior periods' balances. Adding `netSpendable` and `netLocked` to period cashflow objects exposes the exact single-period liquidity delta for spendable versus locked wallets.

## What Changes

- **Horizon Board Period Cashflow Partitioning (`GET /api/v1/analytics/horizon`, `POST /api/v1/analytics/horizon`, `GET /api/v1/horizon`, MCP tool `get_horizon_projections`)**:
  - Add `netSpendable` and `netLocked` (`camelCase` numbers) to each `periods[].cashflow` object alongside `income`, `expense`, and `net`.
  - Compute `netSpendable` as the net period movement across unlocked wallets (`walletIsLocked = 0`) in `baseCurrency`: spendable incomes minus spendable expenses (including admin fees), minus outward transfers from spendable wallets (including admin fees), plus inward transfers into spendable wallets.
  - Compute `netLocked` as the net period movement across locked wallets (`walletIsLocked = 1`) in `baseCurrency`: locked incomes minus locked expenses (including admin fees), minus outward transfers from locked wallets (including admin fees), plus inward transfers into locked wallets.
- **Account Snapshot Monthly Cashflow Partitioning (`GET /api/v1/account-detail`, MCP tool `get_account_detail`)**:
  - Add `netSpendable` and `netLocked` to `monthlyCashFlow` alongside `totalIncome`, `totalExpense`, and `netSavings`.
- **Financial Summary Cashflow Partitioning (`GET /api/v1/summary`, MCP tool `financial_summary`)**:
  - Add `netSpendable` and `netLocked` to the top-level summary payload alongside `totalIncome`, `totalExpense`, and `netSavings`.
- **Documentation & OpenAPI Contract Synchronization (`src/docs/openapi.ts`, `src/docs/llms.ts`)**:
  - Update `HorizonBoard`, `AccountDetail`, and `FinancialSummary` schemas and endpoint descriptions to document `netSpendable` and `netLocked`.
- **Database Schema Changes**:
  - None. No new tables, columns, or migrations are required.
- **Breaking Changes**:
  - None. Purely additive fields (`netSpendable`, `netLocked`) on existing cashflow objects.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `multi-period-horizon`: (`openspec/specs/multi-period-horizon/spec.md`) Require `periods[].cashflow` to include `netSpendable` and `netLocked` representing the period-specific net cashflow delta for spendable (`walletIsLocked = 0`) and locked (`walletIsLocked = 1`) wallets including internal transfers.
- `account-snapshot`: (`openspec/specs/account-snapshot/spec.md`) Require `monthlyCashFlow` to include `netSpendable` and `netLocked` alongside `totalIncome`, `totalExpense`, and `netSavings`.
- `rest-api-read`: (`openspec/specs/rest-api-read/spec.md`) Require `GET /api/v1/summary` (and `financial_summary`) to include `netSpendable` and `netLocked`.

## Impact

- **Non-Goals**:
  - Reclassifying internal transfers as external `expense` or `income` in `cashflow.expense` or `cashflow.income` (which would distort actual spending analytics).
  - Changing wallet balance reconciliation or `Safe-to-Spend` runway formulas.
- **Security & Multi-Tenancy**:
  - All wallet and transaction lookups remain strictly scoped to the authenticated `userId` (`eq(schema.wallets.walletUserId, userId)` and `eq(schema.transactions.transactionUserId, userId)`).
- **Performance Impact on Cloudflare Workers Edge Environment**:
  - Zero additional database queries or FX network calls: `walletsById` and `fxRates` are already loaded in memory in `horizon`, `account-snapshot`, and `summary`, so partitioning `netSpendable` and `netLocked` is an $O(1)$ per-transaction accumulator update inside the existing loop.
