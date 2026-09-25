# rest-api-write Specification

## Purpose

Defines the behavior contract for all REST API write endpoints (POST, PATCH, DELETE) that mutate financial data. These endpoints provide RESTful HTTP semantics while delegating all business logic and validation to the shared service layer, achieving full 1:1 parity with MCP tool write operations.

## Requirements

### Requirement: Create Wallet

The system MUST expose `POST /api/v1/wallets` that creates a new wallet for the authenticated user.

The request body SHALL accept: `name` (required, string 1-100 chars), `institution` (optional string, defaults to "General"), `type` (optional, one of `bank`, `cash`, `e-wallet`, `credit`, `crypto`, `investment`, defaults to `bank`), `balance` (optional number, defaults to 0), `currency` (optional string, defaults to "IDR"), `isLocked` (optional boolean, defaults to false).

The endpoint SHALL respond with HTTP `201` and the created wallet object on success.

#### Scenario: Create a wallet with all fields

- **GIVEN** an authenticated user
- **WHEN** `POST /api/v1/wallets` is called with `{ "name": "BCA Savings", "institution": "BCA", "type": "bank", "balance": 5000000, "currency": "IDR" }`
- **THEN** the response SHALL be HTTP `201` with the created wallet object including a generated `walletId`

#### Scenario: Create wallet with minimum fields

- **GIVEN** an authenticated user
- **WHEN** `POST /api/v1/wallets` is called with `{ "name": "Cash" }`
- **THEN** the response SHALL be HTTP `201` with defaults applied: `type: "bank"`, `balance: 0`, `currency: "IDR"`, `institution: "General"`, `walletIsLocked: 0`

#### Scenario: Create wallet with missing name

- **WHEN** `POST /api/v1/wallets` is called with `{}`
- **THEN** the response SHALL be HTTP `400` with `{ "error": "VALIDATION", "field": "name" }`

---

### Requirement: Update Wallet

The system MUST expose `PATCH /api/v1/wallets/:walletId` that updates an existing wallet belonging to the authenticated user.

The request body SHALL accept any combination of: `name`, `institution`, `type`, `balance`, `currency`, `isLocked`. Only provided fields are updated.

The endpoint SHALL respond with HTTP `200` and the updated wallet object. If the wallet does not exist or belongs to another user, it SHALL respond with HTTP `404`.

#### Scenario: Update wallet name and lock status

- **GIVEN** an authenticated user with wallet `w1`
- **WHEN** `PATCH /api/v1/wallets/w1` is called with `{ "name": "Emergency Fund", "isLocked": true }`
- **THEN** the response SHALL be HTTP `200` with the updated wallet reflecting the new name and `walletIsLocked: 1`

#### Scenario: Update non-existent wallet

- **WHEN** `PATCH /api/v1/wallets/non-existent-uuid` is called
- **THEN** the response SHALL be HTTP `404` with `{ "error": "NOT_FOUND" }`

---

### Requirement: Create Category

The system MUST expose `POST /api/v1/categories` that creates a new category for the authenticated user.

The request body SHALL accept: `name` (required, string 1-100 chars), `type` (optional, `expense` or `income`, defaults to `expense`), `icon` (optional string, max 10 chars).

#### Scenario: Create an expense category

- **GIVEN** an authenticated user
- **WHEN** `POST /api/v1/categories` is called with `{ "name": "Groceries", "type": "expense", "icon": "🛒" }`
- **THEN** the response SHALL be HTTP `201` with the created category object

#### Scenario: Create category with missing name

- **WHEN** `POST /api/v1/categories` is called with `{ "type": "expense" }`
- **THEN** the response SHALL be HTTP `400` with `{ "error": "VALIDATION", "field": "name" }`

---

### Requirement: Seed Default Categories

The system MUST expose `POST /api/v1/categories/seed` that seeds the standard default categories for the authenticated user.

The endpoint SHALL be idempotent — calling it when defaults already exist SHALL NOT create duplicates.

#### Scenario: Seed defaults for new user

- **GIVEN** an authenticated user with no categories
- **WHEN** `POST /api/v1/categories/seed` is called
- **THEN** the response SHALL be HTTP `200` with the seeded categories array
- **THEN** standard categories (Makanan, Transportasi, Belanja, etc.) SHALL be created

