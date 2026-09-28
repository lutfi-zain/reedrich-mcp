## Context

Reedrich-MCP exposes domain entities via Hono REST routes and MCP tools. Prior iterations created list and create operations, but left several entities without single-resource retrieval (`GET /:id`), update (`PATCH`), or deletion (`DELETE`) paths. This design establishes the technical contracts, multi-tenant queries, and financial invariants needed to achieve full CRUD lifecycle parity across the system. See `proposal.md` for background.

## Goals / Non-Goals

**Goals:**
- Provide single-entity retrieval (`getById`) for all 7 domain resources in services and REST routes.
- Implement missing mutation handlers (`updateCategory`, `updateBudget`, `updateUserProfile`).
- Implement missing deletion handlers (`deleteWallet`, `deleteCategory`, `deleteBudget`, `deleteDebtLoan`) with strict financial guards.
- Expand MCP tools (`manage_wallet`, `manage_category`, `manage_budget`, `manage_debt_loan`) to support `"delete"` and `"update"` actions.
- Update OpenAPI specification, LLM manifest, and README.md.

**Non-Goals:**
- No database migrations; existing D1 SQLite schemas, foreign key cascade options (`ON DELETE CASCADE`, `ON DELETE SET NULL`), and indexes are preserved.
- No bulk/batch deletion or update APIs.
- User email and credentials remain strictly immutable.

## Decisions

### 1. Single-Item Retrieval Pattern (`getById`)

**Decision**: Export dedicated `get<Entity>ById(db, userId, id)` functions across all service modules:
- `getWalletById(db, userId, walletId)` in `src/services/wallet.ts`
- `getCategoryById(db, userId, categoryId)` in `src/services/category.ts`
- `getBudgetById(db, userId, budgetId)` in `src/services/budget.ts` (recalculating live utilization)
- `getTransactionById(db, userId, transactionId)` in `src/services/transaction.ts`
- `getDebtLoanById(db, userId, debtLoanId)` in `src/services/debt-loan.ts`
- `getGoalById(db, userId, goalId, fetchFn?)` in `src/services/goal.ts` (attaching derived progress)
- `getRecurringTemplateById(db, userId, templateId)` in `src/services/recurring.ts`

**Rationale**: Every function enforces `and(eq(table.id, cleanId), eq(table.userId, userId))` and throws `notFound(Entity, cleanId)` on missing or cross-tenant records, which the centralized error handler converts to HTTP `404`.

### 2. Wallet Deletion Guard & Integrity Invariant

**Decision**: `deleteWallet(db, userId, walletId)` implements strict preconditions before executing `DELETE FROM wallets`:
1. **Balance Zero Guard**: If `Math.abs(wallet.walletBalance) > 0.001`, throw `validationError("Wallet balance must be 0 before deletion. Please transfer or adjust remaining funds first.", "walletBalance")`.
2. **Active Goal Link Guard**: Check `goalWallets` joined with `goals` where `goalUserId == userId` and `goalStatus == 'in_progress'`. If linked, throw `validationError("Cannot delete wallet linked to active goals. Unlink the wallet from goals first.", "walletId")`.
3. **Active Recurring Template Guard**: Check `recurringTemplates` where `templateUserId == userId` and `templateIsActive == 1` and `templateWalletId == walletId`. If found, throw `validationError("Cannot delete wallet linked to active recurring templates. Deactivate or reassign templates first.", "walletId")`.

**Rationale**: Protects user balances and financial plans from accidental destruction while allowing clean retirement of emptied accounts.

### 3. Category System Protection & Update Mechanics

**Decision**:
- `updateCategory(db, userId, categoryId, params)`: accepts `name` and `icon`. If category is `"Adjustment"`, rejects renaming.
- `deleteCategory(db, userId, categoryId)`: if category is `"Adjustment"`, rejects deletion with `VALIDATION`.
- Foreign key handling: SQLite schema specifies `ON DELETE SET NULL` on `transactions.transaction_category_id` and `budgets.budget_category_id`. Transactions and budgets retain historical validity with category unlinked.

### 4. Budget Update & Deletion Mechanics

**Decision**:
- `updateBudget(db, userId, budgetId, params)`: updates `name`, `amount`, `periodStart`, `periodEnd`, and `categoryId` (or null). Returns updated budget with recalculated utilization.
- `deleteBudget(db, userId, budgetId)`: deletes the budget record. Existing transactions retain history with `transactionBudgetId = null` (`ON DELETE SET NULL`).

### 5. Debt/Loan Deletion Mechanics

**Decision**:
- `deleteDebtLoan(db, userId, debtLoanId)`: verifies ownership and deletes the record from `debts_loans`.

### 6. User Profile Mutation (`PATCH /api/v1/me`)

**Decision**:
- `updateUserProfile(db, userId, params)` in `src/services/user.ts`:
  - Accepts `firstName`, `lastName`, `whatsappNumber`.
  - Rejects invalid phone formats or string lengths exceeding 100 chars.
  - Rejects attempts to pass `email` or `userApiKeyHash`.
  - Returns updated `UserProfileDTO`.

### 7. MCP Tool Action Mapping

**Decision**: Extend existing MCP tool registries in `src/mcp.ts`:
- `manage_wallet`: add `"delete"` to action enum (`walletId` required).
- `manage_category`: add `"update"` (`categoryId` required, optional `name`, `icon`) and `"delete"` (`categoryId` required).
- `manage_budget`: add `"update"` (`budgetId` required, optional params) and `"delete"` (`budgetId` required).
- `manage_debt_loan`: add `"delete"` (`debtLoanId` required).

## Risks / Trade-offs

- **[Risk] Deleting Wallet with Cascade Transaction Delete** -> The balance guard requires `walletBalance == 0` and link guards ensure no active goals or recurring templates depend on it. Users can retire old empty wallets safely without corrupting net worth.
- **[Risk] Deleting Category Used in Calculations** -> `ON DELETE SET NULL` cascades automatically at the database level. Queries using `LEFT JOIN` or category ID filters tolerate null categories gracefully.
- **[Risk] Multiple Concurrent Route Updates** -> All updates use Drizzle query builders with explicit where clauses scoped to `userId` and target entity ID.
