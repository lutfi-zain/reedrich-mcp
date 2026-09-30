## Context

Reedrich records all financial movements in the `transactions` table in Cloudflare D1 with a discriminated `transaction_type` column (`'expense' | 'income' | 'transfer'`). The `updateTransaction` service function in `src/services/transaction.ts` and the associated MCP tool `update_transaction` currently permit mutating amount, fee, wallets, category, budget, date, and description, but lock `transaction_type` to its initial state.

When mutating transactions, the system uses `applyBalanceDelta` to adjust wallet balances atomically via D1 SQL expressions (`sql\`wallet_balance + ${delta}\``). Because `transactionType` was previously considered immutable, `updateTransaction` used `existingTx.transactionType` for both the reversal and application stages.

See `proposal.md` for full background and motivation.

## Goals / Non-Goals

**Goals:**
- Provide in-place mutation of transaction type (`expense` ↔ `income` ↔ `transfer`) via `PATCH /api/v1/transactions/:transactionId` and MCP tool `update_transaction`.
- Guarantee ledger integrity via Two-Phase Atomic Balance Reconciliation (`applyBalanceDelta` with `multiplier: -1` on old state, followed by `applyBalanceDelta` with `multiplier: 1` on new state).
- Enforce strict type-dependent foreign key invariants (`targetWalletId` mandatory and unique for `transfer`, forbidden/nullified for `expense` and `income`; `budgetId` cleared on non-expense transitions).
- Maintain multi-tenant row-level security and preserve original `transactionId` and creation timestamps.

**Non-Goals:**
- Schema migrations: D1 table schema already supports `transactionType: "expense" | "income" | "transfer"`, `transactionWalletId`, and nullable `transactionTargetWalletId`. No DDL alterations required.
- Modifying historical transaction timestamps or primary keys.
- Bulk multi-transaction type modifications.

## Decisions

### 1. In-Place Mutation vs. Drop-and-Recreate

- **Decision**: Mutate the existing transaction record in-place by updating `transaction_type`, `transaction_target_wallet_id`, and other mutated fields in the same row.
- **Alternatives Considered**:
  - *Drop-and-Recreate*: Calling `deleteTransaction` followed by `recordTransaction` or `transferFunds`.
    *Rejected*: Generates a new `transactionId`, drops `transactionCreatedAt` audit history, breaks external references, and triggers two separate database round-trips.
- **Rationale**: In-place mutation maintains referential continuity, allows atomic multi-field updates in a single SQL operation, and avoids orphan records.

### 2. Two-Phase Balance Reconciliation Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                         TWO-PHASE BALANCE RECONCILIATION FLOW                               │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                             │
│   1. Fetch Existing Transaction (with User RLS)                                             │
│      SELECT * FROM transactions WHERE transaction_id = ? AND transaction_user_id = ?        │
│                                                                                             │
│   2. Validate Inputs & Invariants                                                           │
│      - Validate newType against ('expense', 'income', 'transfer')                           │
│      - If newType == 'transfer': verify targetWalletId exists and != walletId               │
│      - If newType != 'transfer': verify targetWalletId is null / not passed                 │
│                                                                                             │
│   3. Phase 1: Reversal (if existingTx.transactionIsPlanned == 0)                            │
│      applyBalanceDelta(                                                                     │
│        type: existingTx.transactionType,                                                    │
│        walletId: existingTx.transactionWalletId,                                            │
│        targetWalletId: existingTx.transactionTargetWalletId,                                │
│        amount: existingTx.transactionAmount,                                                │
│        fee: existingTx.transactionAdminFee,                                                 │
│        multiplier: -1                                                                       │
│      )                                                                                      │
│                                                                                             │
│   4. Phase 2: Application (if newIsPlannedInt == 0)                                         │
│      applyBalanceDelta(                                                                     │
│        type: newType,                                                                       │
│        walletId: newWalletId,                                                               │
│        targetWalletId: (newType == 'transfer' ? newTargetWalletId : null),                  │
│        amount: newAmount,                                                                   │
│        fee: newAdminFee,                                                                    │
│        multiplier: 1                                                                        │
│      )                                                                                      │
│                                                                                             │
│   5. Persist Updates in D1                                                                  │
│      UPDATE transactions SET transaction_type = newType, ... WHERE transaction_id = ?       │
│                                                                                             │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Decision**: Reconcile balances in two sequential atomic stages:
  1. Reverse the previous state using `existingTx.transactionType` with `multiplier = -1`.
  2. Apply the new state using `newType` with `multiplier = 1`.
- **Mathematical Correctness**:
  - *Expense ➔ Income*: Source wallet delta = `+(oldAmount + oldFee) + (newAmount - newFee)`.
  - *Expense ➔ Transfer*: Source wallet delta = `+(oldAmount + oldFee) - (newAmount + newFee)`; Target wallet delta = `+newAmount`.
  - *Transfer ➔ Expense*: Source wallet delta = `+(oldAmount + oldFee) - (newAmount + newFee)`; Target wallet delta = `-oldAmount`.
  - *Income ➔ Transfer*: Source wallet delta = `-(oldAmount - oldFee) - (newAmount + newFee)`; Target wallet delta = `+newAmount`.
  - *Transfer ➔ Income*: Source wallet delta = `+(oldAmount + oldFee) + (newAmount - newFee)`; Target wallet delta = `-oldAmount`.
  - *Income ➔ Expense*: Source wallet delta = `-(oldAmount - oldFee) - (newAmount + newFee)`.

### 3. Type-Dependent Column Nullification Rules

- **Decision**:
  - When `newType !== "transfer"`: Set `transactionTargetWalletId: null` in the database update payload. If the caller passed an explicit non-null `targetWalletId`, throw a `VALIDATION` error (`"Validation Error: 'targetWalletId' is only allowed for transfer transactions"`).
  - When `newType !== "expense"`: Set `transactionBudgetId: null` in the database update payload (unless an explicit non-null `budgetId` was provided, which should be rejected or cleared since budgets track expenses only).
  - When `newType === "transfer"`: Validate that `newTargetWalletId` is not null, belongs to the authenticated user, and does not match `newWalletId`.

### 4. Transport Uniformity (MCP & REST)

- **REST Route (`src/routes/transactions.ts`)**:
  - `PATCH /api/v1/transactions/:transactionId` already passes `c.req.json()` directly to `updateTransaction`. No router-level changes required except OpenAPI schema reflection.
- **MCP Tool (`src/mcp.ts`)**:
  - Add `type: { type: "string", enum: ["expense", "income", "transfer"], description: "..." }` to the `update_transaction` tool declaration.

## Risks / Trade-offs

- **[Risk: Inconsistent intermediate state during balance updates]** ➔ **Mitigation**: Balance adjustments use D1 atomic SQL increments (`sql\`wallet_balance + ${delta}\``). If any step throws (e.g. invalid foreign key), the service error is returned immediately and subsequent queries abort.
- **[Risk: Orphan targetWalletId on non-transfer]** ➔ **Mitigation**: The update payload explicitly enforces `transactionTargetWalletId: newType === "transfer" ? newTargetWalletId : null`, preventing stale target wallet associations.
- **[Risk: Double-reconciliation when planned status also changes]** ➔ **Mitigation**: Phase 1 is guarded by `existingTx.transactionIsPlanned === 0`, and Phase 2 is guarded by `newIsPlannedInt === 0`. If a transaction transitions from realized to planned, only Phase 1 runs (reversal). If transitioning from planned to realized, only Phase 2 runs (application).
