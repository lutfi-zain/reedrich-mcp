## 1. Single-Resource Retrieval Services & Routes

- [x] 1.1 Implement single-item retrieval services (`getWalletById`, `getCategoryById`, `getBudgetById`, `getTransactionById`, `getDebtLoanById`, `getGoalById`, `getRecurringTemplateById`) across their respective service modules.
- [x] 1.2 Add `GET /:id` route handlers in `src/routes/wallets.ts`, `categories.ts`, `budgets.ts`, `transactions.ts`, `debts-loans.ts`, `goals.ts`, and `recurring-templates.ts`.

## 2. Category, Budget & Profile Mutation Services & Routes

- [x] 2.1 Implement `updateCategory(db, userId, categoryId, params)` in `src/services/category.ts` with system Adjustment protection, and add `PATCH /:categoryId` in `src/routes/categories.ts`.
- [x] 2.2 Implement `updateBudget(db, userId, budgetId, params)` in `src/services/budget.ts` with live utilization recalculation, and add `PATCH /:budgetId` in `src/routes/budgets.ts`.
- [x] 2.3 Implement `updateUserProfile(db, userId, params)` in `src/services/user.ts` (firstName, lastName, whatsappNumber), and add `PATCH /` in `src/routes/me.ts`.

## 3. Entity Deletion Services & Routes

- [x] 3.1 Implement `deleteWallet(db, userId, walletId)` in `src/services/wallet.ts` with balance zero-guard and active link guards, and add `DELETE /:walletId` in `src/routes/wallets.ts`.
- [x] 3.2 Implement `deleteCategory(db, userId, categoryId)` in `src/services/category.ts` with system Adjustment protection, and add `DELETE /:categoryId` in `src/routes/categories.ts`.
- [x] 3.3 Implement `deleteBudget(db, userId, budgetId)` in `src/services/budget.ts`, and add `DELETE /:budgetId` in `src/routes/budgets.ts`.
- [x] 3.4 Implement `deleteDebtLoan(db, userId, debtLoanId)` in `src/services/debt-loan.ts`, and add `DELETE /:debtLoanId` in `src/routes/debts-loans.ts`.

## 4. MCP Tools Registry & Handlers Parity
- [x] 4.1 Update `manage_wallet` tool schema and execution handler in `src/mcp.ts` with action `"delete"`.
- [x] 4.2 Update `manage_category` tool schema and execution handler in `src/mcp.ts` with actions `"update"` and `"delete"`.
- [x] 4.3 Update `manage_budget` tool schema and execution handler in `src/mcp.ts` with actions `"update"` and `"delete"`.
- [x] 4.4 Update `manage_debt_loan` tool schema and execution handler in `src/mcp.ts` with action `"delete"`.

## 5. Documentation
- [x] 5.1 Document all 14 new endpoints (`GET /:id`, `PATCH`, `DELETE`) in `src/docs/openapi.ts`.
- [x] 5.2 Update REST API directory and MCP tool action references in `src/docs/llms.ts`.
- [x] 5.3 Update project `README.md` with complete API routes, lifecycle capabilities, and financial guards overview.

## 6. Tests & Verification

- [x] 6.1 Add unit tests in `tests/mcp.test.ts` covering single-item retrieval, mutations, deletions, and guard validations across all entities.
- [x] 6.2 Add E2E assertions in `tests/integration.test.ts` covering the new retrieval, mutation, and deletion flows.
- [x] 6.3 Run static type check via `npm run typecheck` to verify zero type errors.
- [x] 6.4 Run test suite via `npm test` to verify all unit tests pass.
- [x] 6.5 Run `npm run test:local` to verify full local E2E user journey against local D1 dev server.
