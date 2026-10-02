## 1. Query Filtering in Service Layer

- [x] 1.1 Update `getAccountDetail` in `src/services/account-snapshot.ts` to filter budgets with temporal overlap conditions: `lte(budgetPeriodStart, periodEnd)` and `gte(budgetPeriodEnd, periodStart)`
- [x] 1.2 Update `getAccountDetail` in `src/services/account-snapshot.ts` to filter goals with active status: `eq(goalStatus, "in_progress")`

## 2. Tests & Verification

- [x] 2.1 Update and add unit tests in `tests/mcp.test.ts` verifying that non-overlapping budgets (past/future) and completed goals are excluded from `get_account_detail` and `GET /api/v1/account-detail`
- [x] 2.2 Run `npm run typecheck` to verify zero TypeScript compilation errors
- [x] 2.3 Run `npm test` to verify all unit tests pass with zero regressions
