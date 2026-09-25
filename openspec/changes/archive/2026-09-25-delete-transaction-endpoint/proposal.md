## Why

Currently, users and AI agents can create, query, and update transactions, but cannot delete a transaction. When an erroneous or accidental transaction is recorded, users have no way to remove it, leading to permanent ledger distortion and corrupted wallet balances. Adding a delete operation with atomic balance reversal completes the full transaction lifecycle across both REST and MCP interfaces.

## What Changes

- Add service function `deleteTransaction(db, userId, transactionId)` in `src/services/transaction.ts` that:
  - Validates `transactionId` UUID and checks multi-tenant ownership (`eq(transactionUserId, userId)`).
  - For realized transactions (`transactionIsPlanned == 0`), atomically reverses wallet balances using `applyBalanceDelta(..., -1)` (restoring expense amounts+fees to wallet, deducting income amounts-fees, or reversing dual-wallet transfer balances).
  - For planned transactions (`transactionIsPlanned == 1`), skips balance mutation since planned entries carry no balance impact.
  - Deletes the transaction record from Cloudflare D1.
- Add REST route `DELETE /api/v1/transactions/:transactionId` in `src/routes/transactions.ts` returning HTTP `200 OK` with confirmation message.
- Add MCP tool `delete_transaction` in `src/mcp.ts` accepting required parameter `transactionId`.
- Document `DELETE /api/v1/transactions/{transactionId}` in OpenAPI spec (`src/docs/openapi.ts`) and update tool directory in `src/docs/llms.ts`.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `rest-api-write`: Adds `Requirement: Delete Transaction` specifying deletion behavior, multi-tenant checks, 404 on missing record, and atomic balance reconciliation.

## Non-Goals

- No bulk/batch deletion endpoint in this change; transactions are deleted individually by UUID.
- No soft-delete or archiving column in database schema; standard hard deletion with atomic ledger reversal is used.
- No database migrations or schema alterations required.

## Impact

- **Services**: `src/services/transaction.ts` exports `deleteTransaction`.
- **Routes**: `src/routes/transactions.ts` handles `DELETE /:transactionId`.
- **MCP Server**: `src/mcp.ts` registers `delete_transaction` tool and execution handler.
- **Docs**: `src/docs/openapi.ts` and `src/docs/llms.ts`.
- **Tests**: Unit tests in `tests/mcp.test.ts` and integration assertions in `tests/integration.test.ts`.
