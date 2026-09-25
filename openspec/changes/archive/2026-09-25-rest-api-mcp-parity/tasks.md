## 1. Wallet Write Endpoints

- [x] 1.1 Add `POST /` handler in `src/routes/wallets.ts` calling `createWallet(db, userId, body)` → 201
- [x] 1.2 Add `PATCH /:walletId` handler in `src/routes/wallets.ts` calling `updateWallet(db, userId, walletId, body)` → 200

## 2. Category Write Endpoints

- [x] 2.1 Add `POST /` handler in `src/routes/categories.ts` calling `createCategory(db, userId, body)` → 201
- [x] 2.2 Add `POST /seed` handler in `src/routes/categories.ts` calling `seedDefaults(db, userId)` → 200

## 3. Budget Write Endpoint

- [x] 3.1 Add `POST /` handler in `src/routes/budgets.ts` calling `createBudget(db, userId, body)` → 201

## 4. Transaction Write Endpoints

- [x] 4.1 Add `POST /` handler in `src/routes/transactions.ts` calling `recordTransaction(db, userId, body)` → 201
- [x] 4.2 Add `PATCH /:transactionId` handler in `src/routes/transactions.ts` calling `updateTransaction(db, userId, transactionId, body)` → 200

## 5. Transfer Endpoint

- [x] 5.1 Create `src/routes/transfers.ts` with `POST /` handler calling `transferFunds(db, userId, body)` → 201
- [x] 5.2 Register `api.route("/transfers", transfers)` in `src/routes/index.ts`

## 6. Debt & Loan Write Endpoints

- [x] 6.1 Add `POST /` handler in `src/routes/debts-loans.ts` calling `createDebtLoan(db, userId, body)` → 201
- [x] 6.2 Add `POST /:debtLoanId/repay` handler calling `repayDebtLoan(db, userId, debtLoanId, body)` → 200
- [x] 6.3 Add `PATCH /:debtLoanId` handler calling `updateDebtLoan(db, userId, debtLoanId, body)` → 200

## 7. Goal Write Endpoints

- [x] 7.1 Add `PATCH /:goalId` handler in `src/routes/goals.ts` calling `updateGoal(db, userId, goalId, body)` → 200
- [x] 7.2 Add `DELETE /:goalId` handler calling `deleteGoal(db, userId, goalId)` → 200
- [x] 7.3 Add `POST /:goalId/contribute` handler calling `contributeGoal(db, userId, goalId, body)` → 200
- [x] 7.4 Add `POST /:goalId/wallets` handler calling `linkGoalWallet(db, userId, goalId, body.walletId)` → 200
- [x] 7.5 Add `DELETE /:goalId/wallets/:walletId` handler calling `unlinkGoalWallet(db, userId, goalId, walletId)` → 200

## 8. Recurring Template Write Endpoints

- [x] 8.1 Add `PATCH /:templateId` handler in `src/routes/recurring-templates.ts` calling `updateRecurringTemplate(db, userId, templateId, body)` → 200
- [x] 8.2 Add `DELETE /:templateId` handler calling `deleteRecurringTemplate(db, userId, templateId)` → 200

## 9. Documentation

- [x] 9.1 Add all 14 new path entries to `src/docs/openapi.ts` with request/response schemas
- [x] 9.2 Update REST API directory in `src/docs/llms.ts` with all new endpoints

## 10. Tests & Verification

- [x] 10.1 Run `npm run typecheck` to verify zero type errors
- [x] 10.2 Run `npm test` to verify all existing unit tests pass
- [x] 10.3 Run `npm run test:local` to verify full local E2E integration (existing + new endpoints)
- [x] 10.4 Run `npm run test:remote` against deployed Cloudflare Workers to verify production parity
