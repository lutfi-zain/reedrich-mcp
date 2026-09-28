## Purpose

Defines the behavior contract for deleting financial entities whose deletion lifecycle was previously unhandled: Wallets, Categories, Budgets, and Debts/Loans. This capability establishes strict financial invariants (balance zero-checks, active link prevention, and system category protection) to safeguard ledger integrity during entity deletion.

## ADDED Requirements

### Requirement: Wallet Deletion Lifecycle with Balance & Link Guard

The system MUST expose `DELETE /api/v1/wallets/:walletId` and support action `"delete"` on the MCP tool `manage_wallet` to permanently delete an existing wallet belonging to the authenticated user.

Before deleting, the system MUST enforce the following integrity guards:
1. **Balance Non-Zero Guard**: If `Math.abs(walletBalance) > 0.001`, the system MUST reject deletion with HTTP `400 Bad Request` and error code `VALIDATION` ("Wallet balance must be 0 before deletion. Please transfer or zero out remaining funds first.").
2. **Active Link Guard**: If the wallet is actively linked to any goal via `goal_wallets` with `goalStatus == 'in_progress'`, or to any active recurring template (`templateIsActive == 1`), the system MUST reject deletion with HTTP `400 Bad Request` and error code `VALIDATION`.

If the wallet satisfies all guards, the system SHALL delete the wallet record and return HTTP `200 OK` with a confirmation message.

#### Scenario: Successfully delete an empty, unlinked wallet

- **GIVEN** an authenticated user with wallet `w1` having balance `0` and no active goal or recurring links
- **WHEN** the client invokes `DELETE /api/v1/wallets/w1`
- **THEN** the system MUST respond with HTTP `200 OK`
- **THEN** wallet `w1` MUST be removed from the database

#### Scenario: Reject wallet deletion when balance is non-zero

- **GIVEN** an authenticated user with wallet `w1` having balance `500000` IDR
- **WHEN** the client invokes `DELETE /api/v1/wallets/w1`
- **THEN** the system MUST respond with HTTP `400 Bad Request` with error code `VALIDATION` and a message directing the user to transfer or zero out the balance first

#### Scenario: Reject wallet deletion when linked to active goal

- **GIVEN** an authenticated user with wallet `w1` (balance `0`) linked to an active goal `g1`
- **WHEN** the client invokes `DELETE /api/v1/wallets/w1`
- **THEN** the system MUST respond with HTTP `400 Bad Request` and error code `VALIDATION`

---

### Requirement: Category Deletion with System Protection

The system MUST expose `DELETE /api/v1/categories/:categoryId` and support action `"delete"` on the MCP tool `manage_category` to delete a custom user category.

The system MUST enforce **System Category Protection**:
- Any attempt to delete the internal system category `"Adjustment"` MUST be rejected with HTTP `400 Bad Request` and error code `VALIDATION` ("System category 'Adjustment' is protected and cannot be deleted.").

When a custom category is deleted, existing transactions and budgets referencing it SHALL retain their records with `categoryId` set to `null`.

#### Scenario: Successfully delete a custom category

- **GIVEN** an authenticated user with a custom category "Hobbies"
- **WHEN** the client invokes `DELETE /api/v1/categories/:hobbiesId`
- **THEN** the system MUST respond with HTTP `200 OK`
- **THEN** the category record MUST be deleted

#### Scenario: Attempting to delete system Adjustment category is blocked

- **GIVEN** the system category `"Adjustment"`
- **WHEN** the client invokes `DELETE /api/v1/categories/:adjustmentId`
- **THEN** the system MUST respond with HTTP `400 Bad Request` and error code `VALIDATION`

---

### Requirement: Budget Deletion Lifecycle

The system MUST expose `DELETE /api/v1/budgets/:budgetId` and support action `"delete"` on the MCP tool `manage_budget` to delete an existing budget limit.

Deleting a budget SHALL NOT delete any transactions; existing transactions referencing the deleted budget SHALL have `transactionBudgetId` set to `null`.

#### Scenario: Delete an existing budget

- **GIVEN** an authenticated user with budget `b1`
- **WHEN** the client invokes `DELETE /api/v1/budgets/b1`
- **THEN** the system MUST respond with HTTP `200 OK`
- **THEN** budget `b1` MUST be removed from the database

---

### Requirement: Debt and Loan Deletion Lifecycle

The system MUST expose `DELETE /api/v1/debts-loans/:debtLoanId` and support action `"delete"` on the MCP tool `manage_debt_loan` to delete an existing liability or receivable record.

#### Scenario: Delete an existing debt or loan

- **GIVEN** an authenticated user with debt record `d1`
- **WHEN** the client invokes `DELETE /api/v1/debts-loans/d1`
- **THEN** the system MUST respond with HTTP `200 OK`
- **THEN** the record `d1` MUST be removed from the database
