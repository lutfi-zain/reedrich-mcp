## MODIFIED Requirements

### Requirement: Daily Briefing Prompt
The server SHALL expose a prompt named `daily_briefing` that returns structured messages guiding an AI agent through generating a comprehensive daily financial status report.

The prompt MUST accept an optional `date` argument (defaults to current date).

The returned messages MUST instruct the agent to:
1. Call `financial_summary` for the specified date range.
2. Read `reedrich://wallets/list` for current balances.
3. Read `reedrich://budgets/active` for budget utilization.
4. Read `reedrich://debts/active` for upcoming obligations.
5. Compile a concise briefing for the user.

#### Scenario: Get daily_briefing prompt with no arguments
- **WHEN** a client sends `prompts/get` with `name: "daily_briefing"` and no arguments
- **THEN** the server MUST return messages referencing tools `financial_summary` and resources `reedrich://wallets/list`, `reedrich://budgets/active`, and `reedrich://debts/active`

---

### Requirement: Financial Planning Prompt
The server SHALL expose a prompt named `financial_planning` that returns structured messages guiding an AI agent through projecting when a user can achieve a specific financial goal.

The prompt MUST accept required arguments:
- `goal_description` (string): What the user wants to achieve (e.g., "beli laptop").
- `target_amount` (number): The target cost.

The returned messages MUST instruct the agent to:
1. Call `financial_summary` to determine average monthly net savings (income minus expenses).
2. Read `reedrich://wallets/list` to assess available current balances.
3. Read `reedrich://debts/active` to account for outstanding debt commitments.
4. Calculate the remaining gap (`target_amount` minus allocatable existing balance).
5. Project the number of months needed: `gap / monthly_net_savings`.
6. Present the estimated target month/year to the user with assumptions stated.

#### Scenario: Get financial_planning prompt with goal arguments
- **WHEN** a client sends `prompts/get` with `name: "financial_planning"` and `arguments: { goal_description: "beli laptop", target_amount: 15000000 }`
- **THEN** the server MUST return messages containing the structured reasoning chain referencing `financial_summary`, `reedrich://wallets/list`, and `reedrich://debts/active`, and instructing the agent to compute projected timeline

#### Scenario: Get financial_planning prompt with missing required arguments
- **WHEN** a client sends `prompts/get` with `name: "financial_planning"` and no arguments
- **THEN** the server MUST return messages that instruct the agent to ask the user for the goal description and target amount before proceeding

---

### Requirement: Debt Loan Advisor Prompt
The server SHALL expose a prompt named `debt_loan_advisor` that returns structured messages guiding an AI agent through analyzing a user's active debts and loans, and suggesting repayment priorities.

The prompt accepts no arguments.

The returned messages MUST instruct the agent to:
1. Call `manage_debt_loan(action: "list")` to retrieve all active debts and loans.
2. Read `reedrich://debts/active` for aggregate totals.
3. Call `financial_summary` to understand available cash flow.
4. Analyze and prioritize: overdue items first, then by due date proximity, then by amount.
5. Present recommendations to the user.

#### Scenario: Get debt_loan_advisor prompt
- **WHEN** a client sends `prompts/get` with `name: "debt_loan_advisor"`
- **THEN** the server MUST return messages referencing tools `manage_debt_loan` and `financial_summary`, and resource `reedrich://debts/active`, with instructions to prioritize overdue debts
