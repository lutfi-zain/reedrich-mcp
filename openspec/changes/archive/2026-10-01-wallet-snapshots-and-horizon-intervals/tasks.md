## 1. Pure Core Logic & Ledger Math Engine

- [x] 1.1 Create `src/utils/ledger.ts` implementing `calculateWalletPeriodSnapshot` with pure math accumulation for `initialBalance`, `totalIn`, `totalOut`, `periodDelta`, and `totalBalance` across `realized`, `planned`, and `all` filter modes
- [x] 1.2 Implement `normalizeHorizonPeriods(input)` in `src/utils/ledger.ts` supporting 2D arrays `[[startDate, endDate], ...]`, JSON-encoded strings, and legacy comma-separated `YYYY-MM` formats with UTC timestamp boundaries

## 2. Zero Ghost Transaction Enforcement & Backfill

- [x] 2.1 Update `createWallet` in `src/services/wallet.ts` to insert an opening transaction (`income`, `isPlanned: 0`, reserved `Adjustment` category) when `balance > 0`
- [x] 2.2 Implement `reconcileMissingOpeningBalances` in `src/services/wallet.ts` to detect and backfill missing opening balance transactions for existing wallets

## 3. Wallet List Snapshot & Filtering Engine

- [x] 3.1 Update `listWallets` in `src/services/wallet.ts` to accept `startDate`, `endDate`, and `filter` options, performing single-pass SQL aggregation and baseline anchoring
- [x] 3.2 Update `GET /api/v1/wallets` in `src/routes/wallets.ts` to parse query parameters (`startDate`, `endDate`, `filter`) and attach the structured `snapshot` object when present

## 4. Multi-Period Horizon Board 2D Intervals Revamp

- [x] 4.1 Refactor `getHorizonProjections` in `src/services/horizon.ts` to consume 2D interval periods, compute period-by-period chained balances, and support `filter` (`realized` / `planned` / `all`)
- [x] 4.2 Update `GET /api/v1/analytics/horizon` in `src/routes/horizon.ts` to parse 2D period array parameters from query or JSON body

## 5. MCP Tools & Documentation Registry

- [x] 5.1 Update `manage_wallet` tool in `src/mcp.ts` to accept `startDate`, `endDate`, and `filter` arguments on `action: 'list'`
- [x] 5.2 Update `get_horizon_projections` tool in `src/mcp.ts` input schema to accept 2D array `periods` and `filter`
- [x] 5.3 Update OpenAPI specifications in `src/docs/openapi.ts` for `/api/v1/wallets` and `/api/v1/analytics/horizon`
- [x] 5.4 Update API documentation in `src/docs/llms.ts` and `README.md` reflecting snapshot objects and 2D interval horizon capabilities

## 6. Unit & Integration Tests Verification

- [x] 6.1 Add unit tests in `tests/mcp.test.ts` for zero ghost transaction creation on `manage_wallet(action: 'create')`
- [x] 6.2 Add unit tests in `tests/mcp.test.ts` for wallet snapshots across `realized`, `planned`, and `all` filters on `manage_wallet(action: 'list')` and `GET /api/v1/wallets`
- [x] 6.3 Add unit tests in `tests/mcp.test.ts` for 2D interval horizon board projections, including non-calendar payday cycle scenarios
- [x] 6.4 Run `npm run typecheck` to verify zero TypeScript compilation errors
- [x] 6.5 Run `npm test` to verify all unit tests pass with zero regressions
