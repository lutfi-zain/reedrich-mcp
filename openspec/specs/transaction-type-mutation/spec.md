# transaction-type-mutation Specification

## Purpose

Defines the behavioral specification and financial invariants for mutating the type of an existing transaction (`expense`, `income`, `transfer`) in place via REST API and Model Context Protocol (MCP) transports without destructive deletion and recreation.

## Requirements

### Requirement: In-Place Transaction Type Mutation via REST and MCP

The system MUST permit mutating the `type` of an existing transaction belonging to the authenticated user through `PATCH /api/v1/transactions/:transactionId` and MCP tool `update_transaction`.

The `type` field SHALL accept:
- `"expense"`
- `"income"`
- `"transfer"`

If `type` is not supplied, the transaction's existing type MUST remain unchanged. If `type` is supplied with any value other than `"expense"`, `"income"`, or `"transfer"`, the system MUST reject the request with HTTP `400 Bad Request` and error code `VALIDATION`.

When the transaction type is mutated, the system MUST persist the new type in storage while preserving the original `transactionId` and `transactionCreatedAt` timestamp.

#### Scenario: Mutate an expense transaction to income

- **GIVEN** an authenticated user with an existing realized expense transaction `tx1` of amount `100000` IDR in wallet `w1`
- **WHEN** the client invokes `PATCH /api/v1/transactions/tx1` with `{ "type": "income" }`
- **THEN** the system MUST respond with HTTP `200 OK`
- **THEN** the returned transaction object MUST have `transactionType: "income"`
- **THEN** the transaction record in storage MUST retain its original identifier `tx1`

#### Scenario: Mutate an expense transaction to transfer

- **GIVEN** an authenticated user with an existing realized expense transaction `tx1` in wallet `w1` and a second wallet `w2`
- **WHEN** the client invokes `PATCH /api/v1/transactions/tx1` with `{ "type": "transfer", "targetWalletId": "w2" }`
- **THEN** the system MUST respond with HTTP `200 OK`
- **THEN** the returned transaction object MUST have `transactionType: "transfer"` and `transactionTargetWalletId: "w2"`

#### Scenario: Mutate a transfer transaction to expense

- **GIVEN** an authenticated user with an existing realized transfer transaction `tx1` from wallet `w1` to wallet `w2`
- **WHEN** the client invokes `PATCH /api/v1/transactions/tx1` with `{ "type": "expense" }`
- **THEN** the system MUST respond with HTTP `200 OK`
- **THEN** the returned transaction object MUST have `transactionType: "expense"` and `transactionTargetWalletId: null`

#### Scenario: Reject unsupported transaction type

- **WHEN** the client invokes `PATCH /api/v1/transactions/tx1` with `{ "type": "investment_dividend" }`
- **THEN** the system MUST respond with HTTP `400 Bad Request` and error code `VALIDATION`

---

### Requirement: Type-Dependent Target Wallet & Budget Invariants

The system MUST enforce strict schema invariants based on the effective transaction type resulting from the mutation:

1. **Transfer Target Wallet Guard**:
   - If the resulting type is `"transfer"`, `targetWalletId` MUST be present (either provided in update payload or existing on the transaction record).
   - If `targetWalletId` is missing or resolves to `null`, the system MUST reject the request with HTTP `400 Bad Request` and error code `VALIDATION`.
   - `targetWalletId` MUST refer to a valid wallet belonging to the authenticated user.
   - `targetWalletId` MUST NOT be equal to `walletId`. If identical, the system MUST reject the request with HTTP `400 Bad Request` and error code `VALIDATION`.

2. **Non-Transfer Target Wallet Guard**:
   - If the resulting type is `"expense"` or `"income"`, `targetWalletId` SHALL NOT be accepted. If the client explicitly sends a non-null, non-empty `targetWalletId`, the system MUST reject the request with HTTP `400 Bad Request` and error code `VALIDATION`.
   - The stored transaction record's `transactionTargetWalletId` MUST be cleared to `null`.

3. **Budget Clearing on Non-Expense Switch**:
   - If a transaction previously linked to a budget (`budgetId != null`) is mutated to `"income"` or `"transfer"`, the system MUST clear `transactionBudgetId` to `null` unless a specific valid budget is explicitly provided.

#### Scenario: Require targetWalletId when changing expense to transfer

