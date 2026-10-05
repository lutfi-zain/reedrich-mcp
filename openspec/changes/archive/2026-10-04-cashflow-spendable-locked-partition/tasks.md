## 1. Core Service Layer Cashflow Partitioning

- [x] 1.1 Update `PeriodProjection` and `getHorizonProjections` in `src/services/horizon.ts` to compute and return `netSpendable` and `netLocked` inside each period's `cashflow` object.
- [x] 1.2 Update `AccountDetailResult` and `getAccountDetail` in `src/services/account-snapshot.ts` to compute and return `netSpendable` and `netLocked` inside `monthlyCashFlow`.
- [x] 1.3 Update `financialSummary` in `src/services/summary.ts` to compute and return `netSpendable` and `netLocked` alongside `netSavings`.

## 2. Documentation & OpenAPI Contract Synchronization

- [x] 2.1 Update `HorizonBoard`, `AccountDetail`, and `FinancialSummary` schemas and endpoint descriptions in `src/docs/openapi.ts` and `src/docs/llms.ts` to include `netSpendable` and `netLocked`.

## 3. Tests & Verification

- [x] 3.1 Add unit/integration tests in `tests/mcp.test.ts` verifying `periods[].cashflow.netSpendable` and `periods[].cashflow.netLocked` on `GET /api/v1/analytics/horizon` (and MCP tool `get_horizon_projections`), including transfers from spendable to locked wallets and the conservation invariant `netSpendable + netLocked == net`.
- [x] 3.2 Add unit/integration tests in `tests/mcp.test.ts` verifying `netSpendable` and `netLocked` in `GET /api/v1/account-detail` (`monthlyCashFlow`) and `GET /api/v1/summary` (`financial_summary`).
- [x] 3.3 Run `npm run typecheck` and `npm test` against the local test environment (strictly avoiding any destructive queries on remote databases) and verify zero errors and zero regressions.
