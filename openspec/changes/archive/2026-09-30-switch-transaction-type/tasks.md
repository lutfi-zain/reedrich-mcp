## 1. Service Layer Implementation

- [x] 1.1 Extend `UpdateTransactionParams` interface in `src/services/transaction.ts` to include optional `type?: unknown`.
- [x] 1.2 Implement transaction type parsing and validation in `updateTransaction` ensuring values are limited to `'expense'`, `'income'`, or `'transfer'`.
- [x] 1.3 Implement type-dependent target wallet invariants: require `targetWalletId` when `newType === 'transfer'` (and verify `targetWalletId !== walletId`), and reject non-null `targetWalletId` when `newType !== 'transfer'`.
- [x] 1.4 Implement budget unlinking logic in `updateTransaction` to set `transactionBudgetId: null` when switching from expense to income or transfer.
- [x] 1.5 Implement Two-Phase Atomic Balance Reconciliation in `updateTransaction` using `existingTx.transactionType` for reversal (multiplier -1) and `newType` for application (multiplier 1).
- [x] 1.6 Update D1 update statement in `updateTransaction` to persist `transactionType: newType` and `transactionTargetWalletId: newType === 'transfer' ? newTargetWalletId : null`.

## 2. MCP Tool Registry & API Documentation

- [x] 2.1 Update `update_transaction` tool input schema in `src/mcp.ts` to include optional `type` enum property with clear description.
- [x] 2.2 Update OpenAPI specification in `src/docs/openapi.ts` for `PATCH /api/v1/transactions/{transactionId}` to document the `type` parameter.
- [x] 2.3 Update LLM manifest in `src/docs/llms.ts` to document transaction type switching capabilities for AI agents.

## 3. Tests & Verification

- [x] 3.1 Add unit tests in `tests/mcp.test.ts` covering all 6 state transitions (Expense ➔ Income, Income ➔ Expense, Expense ➔ Transfer, Transfer ➔ Expense, Income ➔ Transfer, Transfer ➔ Income) verifying exact multi-wallet balance deltas.
- [x] 3.2 Add unit tests in `tests/mcp.test.ts` verifying validation errors: missing target wallet on transfer switch, identical source and target wallets, target wallet passed on non-transfer, and invalid type strings.
- [x] 3.3 Add unit test in `tests/mcp.test.ts` verifying that switching type on planned transactions (`isPlanned: 1`) does not modify wallet balances.
- [x] 3.4 Run `npm run typecheck` to verify zero TypeScript static check errors.
- [x] 3.5 Run `npm test` to verify all unit tests pass with zero regressions.
- [x] 3.6 Run `npm run test:local` to verify full local E2E journey integrity.
