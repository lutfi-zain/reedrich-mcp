## 1. Foundation — Service Errors & Auth

- [x] 1.1 Create `src/services/errors.ts` with `ServiceError` class, `ServiceErrorCode` type, and convenience throwers (`validationError`, `notFound`, `unauthorized`, `forbidden`, `conflict`)
- [x] 1.2 Create `src/middleware/auth.ts` with `resolveUserId(db, secret, opts)` function implementing unified credential resolution (bearer token → header key → query param → tool args, with API key prefix → OAuth JWT → legacy JWT → fallback hash for each candidate)
- [x] 1.3 Create `src/middleware/observability.ts` with Hono middleware for request ID generation/propagation (`X-Request-ID`) and request timing (`X-Response-Time`)
- [x] 1.4 Wire observability middleware as first `app.use('*', ...)` in `src/index.ts` (before CORS, before auth)
- [x] 1.5 Run `npm run typecheck` to verify foundation compiles cleanly

## 2. Service Extraction — Read Functions

- [x] 2.1 Create `src/services/wallet.ts` — extract `listWallets(db, userId)` from `manage_wallet` action `"list"` in `mcp.ts`
- [x] 2.2 Create `src/services/category.ts` — extract `listCategories(db, userId)` from `manage_category` action `"list"` in `mcp.ts`
- [x] 2.3 Create `src/services/budget.ts` — extract `listBudgets(db, userId)` and `budgetStatus(db, userId)` from `manage_budget` actions `"list"` and `"status"` in `mcp.ts`
- [x] 2.4 Create `src/services/transaction.ts` — extract `listTransactions(db, userId, filters)` from `list_transactions` in `mcp.ts` (with walletId, categoryId, budgetId, type, isPlanned, startDate, endDate, limit, offset params)
- [x] 2.5 Create `src/services/debt-loan.ts` — extract `listDebtsLoans(db, userId)` from `manage_debt_loan` action `"list"` in `mcp.ts`
- [x] 2.6 Create `src/services/goal.ts` — extract `listGoals(db, userId, statusFilter?)` from `manage_goal` action `"list"` in `mcp.ts` (include pacing calculation)
- [x] 2.7 Create `src/services/recurring.ts` — extract `listRecurringTemplates(db, userId)` from `manage_recurring_template` action `"list"` in `mcp.ts`
- [x] 2.8 Create `src/services/summary.ts` — extract `financialSummary(db, userId, params, fetchFn?)` from `financial_summary` tool in `mcp.ts` (net worth, transactions, debts, goals, cashflow projections)
- [x] 2.9 Run `npm run typecheck` after all read service files are created

## 3. Service Extraction — Write Functions

- [x] 3.1 Add `createWallet(db, userId, params)` and `updateWallet(db, userId, walletId, params)` to `src/services/wallet.ts`
- [x] 3.2 Add `createCategory(db, userId, params)` and `seedDefaults(db, userId)` to `src/services/category.ts`
- [x] 3.3 Add `createBudget(db, userId, params)` to `src/services/budget.ts`
- [x] 3.4 Add `recordTransaction(db, userId, params)`, `updateTransaction(db, userId, txId, params)`, and private `applyBalanceDelta` helper to `src/services/transaction.ts`
- [x] 3.5 Create `src/services/transfer.ts` — extract `transferFunds(db, userId, params)` from `transfer_funds` tool in `mcp.ts` (atomic source debit + target credit + fee handling)
- [x] 3.6 Add `createDebtLoan(db, userId, params)`, `repayDebtLoan(db, userId, debtLoanId, params)`, `updateDebtLoan(db, userId, debtLoanId, params)` to `src/services/debt-loan.ts`
- [x] 3.7 Add `createGoal(db, userId, params)`, `updateGoal(db, userId, goalId, params)`, `contributeGoal(db, userId, goalId, params)`, `deleteGoal(db, userId, goalId)` to `src/services/goal.ts`
- [x] 3.8 Add `createRecurringTemplate(db, userId, params)`, `updateRecurringTemplate(db, userId, templateId, params)`, `deleteRecurringTemplate(db, userId, templateId)`, `applyRecurringTemplate(db, userId, templateId)` to `src/services/recurring.ts`
- [x] 3.9 Create `src/services/auth.ts` — extract `registerUser(db, jwtSecret, params)` and `loginUser(db, jwtSecret, apiKey)` from `register_user`/`login_user` tools (include `evaluateOnboarding` call)
- [x] 3.10 Create `src/services/feedback.ts` — extract `submitFeedback(db, userId, params)` from `submit_feedback` tool in `mcp.ts`
- [x] 3.11 Run `npm run typecheck` after all write service files are created

## 4. MCP Tool Handler Refactor

