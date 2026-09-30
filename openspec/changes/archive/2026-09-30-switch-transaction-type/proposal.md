## Why

Currently, transactions in Reedrich can be updated across amounts, fees, dates, descriptions, categories, and budgets, but their core `type` (`expense`, `income`, `transfer`) is immutable once created. When a user or AI agent mistakenly categorizes an expense as a transfer (or vice-versa), correcting the error currently requires deleting the transaction and creating a new one. This destructive workaround loses the original `transactionId`, creation timestamps, and linked metadata.

Enabling in-place transaction type switching (`expense` ↔ `income` ↔ `transfer`) via `PATCH /api/v1/transactions/:id` and MCP tool `update_transaction` provides full ledger flexibility with mathematical safety, executing a two-phase atomic balance reconciliation to ensure multi-wallet balances stay deterministic and accurate.

## What Changes

- **Service Layer (`src/services/transaction.ts`)**:
  - Add optional `type?: unknown` (`'expense' | 'income' | 'transfer'`) to `UpdateTransactionParams`.
  - Enforce type-dependent invariants:
    - When `newType === 'transfer'`: `targetWalletId` is mandatory (provided in params or falling back to existing valid target wallet), must be a valid user wallet, and must not equal `walletId`.
    - When `newType !== 'transfer'`: explicitly reject non-null `targetWalletId` with `VALIDATION` error, and ensure `transactionTargetWalletId` is set to `null` in the database.
    - If changing from `expense` to `income` or `transfer`, clear `transactionBudgetId` to `null` because budgets apply exclusively to expense tracking.
  - Two-Phase Atomic Balance Reconciliation:
    - Phase 1 (Reversal): Reverses previous financial impact using `existingTx.transactionType`, previous wallets, previous amount, and previous admin fee with multiplier `-1` (guarded by `existingTx.transactionIsPlanned === 0`).
    - Phase 2 (Application): Applies new financial impact using `newType`, new wallets, new amount, and new admin fee with multiplier `1` (guarded by `newIsPlannedInt === 0`).
  - Persist `transactionType: newType` and updated fields in database.
- **MCP Tool Registry (`src/mcp.ts`)**:
  - Update `update_transaction` tool input schema to accept optional `type` with enum `["expense", "income", "transfer"]`.
- **REST Route (`src/routes/transactions.ts`)**:
  - Seamlessly accepts `type` in JSON request body of `PATCH /api/v1/transactions/:transactionId`.
- **API Documentation (`src/docs/openapi.ts`, `src/docs/llms.ts`)**:
  - Document `type` parameter in `PATCH /api/v1/transactions/{transactionId}` and LLM agent tool guide.
- **Verification**:
  - Comprehensive unit test coverage in `tests/mcp.test.ts` testing all 6 directional state transitions (Expense ↔ Income, Expense ↔ Transfer, Income ↔ Transfer) and validation error guards.

## Capabilities

### New Capabilities

- `transaction-type-mutation`: Behavior contract and mathematical balance reconciliation invariants for switching transaction types in place across REST and MCP transports.

### Modified Capabilities

None. Existing transaction creation and deletion capabilities remain unchanged.

## Non-Goals

- Changing historical transactions that are linked to closed accounting periods or external sync systems (not present in current architecture).
- Bulk transaction type mutations across multiple transactions in a single call.
- Modifying `transactionId` or `transactionCreatedAt` timestamps during type switching.

## Impact & Constraints

- **Multi-Tenant RLS**: Every wallet and transaction lookup continues to enforce `eq(schema.<table>.<table>UserId, userId)`.
- **Zero Breaking Changes**: The `type` field in `UpdateTransactionParams` and `update_transaction` is completely optional. Omitting it preserves the existing transaction type without altering current behavior.
- **Edge Runtime Compatibility**: Uses existing D1 atomic SQL updates (`sql\`wallet_balance + ${delta}\``) and standard Web APIs.
