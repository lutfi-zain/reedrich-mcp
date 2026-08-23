## MODIFIED Requirements

### Requirement: Precondition Guardrails on Transaction Tools
The `record_transaction` tool SHALL validate that the authenticated user has at least 1 wallet before proceeding. If the user has 0 wallets, the tool MUST reject the request with a descriptive error message guiding the agent toward onboarding setup in Reedrich.

The `transfer_funds` tool SHALL apply the same precondition check.

#### Scenario: Record transaction rejected when user has no wallets
- **WHEN** an authenticated user with 0 wallets calls `record_transaction`
- **THEN** the system MUST return an error with `isError: true` and a message indicating that the user needs to create a wallet first, suggesting the `manage_wallet` tool or the `onboarding_assistant` prompt

#### Scenario: Transfer funds rejected when user has no wallets
- **WHEN** an authenticated user with 0 wallets calls `transfer_funds`
- **THEN** the system MUST return an error with `isError: true` and a message indicating that at least 2 wallets are required for transfers, suggesting wallet creation first

#### Scenario: Transaction proceeds normally when user has wallets
- **WHEN** an authenticated user with ≥1 wallet calls `record_transaction` with valid parameters
- **THEN** the system MUST process the transaction normally without any onboarding-related blocking
