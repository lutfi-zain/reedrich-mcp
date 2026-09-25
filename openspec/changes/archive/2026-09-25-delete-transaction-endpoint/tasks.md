## 1. Core Service

- [x] 1.1 Implement `deleteTransaction(db, userId, transactionId)` in `src/services/transaction.ts` with multi-tenant lookup and atomic balance reversal via `applyBalanceDelta(..., -1)`.

## 2. REST API Route

- [x] 2.1 Add `DELETE /:transactionId` handler in `src/routes/transactions.ts` calling `deleteTransaction(db, userId, transactionId)` → 200.

## 3. MCP Tool

- [x] 3.1 Register tool `delete_transaction` in `src/mcp.ts` tool registry.
- [x] 3.2 Implement execution handler for `delete_transaction` in `src/mcp.ts` calling `deleteTransaction(db, effectiveUserId, args.transactionId)`.

## 4. Documentation

- [x] 4.1 Document `DELETE /api/v1/transactions/{transactionId}` in `src/docs/openapi.ts`.
- [x] 4.2 Document `delete_transaction` and REST delete route in `src/docs/llms.ts`.

## 5. Tests & Verification

- [x] 5.1 Add unit tests in `tests/mcp.test.ts` verifying deletion of expense, income, transfer, planned transactions, 404 handling, and MCP tool execution.
- [x] 5.2 Add E2E assertion in `tests/integration.test.ts` for transaction deletion.
- [x] 5.3 Run `npm run typecheck` to verify zero type errors.
- [x] 5.4 Run `npm test` to verify all unit tests pass.
- [x] 5.5 Run `npm run test:local` to verify local E2E integration.
