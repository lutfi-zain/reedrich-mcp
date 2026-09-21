## MODIFIED Requirements

### Requirement: Goal Lifecycle Management
The system SHALL support creating, listing, updating, linking wallets to, and deleting financial goals scoped strictly to the authenticated user. The `contribute` action is removed: top-ups are recorded via the normal `record_transaction` / `transfer_funds` flow against linked wallets, and progress updates automatically on the next read.

#### Scenario: User creates a new financial goal
- **GIVEN** an authenticated user with valid credentials
- **WHEN** the user creates a goal with name "Emergency Fund", targetAmount 50000000, targetDate "2026-12-31", and currency "IDR"
- **THEN** the system SHALL persist the goal in the `goals` table with initial `goal_current_amount` of 0, `goal_status` "in_progress", and return the created goal object with its generated UUID.

#### Scenario: User contributes funds towards an existing goal
- **GIVEN** an existing goal with `goal_target_amount` 10000000 linked to a wallet with balance 2000000
- **WHEN** the user records an income of amount 3000000 into the linked wallet via `record_transaction`
- **THEN** the next goal read SHALL reflect `currentAmount` of 5000000 with derived progress percentage (50%), without any explicit goal contribution call.

#### Scenario: Contribute action is rejected as removed
- **GIVEN** an authenticated user with an existing goal
- **WHEN** the user calls `manage_goal` with `action: "contribute"`
- **THEN** the system SHALL reject the call with a `VALIDATION` error stating the action is deprecated and removed, directing the user to link wallets and record transactions instead.

#### Scenario: User attempts to access a goal belonging to another user
- **GIVEN** an authenticated user A and a goal belonging to user B
- **WHEN** user A requests to read, update, delete, link, or unlink the goal
- **THEN** the system SHALL return a 404 Not Found error and SHALL NOT disclose or modify the goal data.