#### Scenario: Seed defaults when already seeded

- **GIVEN** an authenticated user who already has default categories
- **WHEN** `POST /api/v1/categories/seed` is called again
- **THEN** existing categories SHALL NOT be duplicated

---

### Requirement: Create Budget

The system MUST expose `POST /api/v1/budgets` that creates a new budget for the authenticated user.

The request body SHALL accept: `name` (required, string 1-100 chars), `categoryId` (optional UUID), `amount` (required, positive number), `periodStart` (required, ISO-8601 date/timestamp), `periodEnd` (required, ISO-8601 date/timestamp).

#### Scenario: Create a monthly budget

- **GIVEN** an authenticated user with category `c1`
- **WHEN** `POST /api/v1/budgets` is called with `{ "name": "Food Budget", "categoryId": "c1", "amount": 1000000, "periodStart": "2026-10-01", "periodEnd": "2026-10-31" }`
- **THEN** the response SHALL be HTTP `201` with the created budget object

#### Scenario: Create budget with invalid amount

- **WHEN** `POST /api/v1/budgets` is called with `{ "name": "Test", "amount": -500, "periodStart": "2026-10-01", "periodEnd": "2026-10-31" }`
- **THEN** the response SHALL be HTTP `400` with `{ "error": "VALIDATION" }`

---

### Requirement: Record Transaction

The system MUST expose `POST /api/v1/transactions` that records a new financial transaction for the authenticated user.

The request body SHALL accept: `walletId` (required UUID), `amount` (required, positive number), `type` (required, `expense` or `income`), `description` (required string), `categoryId` (optional UUID), `budgetId` (optional UUID), `adminFee` (optional number, defaults to 0), `date` (optional ISO-8601, defaults to current timestamp), `isPlanned` (optional boolean, defaults to false).

When `isPlanned` is false, the endpoint SHALL atomically update the wallet balance. When `isPlanned` is true, the wallet balance SHALL NOT be modified.

#### Scenario: Record an expense transaction

- **GIVEN** an authenticated user with wallet `w1` having balance 5,000,000
- **WHEN** `POST /api/v1/transactions` is called with `{ "walletId": "w1", "amount": 50000, "type": "expense", "description": "Lunch" }`
- **THEN** the response SHALL be HTTP `201` with the created transaction
- **THEN** wallet `w1` balance SHALL be atomically decremented to 4,950,000

#### Scenario: Record a planned transaction without balance change

- **GIVEN** an authenticated user with wallet `w1` having balance 5,000,000
- **WHEN** `POST /api/v1/transactions` is called with `{ "walletId": "w1", "amount": 100000, "type": "expense", "description": "Planned groceries", "isPlanned": true }`
- **THEN** the response SHALL be HTTP `201`
- **THEN** wallet `w1` balance SHALL remain 5,000,000

#### Scenario: Record transaction without wallet

- **GIVEN** an authenticated user with no wallets
- **WHEN** `POST /api/v1/transactions` is called
- **THEN** the response SHALL be HTTP `400` with `{ "error": "VALIDATION" }` indicating wallet is required

---

### Requirement: Update Transaction

The system MUST expose `PATCH /api/v1/transactions/:transactionId` that updates an existing transaction for the authenticated user.