- [x] 4.1 Refactor `mcp.ts` `register_user` and `login_user` tool handlers to call `src/services/auth.ts` functions, wrapping results in MCP content format
- [x] 4.2 Refactor `mcp.ts` `submit_feedback` tool handler to call `src/services/feedback.ts`
- [x] 4.3 Refactor `mcp.ts` `manage_wallet` tool handler — all actions (`list`, `create`, `update`) delegate to `src/services/wallet.ts`
- [x] 4.4 Refactor `mcp.ts` `manage_category` tool handler — all actions (`list`, `create`, `seed_defaults`) delegate to `src/services/category.ts`
- [x] 4.5 Refactor `mcp.ts` `manage_budget` tool handler — all actions (`list`, `create`, `status`) delegate to `src/services/budget.ts`
- [x] 4.6 Refactor `mcp.ts` `record_transaction` and `update_transaction` tool handlers to delegate to `src/services/transaction.ts`
- [x] 4.7 Refactor `mcp.ts` `transfer_funds` tool handler to delegate to `src/services/transfer.ts`
- [x] 4.8 Refactor `mcp.ts` `list_transactions` tool handler to delegate to `src/services/transaction.ts` `listTransactions`
- [x] 4.9 Refactor `mcp.ts` `financial_summary` tool handler to delegate to `src/services/summary.ts`
- [x] 4.10 Refactor `mcp.ts` `manage_debt_loan` tool handler — all actions delegate to `src/services/debt-loan.ts`
- [x] 4.11 Refactor `mcp.ts` `manage_goal` tool handler — all actions delegate to `src/services/goal.ts`
- [x] 4.12 Refactor `mcp.ts` `manage_recurring_template` tool handler — all actions delegate to `src/services/recurring.ts`
- [x] 4.13 Replace `resolveEffectiveUserId` in `mcp.ts` with imported `resolveUserId` from `src/middleware/auth.ts` (pass `toolArgs` for in-tool fallback)
- [x] 4.14 Run `npm run typecheck` and `npm test` — verify all MCP tool tests pass with zero regressions

## 5. REST Route Creation & Migration

- [x] 5.1 Create `src/routes/index.ts` — Hono sub-app with auth middleware (`resolveUserId` from `src/middleware/auth.ts`) applied via `api.use('*', ...)`, mounting all route files
- [x] 5.2 Create `src/routes/wallets.ts` — `GET /` → `listWallets` → `c.json(result)`
- [x] 5.3 Create `src/routes/categories.ts` — `GET /` → `listCategories` → `c.json(result)`
- [x] 5.4 Create `src/routes/budgets.ts` — `GET /` → `budgetStatus` → `c.json(result)`
- [x] 5.5 Create `src/routes/transactions.ts` — `GET /` → `listTransactions` with query param parsing → `c.json(result)`
- [x] 5.6 Create `src/routes/debts-loans.ts` — `GET /` → `listDebtsLoans` → `c.json(result)`
- [x] 5.7 Create `src/routes/goals.ts` — `GET /` → `listGoals` with optional `status` query param → `c.json(result)`
- [x] 5.8 Create `src/routes/recurring-templates.ts` — `GET /` → `listRecurringTemplates` → `c.json(result)`
- [x] 5.9 Create `src/routes/summary.ts` — `GET /` → `financialSummary` with query param parsing → `c.json(result)`
- [x] 5.10 Mount routes sub-app in `src/index.ts` via `app.route('/api/v1', api)`
- [x] 5.11 Migrate existing `GET /api/v1/summary` handler in `index.ts` to use `src/routes/summary.ts` (delete ~167 lines of duplicated summary logic)
- [x] 5.12 Migrate existing `GET /api/v1/goals` handler in `index.ts` to `src/routes/goals.ts`
- [x] 5.13 Migrate existing `POST /api/v1/goals` handler in `index.ts` to `src/routes/goals.ts` (add write route calling `createGoal` service)
- [x] 5.14 Migrate existing `GET /api/v1/recurring-templates` handler in `index.ts` to `src/routes/recurring-templates.ts`
- [x] 5.15 Migrate existing `POST /api/v1/recurring-templates` and `POST /api/v1/recurring-templates/:templateId/apply` handlers in `index.ts` to `src/routes/recurring-templates.ts`
- [x] 5.16 Migrate existing `POST /api/v1/feedback` handler in `index.ts` to `src/routes/feedback.ts`
- [x] 5.17 Replace `authenticateRestUser` and `extractAuthenticatedUserId` in `index.ts` with `resolveUserId` from `src/middleware/auth.ts` (update MCP handler gate in `handleMcpRequest`)
- [x] 5.18 Delete the now-unused `authenticateRestUser` function from `index.ts`
- [x] 5.19 Run `npm run typecheck` and `npm test` — verify all existing tests pass

## 6. Tests & Verification

- [x] 6.1 Run full MCP test suite (`npm test`) and verify zero regressions in tool responses
- [x] 6.2 Run TypeScript compilation check (`npm run typecheck`) — zero errors
- [x] 6.3 Run `npm run build` (Wrangler dry-run deploy) — verify bundle compiles for Workers
- [x] 6.4 Start local dev server (`npm run dev`) and manually verify: `GET /api/v1/wallets`, `GET /api/v1/transactions`, `GET /api/v1/categories`, `GET /api/v1/budgets`, `GET /api/v1/debts-loans`, `GET /api/v1/goals`, `GET /api/v1/recurring-templates`, `GET /api/v1/summary` return expected data with Bearer token auth
- [x] 6.5 Verify observability headers: all responses include `X-Request-ID` and `X-Response-Time`
- [x] 6.6 Verify auth rejection: `GET /api/v1/wallets` without auth returns HTTP `401` with correct error body
- [x] 6.7 Run integration tests (`npm run test:local`) against local dev server — verify MCP and REST paths work end-to-end

## 7. Documentation

- [x] 7.1 Update `TOOLS.md` to document new REST API read endpoints (paths, query params, response shapes)
- [x] 7.2 Update `README.md` project structure section to reflect `src/services/`, `src/routes/`, `src/middleware/` directories
- [x] 7.3 Update `docs/CODING_AGENTS.md` to reference the service layer architecture for future contributors
