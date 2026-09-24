## 1. Core Service & Window Query

- [x] 1.1 Implement window function helper in `src/services/wallet.ts` using SQLite CTE to fetch the latest realized transaction per wallet with correct direction (`in` vs `out`) for transfers, incomes, and expenses.
- [x] 1.2 Enrich `listWallets` in `src/services/wallet.ts` to attach `lastTransaction` to each returned wallet object out-of-the-box.
- [x] 1.3 Create `src/services/account-snapshot.ts` implementing transport-neutral `getAccountDetail(db, userId, params, fetchFn)` parallelizing net worth, partitioned wallets, monthly cashflow, budgets, goals, and obligations.

## 2. Transport Adapters (MCP & REST)

- [x] 2.1 Register `get_account_detail` MCP tool in `src/mcp.ts` with typed input parameters and formatted snapshot response.
- [x] 2.2 Create thin Hono route handler in `src/routes/account-detail.ts` calling `getAccountDetail` and mount at `GET /api/v1/account-detail` in `src/index.ts`.
- [x] 2.3 Document `GET /api/v1/account-detail` endpoint and snapshot response schema in `src/docs/openapi.ts`.

## 3. Tests & Verification

- [x] 3.1 Add unit tests in `tests/mcp.test.ts` verifying `manage_wallet(action: "list")` returns `lastTransaction`, handles transfer direction (`in`/`out`) correctly, and returns `null` for wallets without transactions.
- [x] 3.2 Add unit tests in `tests/mcp.test.ts` for `get_account_detail` verifying default current-month dates, custom date ranges, currency conversions, spendable vs locked partitioning, budget/goal/debt aggregation, and malformed date rejection.
- [x] 3.3 Add E2E user journey step in `tests/integration.test.ts` verifying `get_account_detail` against a running server.
- [x] 3.4 Run static type check via `npm run typecheck` to verify zero type errors.
- [x] 3.5 Run unit tests via `npm test` to verify all tests pass against in-memory mock D1.
- [x] 3.6 Run `npm run test:local` (full E2E user journey against local D1 dev server) as pre-archive gate.
