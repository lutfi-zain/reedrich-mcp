## 1. Core Service Layer Ordering

- [x] 1.1 Update `getHorizonProjections` in `src/services/horizon.ts` to sort each period's `walletBalances` array in descending order by converted balance in `baseCurrency`, with raw `balance` descending and `walletId` ascending as deterministic tie-breakers.
- [x] 1.2 Update `getAccountDetail` in `src/services/account-snapshot.ts` to sort `wallets.spendable.items` and `wallets.locked.items` in descending order by converted balance in `baseCurrency`, with raw `balance` descending and `walletId` ascending as deterministic tie-breakers.
- [x] 1.3 Update `listWallets` in `src/services/wallet.ts` to order the Drizzle query by `desc(schema.wallets.walletBalance), asc(schema.wallets.walletId)` (and sort by `snapshot.totalBalance` descending when snapshot parameters are active) and update the `reedrich://wallets/list` MCP resource query in `src/mcp.ts` with the same `orderBy` clause.

## 2. Documentation & OpenAPI Contract Synchronization

- [x] 2.1 Update `HorizonBoard`, `AccountDetail`, and `/api/v1/wallets` descriptions in `src/docs/openapi.ts` and `src/docs/llms.ts` to document deterministic descending wallet balance ordering.

## 3. Tests & Verification

- [x] 3.1 Add unit/integration tests in `tests/mcp.test.ts` verifying that `GET /api/v1/analytics/horizon` (and MCP tool `get_horizon_projections`) returns `periods[].walletBalances[]` sorted by balance descending, dynamically re-ranks wallets across roll-forward periods when planned cashflows invert balances, and ranks multi-currency wallets by `baseCurrency` converted value.
- [x] 3.2 Add unit/integration tests in `tests/mcp.test.ts` verifying descending wallet balance ordering in `GET /api/v1/account-detail` (`wallets.spendable.items` and `wallets.locked.items`) and `GET /api/v1/wallets` (including after balance-mutating transactions on local test DB).
- [x] 3.3 Run `npm run typecheck` and `npm test` against the local test environment (strictly avoiding any destructive queries on remote databases) and verify zero errors and zero regressions.
