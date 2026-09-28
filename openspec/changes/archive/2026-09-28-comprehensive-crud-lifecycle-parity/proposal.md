## Why

While Reedrich provides listing and creation for most financial entities, the API and MCP tool interfaces suffer from severe lifecycle asymmetries:
1. **Deletion Gap**: Wallets, Categories, Budgets, and Debts/Loans cannot be deleted once created.
2. **Mutation Gap**: Categories cannot be renamed or assigned new icons; Budgets cannot adjust limits or timeframes; User Profiles cannot update names or phone numbers.
3. **Retrieval Gap**: Zero entities support direct individual lookup by identifier (`GET /:id`), forcing frontend dashboards and mobile apps to fetch full unbounded lists and perform linear scans client-side.

Closing all these gaps establishes a complete, predictable, and production-grade CRUD lifecycle across both REST API and MCP tool surfaces, accompanied by strict financial invariants (balance checks and system category protections).

## What Changes

- **Single-Resource Retrieval (`GET /:id`)**:
  - Implement direct item fetch across all 7 domain resources:
    * `GET /api/v1/wallets/:walletId`
    * `GET /api/v1/categories/:categoryId`
    * `GET /api/v1/budgets/:budgetId`
    * `GET /api/v1/transactions/:transactionId`
    * `GET /api/v1/debts-loans/:debtLoanId`
    * `GET /api/v1/goals/:goalId`
    * `GET /api/v1/recurring-templates/:templateId`
- **Entity Mutation Parity (`PATCH`)**:
  - `PATCH /api/v1/categories/:categoryId` & `manage_category(action: "update")` to update category name and icon.
  - `PATCH /api/v1/budgets/:budgetId` & `manage_budget(action: "update")` to adjust budget name, target amount, date window, or linked category.
  - `PATCH /api/v1/me` to update authenticated user's first name, last name, or WhatsApp contact number.
- **Entity Deletion Lifecycle (`DELETE`)**:
  - `DELETE /api/v1/wallets/:walletId` & `manage_wallet(action: "delete")`:
    * Financial guard: rejects deletion if wallet balance != 0 (user must zero out or transfer funds first).
    * Link guard: rejects deletion if actively linked to non-completed goals or recurring templates.
  - `DELETE /api/v1/categories/:categoryId` & `manage_category(action: "delete")`:
    * System protection: rejects deletion of protected system category `"Adjustment"`.
    * Foreign keys cascade safely: existing transactions and budgets retain history with category set to null.
  - `DELETE /api/v1/budgets/:budgetId` & `manage_budget(action: "delete")`: deletes budget definition without deleting transaction records.
  - `DELETE /api/v1/debts-loans/:debtLoanId` & `manage_debt_loan(action: "delete")`: deletes liability/receivable record.
- **Documentation & Verification**:
  - Update OpenAPI specification (`src/docs/openapi.ts`) with all 14 new endpoints (7 GET, 3 PATCH, 4 DELETE).
  - Update LLM manifest (`src/docs/llms.ts`), project README.md, and CHANGELOG.md.
  - Comprehensive unit test suite in `tests/mcp.test.ts` and end-to-end integration tests in `tests/integration.test.ts`.

## Capabilities

### New Capabilities
- `single-resource-retrieval`: Behavior contract for fetching individual domain entities by UUID across Wallets, Categories, Budgets, Transactions, Debts/Loans, Goals, and Recurring Templates.
- `entity-mutation-parity`: Behavior contract for updating Category definitions, Budget allocations, and User profile metadata.
- `entity-deletion-lifecycle`: Behavior contract for deleting Wallets, Categories, Budgets, and Debts/Loans with financial guards (balance != 0 check, system category protection).

### Modified Capabilities
- None. Existing endpoints retain backward compatibility.

## Non-Goals

- No bulk/batch deletion or update APIs.
- No schema migrations; existing tables and foreign key constraints (`ON DELETE SET NULL`, `ON DELETE CASCADE`) are fully utilized.
- No public user lookup; all queries are strictly multi-tenant scoped to `userId`.

## Impact

- **Services**:
  - `src/services/wallet.ts`: add `getWalletById`, `deleteWallet`.
  - `src/services/category.ts`: add `getCategoryById`, `updateCategory`, `deleteCategory`.
  - `src/services/budget.ts`: add `getBudgetById`, `updateBudget`, `deleteBudget`.
  - `src/services/debt-loan.ts`: add `getDebtLoanById`, `deleteDebtLoan`.
  - `src/services/goal.ts`: add `getGoalById`.
  - `src/services/recurring.ts`: add `getRecurringTemplateById`.
  - `src/services/transaction.ts`: add `getTransactionById`.
  - `src/services/user.ts`: add `updateUserProfile`.
- **Routes**:
  - `src/routes/wallets.ts`: add `GET /:walletId`, `DELETE /:walletId`.
  - `src/routes/categories.ts`: add `GET /:categoryId`, `PATCH /:categoryId`, `DELETE /:categoryId`.
  - `src/routes/budgets.ts`: add `GET /:budgetId`, `PATCH /:budgetId`, `DELETE /:budgetId`.
  - `src/routes/transactions.ts`: add `GET /:transactionId`.
  - `src/routes/debts-loans.ts`: add `GET /:debtLoanId`, `DELETE /:debtLoanId`.
  - `src/routes/goals.ts`: add `GET /:goalId`.
  - `src/routes/recurring-templates.ts`: add `GET /:templateId`.
  - `src/routes/me.ts`: add `PATCH /`.
- **MCP Server**:
  - `src/mcp.ts`: update `manage_wallet`, `manage_category`, `manage_budget`, `manage_debt_loan` with new actions.
- **Docs**: `README.md`, `src/docs/openapi.ts`, `src/docs/llms.ts`, `CHANGELOG.md`.
