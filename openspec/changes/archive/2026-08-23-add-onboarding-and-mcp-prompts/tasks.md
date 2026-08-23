## 1. Core Logic — Onboarding Helper & Default Categories

- [x] 1.1 Implement `evaluateOnboarding(db, userId)` helper function in `src/mcp.ts` that queries wallet, category, and budget counts and returns the `{ isComplete, needs, suggestions, message }` object as specified in design Decision 2
- [x] 1.2 Define `DEFAULT_CATEGORIES` constant array in `src/mcp.ts` with the 10 predefined expense/income categories (names, types, icons) as specified in design Decision 3

## 2. MCP Tool Handler Changes

- [x] 2.1 Enrich `register_user` handler: after successful registration, call `evaluateOnboarding()` and include the returned `onboarding` object in the JSON response alongside existing fields (userId, name, token, apiKey)
- [x] 2.2 Enrich `login_user` handler: after successful login, call `evaluateOnboarding()` and include the returned `onboarding` object in the JSON response alongside existing fields
- [x] 2.3 Add `seed_defaults` action to `manage_category` tool: update the tool's `inputSchema` enum from `["list", "create"]` to `["list", "create", "seed_defaults"]` and update the tool description
- [x] 2.4 Implement `seed_defaults` action handler in `manage_category`: query existing user categories, filter `DEFAULT_CATEGORIES` to exclude name conflicts (case-insensitive), batch-insert remaining, return created and skipped counts with the full created category list
- [x] 2.5 Add precondition guardrail to `record_transaction`: insert wallet count check before argument validation, return `isError: true` with descriptive onboarding guidance message when count is 0
- [x] 2.6 Add precondition guardrail to `transfer_funds`: insert wallet count check before argument validation, return `isError: true` with message about needing at least 2 wallets when count is 0

## 3. MCP Prompts — Protocol Registration

- [x] 3.1 Add `ListPromptsRequestSchema` and `GetPromptRequestSchema` imports from `@modelcontextprotocol/sdk/types.js`
- [x] 3.2 Update server capability registration from `{ tools: {}, resources: {} }` to `{ tools: {}, resources: {}, prompts: {} }`
- [x] 3.3 Implement `ListPromptsRequestSchema` handler returning 4 prompt entries (onboarding_assistant, daily_briefing, financial_planning, debt_loan_advisor) with their names, descriptions, and argument definitions
- [x] 3.4 Implement `GetPromptRequestSchema` handler with switch on `request.params.name`: return structured messages for each prompt, throw error for unknown prompt names

## 4. MCP Prompts — Content Templates

- [x] 4.1 Write `onboarding_assistant` prompt messages: step-by-step setup instructions referencing `manage_category`, `manage_wallet`, `manage_budget` tools, with `currency` argument interpolation (default "IDR")
- [x] 4.2 Write `daily_briefing` prompt messages: instructions to call `financial_summary`, read `finance://wallets/list`, `finance://budgets/active`, `finance://debts/active`, and compile briefing, with optional `date` argument
- [x] 4.3 Write `financial_planning` prompt messages: structured reasoning chain for projecting goal achievement timeline using `financial_summary`, `finance://wallets/list`, `finance://debts/active`, with `goal_description` and `target_amount` arguments. Include fallback instructions when arguments are missing
- [x] 4.4 Write `debt_loan_advisor` prompt messages: instructions to call `manage_debt_loan(action: "list")`, read `finance://debts/active`, call `financial_summary`, and prioritize repayment by overdue status, due date proximity, then amount

## 5. Unit Tests

- [x] 5.1 Add unit test in `tests/mcp.test.ts`: verify `register_user` response contains `onboarding` object with `isComplete: false`, `needs: ["wallet", "categories"]` for a brand-new user
- [x] 5.2 Add unit test: verify `login_user` response contains `onboarding` object with correct state after user has created a wallet but no categories
- [x] 5.3 Add unit test: verify `login_user` response contains `onboarding.isComplete: true` when user has ≥1 wallet and ≥1 category
- [x] 5.4 Add unit test: verify `manage_category(action: "seed_defaults")` creates all 10 default categories for a new user and returns them
- [x] 5.5 Add unit test: verify `manage_category(action: "seed_defaults")` skips existing categories (case-insensitive name match) and only creates missing ones
- [x] 5.6 Add unit test: verify `record_transaction` returns `isError: true` with onboarding guidance when user has 0 wallets
- [x] 5.7 Add unit test: verify `transfer_funds` returns `isError: true` with onboarding guidance when user has 0 wallets
- [x] 5.8 Add unit test: verify `prompts/list` returns 4 prompts with correct names and argument schemas
- [x] 5.9 Add unit test: verify `prompts/get` for each of the 4 prompts returns non-empty messages array
- [x] 5.10 Add unit test: verify `prompts/get` with unknown prompt name throws an error
- [x] 5.11 Run `npm run typecheck` to verify all TypeScript compilation passes with no errors

## 6. Integration Tests

- [x] 6.1 Add integration test step in `tests/integration.test.ts`: verify register → onboarding incomplete → seed_defaults → login → onboarding still incomplete (no wallet) → create wallet → login → onboarding complete flow
- [x] 6.2 Add integration test step: verify `record_transaction` guardrail rejects when no wallets exist, then succeeds after wallet+category setup
- [x] 6.3 Run full integration test suite via `npm run test:local` to ensure all existing and new tests pass

## 7. Documentation

- [x] 7.1 Update `README.md`: add MCP Prompts section documenting the 4 available prompts, their descriptions, and arguments
- [x] 7.2 Update `TOOLS.md`: document `seed_defaults` action for `manage_category`, onboarding field in auth responses, and precondition guardrails
- [x] 7.3 Update `finance://db/schema` resource text in `src/mcp.ts` to mention prompts capability if applicable
