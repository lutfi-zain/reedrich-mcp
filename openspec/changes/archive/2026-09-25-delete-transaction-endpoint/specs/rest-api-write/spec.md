## ADDED Requirements

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
