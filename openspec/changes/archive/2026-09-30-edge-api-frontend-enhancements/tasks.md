## 1. Transaction Query Enhancements (Service & Route)

- [x] 1.1 Update `ListTransactionsFilters` interface in `src/services/transaction.ts` to include `q?: unknown`, `search?: unknown`, `status?: unknown`, `envelope?: unknown`, and accept string arrays or comma-delimited strings for `walletId`, `targetWalletId`, `categoryId`, and `budgetId`.
- [x] 1.2 Implement keyword search condition using SQL `LOWER(description) LIKE '%q%'` in `listTransactions`.
- [x] 1.3 Implement multi-value filtering parser and `inArray()` conditions for `walletId`, `targetWalletId`, `categoryId`, and `budgetId` in `listTransactions`.
- [x] 1.4 Implement `status` filter mapping (`realized` -> `isPlanned=0`, `planned` -> `isPlanned=1`, `all` -> no filter) in `listTransactions`.
- [x] 1.5 Implement concurrent total count query and return structured pagination metadata (`{ items, total, limit, offset, hasNext, totalPages }`) from `listTransactions`.
- [x] 1.6 Update `GET /api/v1/transactions` route in `src/routes/transactions.ts` to emit `X-Total-Count`, `X-Limit`, `X-Offset`, and `X-Has-Next-Page` headers on all responses, and conditionally return envelope payload when `?envelope=true`.
- [x] 1.7 Update MCP tool `list_transactions` declaration and handler in `src/mcp.ts` to accept `q`, `search`, `status`, and return structured `{ items, pagination }`.

## 2. Multi-Period Horizon Board Engine

- [x] 2.1 Create `src/services/horizon.ts` with `getHorizonProjections(db, userId, params, fetchFn)` implementing single-pass D1 data fetch and month-by-month roll-forward balance accumulation.
- [x] 2.2 Create `src/routes/horizon.ts` exposing `GET /api/v1/analytics/horizon` and mount it under `/analytics/horizon` in `src/routes/index.ts`.
- [x] 2.3 Add `get_horizon_projections` tool in `src/mcp.ts` tool registry and handler.

## 3. Documentation & OpenAPI Specifications

- [x] 3.1 Document `q`, `search`, `status`, `envelope`, and multi-value filter parameters on `GET /api/v1/transactions` in `src/docs/openapi.ts`.
- [x] 3.2 Document `GET /api/v1/analytics/horizon` path and schemas in `src/docs/openapi.ts`.
- [x] 3.3 Update `src/docs/llms.ts` to document enhanced transaction query options and the new Horizon Board analytics endpoint & MCP tool.
- [x] 3.4 Update `README.md` to reflect the 19 MCP tools and horizon board capabilities.

## 4. Tests & Verification

- [x] 4.1 Add unit tests in `tests/mcp.test.ts` for keyword search (`q`), multi-value filters (`inArray`), status aliases, pagination headers, and `?envelope=true`.
- [x] 4.2 Add unit tests in `tests/mcp.test.ts` for `GET /api/v1/analytics/horizon` verifying monthly cashflows, roll-forward balances, and goal milestone achievements.
- [x] 4.3 Add unit test in `tests/mcp.test.ts` for MCP tool `get_horizon_projections`.
- [x] 4.4 Run `npm run typecheck` to verify zero TypeScript static check errors.
- [x] 4.5 Run `npm test` to verify all unit tests pass with zero regressions.
- [x] 4.6 Run `npm run test:local` to verify full local E2E journey integrity.
