# mcp-prompts Specification

## Purpose

Implements MCP Prompts protocol support (`prompts/list`, `prompts/get`) exposing server-defined workflow templates that guide AI agents through structured multi-step financial tasks such as onboarding, daily briefing, financial goal planning, and debt advisory.

## Requirements

### Requirement: MCP Prompts Capability Registration
The MCP server SHALL register the `prompts` capability alongside existing `tools` and `resources` capabilities. The server MUST implement handlers for `ListPromptsRequestSchema` and `GetPromptRequestSchema` from `@modelcontextprotocol/sdk/types.js`.

#### Scenario: Server advertises prompts capability
- **WHEN** an MCP client connects to the server
- **THEN** the server MUST advertise `prompts: {}` in its capability registration, enabling clients to discover and invoke prompt workflows

---

### Requirement: List Available Prompts
The server SHALL respond to `prompts/list` requests with the complete list of available prompt workflows. Each prompt entry MUST include `name`, `description`, and an optional `arguments` array describing accepted input parameters.

#### Scenario: Client requests list of available prompts
- **WHEN** an MCP client sends a `prompts/list` request
- **THEN** the server MUST return an array containing at minimum 4 prompt entries: `onboarding_assistant`, `daily_briefing`, `financial_planning`, and `debt_loan_advisor`

---

### Requirement: Onboarding Assistant Prompt
The server SHALL expose a prompt named `onboarding_assistant` that returns structured messages guiding an AI agent through complete first-time user registration and workspace setup.

The prompt MUST accept an optional `currency` argument (default: `"IDR"`).

The returned messages MUST instruct the agent to:
1. Handle user registration & authentication if unauthenticated: prompt for `firstName`, `lastName`, `email`, and `whatsappNumber` (with country code) to invoke `register_user`, or `apiKey` (`rd_live_...`) to invoke `login_user`.
2. Check the user's dynamic onboarding status from the registration or login response (`onboarding.needs` for `"wallet"` and `"categories"`).
3. Guide creation of at least one primary wallet via `manage_wallet(action: "create")` using the specified or default currency.
4. Offer to seed default categories using `manage_category(action: "seed_defaults")` — only with explicit user confirmation.
5. Optionally suggest monthly budget setup via `manage_budget(action: "create")`.
6. Confirm completion and hand off to transaction tools (`record_transaction`, `transfer_funds`).

#### Scenario: Get onboarding_assistant prompt with default currency
- **WHEN** a client sends `prompts/get` with `name: "onboarding_assistant"` and no arguments
- **THEN** the server MUST return messages containing step-by-step onboarding instructions referencing tool names `register_user`, `login_user`, `manage_category`, `manage_wallet`, and `manage_budget`, with currency defaulting to `"IDR"`

#### Scenario: Get onboarding_assistant prompt with custom currency
- **WHEN** a client sends `prompts/get` with `name: "onboarding_assistant"` and `arguments: { currency: "USD" }`
- **THEN** the returned messages MUST reference the specified currency `"USD"` in wallet and budget setup instructions alongside `register_user` registration steps
---

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

---

### Requirement: Unknown Prompt Handling
The server SHALL return an appropriate error when `prompts/get` is called with an unrecognized prompt name.

#### Scenario: Request unknown prompt name
- **WHEN** a client sends `prompts/get` with `name: "nonexistent_prompt"`
- **THEN** the server MUST throw an error indicating the prompt was not found