The endpoint SHALL accept any combination of: `amount`, `type`, `description`, `categoryId`, `budgetId`, `adminFee`, `date`, `isPlanned`, `walletId`, `targetWalletId`. The endpoint SHALL compute balance deltas (reverse the original transaction's effect and apply the updated one) atomically.

#### Scenario: Update transaction amount

- **GIVEN** an authenticated user with an expense transaction of 50,000 on wallet `w1`
- **WHEN** `PATCH /api/v1/transactions/:txId` is called with `{ "amount": 75000 }`
- **THEN** the response SHALL be HTTP `200` with the updated transaction
- **THEN** wallet `w1` balance SHALL be atomically adjusted by the delta (-25,000)

#### Scenario: Update non-existent transaction

- **WHEN** `PATCH /api/v1/transactions/non-existent-uuid` is called
- **THEN** the response SHALL be HTTP `404` with `{ "error": "NOT_FOUND" }`

### Requirement: Delete Transaction

The system MUST expose `DELETE /api/v1/transactions/:transactionId` and an MCP tool `delete_transaction` accepting `transactionId` (UUID string) to delete an existing transaction belonging to the authenticated user.

When deleting a realized transaction (`transactionIsPlanned == 0`), the system MUST atomically reverse the transaction's financial effect on wallet balances:
- For an `expense` transaction: increment the associated wallet balance by `transactionAmount + transactionAdminFee`.
- For an `income` transaction: decrement the associated wallet balance by `transactionAmount - transactionAdminFee`.
- For a `transfer` transaction: increment the source wallet balance by `transactionAmount + transactionAdminFee` and decrement the target wallet balance by `transactionAmount`.

When deleting a planned transaction (`transactionIsPlanned == 1`), the system SHALL delete the transaction record from the database without modifying any wallet balance.

If the transaction does not exist or belongs to another user, the system MUST respond with HTTP `404 Not Found` and error code `NOT_FOUND`.

Upon successful deletion, the system SHALL respond with HTTP `200 OK` and a confirmation JSON payload containing `success: true` and a descriptive message.

#### Scenario: Delete an expense transaction reverses wallet balance

- **GIVEN** an authenticated user with wallet `w1` having balance 4,950,000 and an expense transaction `tx_exp` of 50,000 with admin fee 2,500
- **WHEN** the client invokes `DELETE /api/v1/transactions/tx_exp` with a valid Bearer token
- **THEN** the system MUST respond with HTTP `200 OK`
- **THEN** wallet `w1` balance MUST be atomically incremented to 5,002,500 (+52,500)
- **THEN** the transaction record `tx_exp` MUST no longer exist in the database

#### Scenario: Delete an income transaction reverses wallet balance

- **GIVEN** an authenticated user with wallet `w1` having balance 10,000,000 and an income transaction `tx_inc` of 2,000,000 with admin fee 0
- **WHEN** the client invokes `DELETE /api/v1/transactions/tx_inc`
- **THEN** the system MUST respond with HTTP `200 OK`
- **THEN** wallet `w1` balance MUST be atomically decremented to 8,000,000 (-2,000,000)

#### Scenario: Delete a transfer reverses both source and target wallets

- **GIVEN** an authenticated user with source wallet `w1` (balance 4,000,000), target wallet `w2` (balance 2,000,000), and a transfer transaction `tx_trf` of amount 1,000,000 with admin fee 5,000
- **WHEN** the client invokes `DELETE /api/v1/transactions/tx_trf`
- **THEN** the system MUST respond with HTTP `200 OK`
- **THEN** source wallet `w1` balance MUST be atomically incremented to 5,005,000 (+1,005,000)
- **THEN** target wallet `w2` balance MUST be atomically decremented to 1,000,000 (-1,000,000)

#### Scenario: Delete a planned transaction removes record without balance impact

- **GIVEN** an authenticated user with wallet `w1` having balance 5,000,000 and a planned transaction `tx_plan` with `isPlanned == 1` and amount 300,000
- **WHEN** the client invokes `DELETE /api/v1/transactions/tx_plan`
- **THEN** the system MUST respond with HTTP `200 OK`
- **THEN** wallet `w1` balance MUST remain exactly 5,000,000
- **THEN** the transaction `tx_plan` MUST be deleted from the database

#### Scenario: Delete non-existent transaction returns 404

- **WHEN** a client invokes `DELETE /api/v1/transactions/00000000-0000-0000-0000-000000000000`
- **THEN** the system MUST respond with HTTP `404 Not Found` with `{ "error": "NOT_FOUND" }`

#### Scenario: Delete transaction via MCP tool delete_transaction

- **GIVEN** an authenticated MCP session with an existing transaction `tx1`
- **WHEN** the AI agent calls tool `delete_transaction` with `{ "transactionId": "tx1" }`
- **THEN** the tool MUST return a success message confirming deletion and balance reconciliation
---

### Requirement: Transfer Funds

The system MUST expose `POST /api/v1/transfers` that transfers funds between two wallets belonging to the authenticated user.

The request body SHALL accept: `sourceWalletId` (required UUID), `targetWalletId` (required UUID), `amount` (required, positive number), `description` (optional string), `adminFee` (optional number, defaults to 0), `categoryId` (optional UUID), `date` (optional ISO-8601).

The endpoint SHALL atomically deduct `amount + adminFee` from the source wallet and credit `amount` to the target wallet.

#### Scenario: Transfer between wallets

- **GIVEN** an authenticated user with wallet `w1` (balance 5,000,000) and wallet `w2` (balance 1,000,000)
- **WHEN** `POST /api/v1/transfers` is called with `{ "sourceWalletId": "w1", "targetWalletId": "w2", "amount": 500000 }`
- **THEN** the response SHALL be HTTP `201` with the created transfer transaction
- **THEN** wallet `w1` balance SHALL be 4,500,000 and wallet `w2` balance SHALL be 1,500,000

#### Scenario: Transfer with insufficient wallets

- **GIVEN** an authenticated user with fewer than 2 wallets
- **WHEN** `POST /api/v1/transfers` is called
- **THEN** the response SHALL be HTTP `400` with `{ "error": "VALIDATION" }` indicating at least 2 wallets are required

---

### Requirement: Create Debt or Loan

The system MUST expose `POST /api/v1/debts-loans` that creates a new debt or loan record for the authenticated user.

The request body SHALL accept: `personName` (required string), `amount` (required, positive number), `type` (optional, `debt` or `loan`, defaults to `debt`), `walletId` (optional UUID for balance adjustment), `dueDate` (optional ISO-8601 date), `notes` (optional string), `adjustWalletBalance` (optional boolean).

#### Scenario: Create a debt

- **GIVEN** an authenticated user
- **WHEN** `POST /api/v1/debts-loans` is called with `{ "personName": "Ali", "amount": 500000, "type": "debt" }`
- **THEN** the response SHALL be HTTP `201` with the created debt record having `debtLoanStatus: "unpaid"` and `debtLoanRemainingAmount: 500000`

#### Scenario: Create debt with missing person name

- **WHEN** `POST /api/v1/debts-loans` is called with `{ "amount": 500000 }`
- **THEN** the response SHALL be HTTP `400` with `{ "error": "VALIDATION", "field": "personName" }`

---

### Requirement: Repay Debt or Loan

The system MUST expose `POST /api/v1/debts-loans/:debtLoanId/repay` that records a repayment against an existing debt or loan.

The request body SHALL accept: `amount` (required, positive number), `walletId` (optional UUID for balance adjustment).

The endpoint SHALL decrement `remainingAmount` and update `debtLoanStatus` to `partially_paid` or `paid` as appropriate.

#### Scenario: Partial repayment

- **GIVEN** an authenticated user with debt `d1` having `remainingAmount: 500000`
- **WHEN** `POST /api/v1/debts-loans/d1/repay` is called with `{ "amount": 200000 }`
- **THEN** the response SHALL be HTTP `200` with `remainingAmount: 300000` and `debtLoanStatus: "partially_paid"`

#### Scenario: Full repayment

- **GIVEN** an authenticated user with debt `d1` having `remainingAmount: 200000`
- **WHEN** `POST /api/v1/debts-loans/d1/repay` is called with `{ "amount": 200000 }`
- **THEN** the response SHALL be HTTP `200` with `remainingAmount: 0` and `debtLoanStatus: "paid"`

---

### Requirement: Update Debt or Loan

The system MUST expose `PATCH /api/v1/debts-loans/:debtLoanId` that updates an existing debt or loan record.

The request body SHALL accept any combination of: `personName`, `amount`, `type`, `dueDate`, `notes`, `status`.

#### Scenario: Update debt due date

- **GIVEN** an authenticated user with debt `d1`
- **WHEN** `PATCH /api/v1/debts-loans/d1` is called with `{ "dueDate": "2026-12-31" }`
- **THEN** the response SHALL be HTTP `200` with the updated record

---

### Requirement: Contribute to Goal

The system MUST expose `POST /api/v1/goals/:goalId/contribute` that records a contribution toward a savings goal.

The request body SHALL accept: `amount` (required, positive number), `walletId` (optional UUID).

#### Scenario: Contribute to goal

- **GIVEN** an authenticated user with goal `g1` having `currentAmount: 1000000` and `targetAmount: 5000000`
- **WHEN** `POST /api/v1/goals/g1/contribute` is called with `{ "amount": 500000 }`
- **THEN** the response SHALL be HTTP `200` with the updated goal reflecting `currentAmount: 1500000`

---

### Requirement: Update Goal

The system MUST expose `PATCH /api/v1/goals/:goalId` that updates an existing goal.

The request body SHALL accept any combination of: `name`, `targetAmount`, `currentAmount`, `currency`, `deadline`, `status`, `notes`.

#### Scenario: Update goal target

- **GIVEN** an authenticated user with goal `g1`
- **WHEN** `PATCH /api/v1/goals/g1` is called with `{ "targetAmount": 10000000 }`
- **THEN** the response SHALL be HTTP `200` with the updated goal

---

### Requirement: Delete Goal

The system MUST expose `DELETE /api/v1/goals/:goalId` that deletes a goal belonging to the authenticated user.

#### Scenario: Delete existing goal

- **GIVEN** an authenticated user with goal `g1`
- **WHEN** `DELETE /api/v1/goals/g1` is called
- **THEN** the response SHALL be HTTP `200` with a confirmation message

#### Scenario: Delete non-existent goal

- **WHEN** `DELETE /api/v1/goals/non-existent-uuid` is called
- **THEN** the response SHALL be HTTP `404` with `{ "error": "NOT_FOUND" }`

---

### Requirement: Link Wallet to Goal

The system MUST expose `POST /api/v1/goals/:goalId/wallets` that links a wallet to a goal for automatic balance tracking.

The request body SHALL accept: `walletId` (required UUID).

#### Scenario: Link wallet to goal

- **GIVEN** an authenticated user with goal `g1` and wallet `w1`
- **WHEN** `POST /api/v1/goals/g1/wallets` is called with `{ "walletId": "w1" }`
- **THEN** the response SHALL be HTTP `200` confirming the link

---

### Requirement: Unlink Wallet from Goal

The system MUST expose `DELETE /api/v1/goals/:goalId/wallets/:walletId` that removes a wallet-goal link.

#### Scenario: Unlink wallet from goal

- **GIVEN** an authenticated user with goal `g1` linked to wallet `w1`
- **WHEN** `DELETE /api/v1/goals/g1/wallets/w1` is called
- **THEN** the response SHALL be HTTP `200` confirming the unlink

---

### Requirement: Update Recurring Template

The system MUST expose `PATCH /api/v1/recurring-templates/:templateId` that updates an existing recurring template.

The request body SHALL accept any combination of: `name`, `amount`, `frequency`, `nextRunDate`, `walletId`, `categoryId`, `type`, `description`, `isActive`, `adminFee`.

#### Scenario: Deactivate a recurring template

- **GIVEN** an authenticated user with template `t1` that is active
- **WHEN** `PATCH /api/v1/recurring-templates/t1` is called with `{ "isActive": false }`
- **THEN** the response SHALL be HTTP `200` with `templateIsActive: 0`

---

### Requirement: Delete Recurring Template

The system MUST expose `DELETE /api/v1/recurring-templates/:templateId` that deletes a recurring template.

#### Scenario: Delete existing template

- **GIVEN** an authenticated user with template `t1`
- **WHEN** `DELETE /api/v1/recurring-templates/t1` is called
- **THEN** the response SHALL be HTTP `200` with a confirmation message

#### Scenario: Delete non-existent template

- **WHEN** `DELETE /api/v1/recurring-templates/non-existent-uuid` is called
- **THEN** the response SHALL be HTTP `404` with `{ "error": "NOT_FOUND" }`

---

### Requirement: Consistent Error Response Format for Write Endpoints

All write endpoints SHALL return error responses in the same format as read endpoints:

```json
{ "error": "<SERVICE_ERROR_CODE>", "message": "<description>", "field": "<optional field name>" }
```

Where `SERVICE_ERROR_CODE` maps to HTTP status: `VALIDATION` → 400, `NOT_FOUND` → 404, `CONFLICT` → 409, `UNAUTHORIZED` → 401, `FORBIDDEN` → 403, `INTERNAL` → 500.

#### Scenario: Validation error includes field name

- **WHEN** any write endpoint receives invalid input
- **THEN** the response SHALL include `error: "VALIDATION"` and the specific `field` name when applicable

#### Scenario: Invalid JSON body

- **WHEN** any write endpoint receives a request with malformed JSON
- **THEN** the response SHALL be HTTP `400` with an appropriate error message
