## 1. Pure Core Logic & Budget Pacing Engine

- [x] 1.1 Create `src/utils/budgets.ts` implementing `calculateBudgetMetrics` with `upcoming`, `on_track`, `warning`, `exceeded`, and `completed` status evaluation, `daysRemaining`, and `dailyAllowance`

## 2. Service Layer Enrichment & Cashflow Accounting Alignment

- [x] 2.1 Update `src/services/budget.ts` (`budgetStatus`, `getBudgetById`) to include `periodStart`, `periodEnd`, `categoryId`, `status`, `daysRemaining`, `dailyAllowance`, and accurate admin fee addition
- [x] 2.2 Update `getAccountDetail` in `src/services/account-snapshot.ts` to enrich `budgets` with `periodStart`, `periodEnd`, `categoryId`, accurate date-bounded spending, and new pacing status
- [x] 2.3 Update `getAccountDetail` in `src/services/account-snapshot.ts` to enrich `goals` with `targetDate`, `currency`, `status`, `requiredMonthlySavings`, and `isReached`
- [x] 2.4 Update `getAccountDetail` in `src/services/account-snapshot.ts` to enrich `obligations` with original principal `amount`, `type`, `walletId`, and `notes`
- [x] 2.5 Align `monthlyCashFlow` in `src/services/account-snapshot.ts` to properly account for `adminFee` and exclude opening balances

## 3. OpenAPI Specifications & Documentation

- [x] 3.1 Update `src/docs/openapi.ts` to define concrete schema properties for `budgets`, `goals`, and `obligations` in `AccountDetail`
- [x] 3.2 Update `src/docs/llms.ts` and `README.md` documenting enriched fields in `get_account_detail` and `GET /api/v1/account-detail`

## 4. Tests & Verification

- [x] 4.1 Update and add unit tests in `tests/mcp.test.ts` verifying enriched budget fields (`periodStart`, `periodEnd`, `status`), goal fields, obligation fields, and cashflow fees in `get_account_detail`
- [x] 4.2 Run `npm run typecheck` to verify zero TypeScript compilation errors
- [x] 4.3 Run `npm test` to verify all unit tests pass with zero regressions
