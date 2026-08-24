## MODIFIED Requirements

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
