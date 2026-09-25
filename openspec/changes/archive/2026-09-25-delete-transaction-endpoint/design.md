## Context

The service module `src/services/transaction.ts` implements transaction creation (`recordTransaction`), listing (`listTransactions`), and modification (`updateTransaction`), but lacks a transaction deletion method. The existing internal utility `applyBalanceDelta(db, userId, type, walletId, targetWalletId, amount, fee, multiplier)` was already engineered to support balance reversals (`multiplier = -1`), which is currently used during transaction updates to undo previous transaction impacts. See `proposal.md` for background.

## Goals / Non-Goals

**Goals:**
- Implement `deleteTransaction(db, userId, transactionId)` in `src/services/transaction.ts` adhering to transport-neutral service rules.
- Guarantee atomic balance reversal using `applyBalanceDelta(..., -1)` for realized transactions (`transactionIsPlanned == 0`).
- Ensure planned transactions (`transactionIsPlanned == 1`) are safely deleted without modifying wallet balances.
- Expose `DELETE /api/v1/transactions/:transactionId` in `src/routes/transactions.ts`.
- Expose MCP tool `delete_transaction` in `src/mcp.ts`.

**Non-Goals:**
- No batch or bulk deletion APIs.
- No soft deletion column or schema migration.
- No undo/restore mechanism; deletion is permanent.

## Decisions

### 1. Service Function Signature and Return DTO

**Decision**: Define `deleteTransaction` as a pure async function:

```typescript
export async function deleteTransaction(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  transactionId: unknown
): Promise<{ success: boolean; message: string; deletedTransactionId: string }>
```

**Rationale**: Conforms to the project's Gold Standard pattern (`deleteGoal`, `deleteRecurringTemplate`), returning a typed confirmation object that can be passed directly to `c.json(result, 200)` in Hono or stringified in MCP JSON-RPC.

### 2. Multi-Tenant Validation and Verification

**Decision**: Prior to deletion, look up the transaction with:
```typescript
and(
  eq(schema.transactions.transactionId, cleanTxId),
  eq(schema.transactions.transactionUserId, userId)
)
```
If not found, throw `notFound("Transaction", cleanTxId)`.

**Rationale**: Enforces Multi-Tenant Row Level Security (RLS) invariant. Cross-tenant deletion or deleting non-existent IDs cleanly throws `ServiceError(NOT_FOUND)` which maps to HTTP `404`.

### 3. Atomic Balance Reversal Mechanics

**Decision**:
```typescript
if (existingTx.transactionIsPlanned === 0) {
  await applyBalanceDelta(
    db,
    userId,
    existingTx.transactionType,
    existingTx.transactionWalletId,
    existingTx.transactionTargetWalletId,
    existingTx.transactionAmount,
    existingTx.transactionAdminFee,
    -1
  );
}
```
Followed by:
```typescript
await db
  .delete(schema.transactions)
  .where(
    and(
      eq(schema.transactions.transactionId, cleanTxId),
      eq(schema.transactions.transactionUserId, userId)
    )
  );
```

**Rationale**:
- For an `expense`: `delta = -(amount + fee) * (-1) = +(amount + fee)`. Wallet balance is credited back.
- For an `income`: `delta = (amount - fee) * (-1) = -(amount - fee)`. Wallet balance is debited back.
- For a `transfer`: `sourceDelta = +(amount + fee)`, `targetDelta = -(amount)`. Both wallets are restored to pre-transfer balances.
- For `isPlanned == 1`: skipped entirely, preserving wallet balance integrity.

### 4. REST Route and MCP Tool Specification

**Decision**:
- REST: `DELETE /api/v1/transactions/:transactionId` in `src/routes/transactions.ts`.
- MCP: `delete_transaction` tool accepting `{ transactionId: string }`.

## Risks / Trade-offs

- **[Risk] Deleting Transferred Records with Missing Target Wallet** -> If the target wallet was deleted via cascading foreign key, `existingTx.transactionTargetWalletId` is null. `applyBalanceDelta` checks `if (txType === "transfer" && targetWId)`, safely adjusting only the source wallet if the target wallet no longer exists.
- **[Risk] Deleting Materialized Template Transactions** -> If a planned transaction originating from a recurring template is deleted, only that specific row is deleted. The template's recurrence schedule remains intact.
