## 1. Core Service Layer Goal Ordering

- [x] 1.1 Update `getHorizonProjections` in `src/services/horizon.ts` to sort each period's `goals` array in descending order by projected `currentAmount` converted to `baseCurrency`, with raw `currentAmount` descending and `goalId` ascending as deterministic tie-breakers.
- [x] 1.2 Update `getAccountDetail` in `src/services/account-snapshot.ts` to sort `goals` in descending order by `currentAmount` converted to `baseCurrency` (with raw `currentAmount` descending and `goalId` ascending as tie-breakers) and sort `linkedWalletsBreakdown` by `convertedAmount` descending.
- [x] 1.3 Update `financialSummary` in `src/services/summary.ts` to sort `activeGoals` in descending order by `goalCurrentAmount` converted to `baseCurrency` (with raw `goalCurrentAmount` descending and `goalId` ascending as tie-breakers) and sort `linkedWallets` by `convertedAmount` descending.
- [x] 1.4 Update `listGoals` and `attachDerivedProgress` in `src/services/goal.ts` to sort returned goals by evaluated `goalCurrentAmount` descending (with `goalId` ascending tie-breaker) and sort `linkedWallets` by `convertedAmount` descending.

## 2. Documentation & OpenAPI Contract Synchronization

- [x] 2.1 Update `HorizonBoard`, `AccountDetail`, `FinancialSummary`, and `/api/v1/goals` descriptions in `src/docs/openapi.ts` and `src/docs/llms.ts` to document deterministic descending goal `currentAmount` ordering.

## 3. Tests & Verification

- [x] 3.1 Add unit/integration tests in `tests/mcp.test.ts` verifying that `GET /api/v1/analytics/horizon` (and MCP tool `get_horizon_projections`) returns `periods[].goals[]` sorted by `currentAmount` descending and dynamically re-ranks goals across roll-forward periods when planned cashflows into linked wallets invert accumulated goal amounts.
- [x] 3.2 Add unit/integration tests in `tests/mcp.test.ts` verifying descending goal `currentAmount` ordering across `GET /api/v1/account-detail`, `GET /api/v1/summary`, and `GET /api/v1/goals`.
- [x] 3.3 Run `npm run typecheck` and `npm test` against the local test environment (strictly avoiding any destructive queries on remote databases) and verify zero errors and zero regressions.
