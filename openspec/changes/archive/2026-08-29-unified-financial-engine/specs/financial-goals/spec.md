## Purpose
Provides end-to-end financial goal tracking, target amount management, contribution recording, and savings pacing calculations within Reedrich MCP and ChatGPT Actions.

## ADDED Requirements

### Requirement: Goal Lifecycle Management
The system SHALL support creating, listing, updating, contributing to, and deleting financial goals scoped strictly to the authenticated user.

#### Scenario: User creates a new financial goal
- **GIVEN** an authenticated user with valid credentials
- **WHEN** the user creates a goal with name "Emergency Fund", targetAmount 50000000, targetDate "2026-12-31", and currency "IDR"
- **THEN** the system SHALL persist the goal in the `goals` table with initial `goal_current_amount` of 0, `goal_status` "in_progress", and return the created goal object with its generated UUID.

#### Scenario: User contributes funds towards an existing goal
- **GIVEN** an existing goal with `goal_target_amount` 10000000 and `goal_current_amount` 2000000
- **WHEN** the user submits a contribution of amount 3000000 with optional walletId
- **THEN** the system SHALL update `goal_current_amount` to 5000000, calculate the new progress percentage (50%), and if walletId is provided, record the corresponding expense/transfer transaction atomically.

#### Scenario: User attempts to access a goal belonging to another user
- **GIVEN** an authenticated user A and a goal belonging to user B
- **WHEN** user A requests to read, update, or delete the goal
- **THEN** the system SHALL return a 404 Not Found error and SHALL NOT disclose or modify the goal data.

### Requirement: Goal Pacing & Velocity Metrics
The system SHALL compute dynamic pacing metrics for active goals based on elapsed time, remaining target balance, and target deadline.

#### Scenario: Active goal pacing calculation
- **GIVEN** an active goal with targetAmount 12000000, currentAmount 3000000, and 90 days remaining until targetDate
- **WHEN** the user requests a financial summary or goal status
- **THEN** the system SHALL return the remaining amount (9000000), percentage achieved (25%), required daily savings (100000/day), and required monthly savings (3000000/month).
