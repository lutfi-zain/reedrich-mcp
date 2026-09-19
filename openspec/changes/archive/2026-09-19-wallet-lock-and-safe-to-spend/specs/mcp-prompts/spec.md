## MODIFIED Requirements

### Requirement: Daily Briefing Prompt
The server SHALL expose a prompt named `daily_briefing` that returns structured messages guiding an AI agent through generating a comprehensive daily financial status report emphasizing Safe-to-Spend liquidity.

The prompt MUST accept an optional `date` argument (defaults to current date).

The returned messages MUST instruct the agent to:
1. Call `financial_summary` for the specified date range to extract `safeToSpend`, `dailySafeToSpend`, `spendableCash`, and `lockedCash`.
2. Read `reedrich://wallets/list` for current balances and lock status.
3. Read `reedrich://budgets/active` for budget utilization.
4. Read `reedrich://debts/active` for upcoming obligations.
5. Compile a concise briefing for the user highlighting their daily safe-to-spend allowance while reassuring that protected capital reserves remain intact.

#### Scenario: Get daily_briefing prompt with no arguments
- **WHEN** a client sends `prompts/get` with `name: "daily_briefing"` and no arguments
- **THEN** the server MUST return messages referencing tools `financial_summary` and resources `reedrich://wallets/list`, `reedrich://budgets/active`, and `reedrich://debts/active`, instructing the agent on safe-to-spend liquidity

---

### Requirement: Financial Planning Prompt
The server SHALL expose a prompt named `financial_planning` that returns structured messages guiding an AI agent through projecting when a user can achieve a specific financial goal without liquidating locked emergency reserves.

The prompt MUST accept required arguments:
- `goal_description` (string): What the user wants to achieve (e.g., "beli laptop").
- `target_amount` (number): The target cost.

The returned messages MUST instruct the agent to:
1. Call `financial_summary` to determine average monthly net savings and inspect `spendableCash` versus `lockedCash`.
2. Read `reedrich://wallets/list` to assess available idle spendable balances (`isLocked: false`), strictly avoiding unprompted allocation of locked emergency reserves (`isLocked: true`).
3. Read `reedrich://debts/active` to account for outstanding debt commitments that reduce disposable savings.
4. Calculate the remaining gap (`target_amount` minus allocatable idle spendable balance).
5. Project the number of months needed: `gap / monthly_net_savings`.
6. Present the estimated target month/year to the user with assumptions stated.

#### Scenario: Get financial_planning prompt with goal arguments
- **WHEN** a client sends `prompts/get` with `name: "financial_planning"` and `arguments: { goal_description: "beli laptop", target_amount: 15000000 }`
- **THEN** the server MUST return messages containing the structured reasoning chain referencing `financial_summary`, `reedrich://wallets/list`, and `reedrich://debts/active`, and instructing the agent to compute projected timeline using idle spendable balances while preserving locked reserves

#### Scenario: Get financial_planning prompt with missing required arguments
- **WHEN** a client sends `prompts/get` with `name: "financial_planning"` and no arguments
- **THEN** the server MUST return messages that instruct the agent to ask the user for the goal description and target amount before proceeding