- **GIVEN** an existing expense transaction `tx1`
- **WHEN** the client invokes `PATCH /api/v1/transactions/tx1` with `{ "type": "transfer" }` and omits `targetWalletId`
- **THEN** the system MUST respond with HTTP `400 Bad Request` and error code `VALIDATION` specifying that `targetWalletId` is required for transfers

#### Scenario: Reject identical source and target wallets on transfer mutation

- **GIVEN** an existing expense transaction `tx1` in wallet `w1`
- **WHEN** the client invokes `PATCH /api/v1/transactions/tx1` with `{ "type": "transfer", "targetWalletId": "w1" }`
- **THEN** the system MUST respond with HTTP `400 Bad Request` and error code `VALIDATION`

#### Scenario: Reject targetWalletId when changing transfer to income

- **GIVEN** an existing transfer transaction `tx1`
- **WHEN** the client invokes `PATCH /api/v1/transactions/tx1` with `{ "type": "income", "targetWalletId": "w2" }`
- **THEN** the system MUST respond with HTTP `400 Bad Request` and error code `VALIDATION`

---

### Requirement: Two-Phase Atomic Balance Reconciliation on Type Mutation

When an existing realized transaction (`isPlanned === 0`) has its type, amount, fee, or wallets mutated, the system MUST atomically reconcile affected wallet balances using a two-phase process:

1. **Phase 1 (Reversal)**: Reverses the financial impact of the prior transaction state:
   - Prior `expense`: debits refunded to source wallet `+(amount + adminFee)`.
   - Prior `income`: credits removed from source wallet `-(amount - adminFee)`.
   - Prior `transfer`: debits refunded to source wallet `+(amount + adminFee)` and credits removed from target wallet `-(amount)`.

2. **Phase 2 (Application)**: Applies the financial impact of the new transaction state:
   - New `expense`: debits deducted from source wallet `-(amount + adminFee)`.
   - New `income`: credits added to source wallet `+(amount - adminFee)`.
   - New `transfer`: debits deducted from source wallet `-(amount + adminFee)` and credits added to target wallet `+(amount)`.

If the prior transaction was planned (`isPlanned === 1`), Phase 1 MUST NOT modify wallet balances. If the resulting transaction is planned (`isPlanned === 1`), Phase 2 MUST NOT modify wallet balances.

If the mutation results in an expense or transfer debiting a locked wallet (`walletIsLocked === 1`), the system SHALL include an informational notice in the response.

#### Scenario: Atomic balance reconciliation when switching Expense to Income

- **GIVEN** wallet `w1` has balance `1000000` IDR
- **GIVEN** an expense transaction `tx1` of `200000` IDR exists in wallet `w1` (making current balance `800000` IDR)
- **WHEN** the client changes `tx1` type to `"income"` with the same amount `200000` IDR and admin fee `0`
- **THEN** Phase 1 MUST refund the expense `+200000` IDR to `w1`
- **THEN** Phase 2 MUST credit the income `+200000` IDR to `w1`
- **THEN** the resulting balance of `w1` MUST be exactly `1200000` IDR

#### Scenario: Atomic balance reconciliation when switching Expense to Transfer

- **GIVEN** wallet `w1` has balance `500000` IDR and wallet `w2` has balance `200000` IDR
- **GIVEN** an expense transaction `tx1` of `100000` IDR in wallet `w1` (making `w1` current balance `400000` IDR)
- **WHEN** the client changes `tx1` to type `"transfer"` targeting `w2` with amount `100000` IDR
- **THEN** Phase 1 MUST refund `+100000` IDR to `w1`
- **THEN** Phase 2 MUST debit `-100000` IDR from `w1` and credit `+100000` IDR to `w2`
- **THEN** the resulting balance of `w1` MUST be `400000` IDR and `w2` MUST be `300000` IDR

#### Scenario: Planned transaction switch does not mutate wallet balance

- **GIVEN** wallet `w1` has balance `500000` IDR
- **GIVEN** a planned expense transaction `tx1` (`isPlanned: 1`) of `100000` IDR
- **WHEN** the client changes `tx1` type to `"income"` while keeping `isPlanned: 1`
- **THEN** neither Phase 1 nor Phase 2 SHALL alter wallet balances
- **THEN** wallet `w1` balance MUST remain `500000` IDR
