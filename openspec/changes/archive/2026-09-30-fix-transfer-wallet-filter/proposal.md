## Why

When users or AI agents filter transactions by a wallet (`GET /api/v1/transactions?walletId=<MANDIRI>` or MCP `list_transactions({ walletId })`), incoming transfers where the wallet is the destination are silently excluded. For example, a transfer from BCA to MANDIRI is stored with `transactionWalletId = BCA` (source) and `transactionTargetWalletId = MANDIRI` (destination), but querying for MANDIRI's transaction history returns zero results because the filter only checks the source column. As a result, wallet statements are incomplete and financial planning views miss incoming funds.

## What Changes

- **Service Layer (`src/services/transaction.ts`)**:
  - Redefine `walletId` filter semantics in `listTransactions` as wallet-inclusive statement filtering:
    - `walletId` alone ➔ matches transactions where the wallet is either source (`transactionWalletId`) OR destination (`transactionTargetWalletId`).
    - `walletId` + `targetWalletId` together ➔ matches only directed flows from source to destination (intersection, preserving narrow-flow filtering).
    - `targetWalletId` alone ➔ matches only transactions directed into the destination wallet(s).
  - Implement `OR` predicates using Drizzle `or()` with existing `eq()` / `inArray()` conditions.
- **Documentation (`src/docs/openapi.ts`, `src/docs/llms.ts`)**:
  - Clarify `walletId` semantics describing source-or-destination matching, and `targetWalletId` as directed-flow filter.
- **Tests (`tests/mcp.test.ts`, `tests/integration.test.ts`)**:
  - Verify incoming transfers appear in destination wallet history, internal transfers appear once in multi-wallet queries, and directed flow filtering remains precise.

## Capabilities

### New Capabilities
- `wallet-inclusive-filtering`: Wallet-inclusive transaction statement filtering with source-or-destination semantics, directed-flow narrowing, and destination-only matching.

### Modified Capabilities
None. The transaction schema and envelope format remain unchanged.

## Non-Goals

- Changing the `transactions` table schema, columns, or indexes.
- Adding a separate wallet-statement endpoint distinct from `GET /api/v1/transactions`.
- Altering balance reconciliation, fund mutation, or recurring template behavior.

## Impact & Constraints

- **Multi-Tenant RLS**: All matching predicates remain scoped by `eq(schema.transactions.transactionUserId, userId)`.
- **Zero Remote Deletions**: Purely non-destructive query-logic fix and documentation clarification.
- **Edge Performance**: Both filtered columns are already indexed (`transactions_wallet_id_idx`, `transactions_target_wallet_id_idx`), enabling SQLite Index Union optimization for `OR` predicates.
