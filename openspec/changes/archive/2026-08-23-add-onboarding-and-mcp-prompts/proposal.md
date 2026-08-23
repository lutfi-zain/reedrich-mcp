## Why

AI agents connecting to the Eve Finance MCP Server have no structured way to determine whether a newly registered user has completed essential setup (wallets, categories). Without this guidance, agents may attempt to record transactions against accounts with zero wallets, resulting in cryptic foreign-key errors rather than helpful onboarding prompts.

Additionally, the MCP Server currently exposes only tools and resources — it does not leverage MCP's **Prompts** capability. Prompts are server-defined workflow templates that teach AI agents *how* to orchestrate multi-step financial tasks (onboarding, daily briefing, financial goal planning, debt advisory). Without prompts, every AI client must independently invent these reasoning chains, leading to inconsistent user experiences.

## What Changes

1. **Onboarding Status Enrichment**: `register_user` and `login_user` responses will include a dynamic `onboarding` object indicating whether the user has completed required setup (≥1 wallet, ≥1 category). Budget setup is suggested but not required.

2. **Default Category Seeding**: A new `seed_defaults` action on `manage_category` allows AI agents to bulk-create standard expense and income categories in a single tool call, contingent on explicit user confirmation.

3. **MCP Prompts Registration**: The server will implement `prompts/list` and `prompts/get` handlers exposing four workflow prompts:
   - `onboarding_assistant` — Guides new user setup (wallets + categories, budget optional).
   - `daily_briefing` — Summarizes current financial health (balances, budgets, due debts).
   - `financial_planning` — Projects when a savings goal can be reached based on income/expense patterns and existing commitments.
   - `debt_loan_advisor` — Analyzes active debts/loans and suggests repayment priorities.

4. **Precondition Guardrails**: `record_transaction` and `transfer_funds` will return descriptive error messages when invoked by users who have no wallets, guiding the agent toward onboarding instead of failing silently.

## Capabilities

### New Capabilities
- `onboarding`: Dynamic onboarding state evaluation, auth response enrichment, and default category seeding.
- `mcp-prompts`: MCP Prompts protocol support (`prompts/list`, `prompts/get`) with four agent workflow templates.

### Modified Capabilities
- `debt-loan-management`: No requirement-level changes — only consumed as a data source by prompts.

## Impact

- **Modified files**: `src/mcp.ts` (tool handlers, prompt handlers, auth response enrichment), `tests/mcp.test.ts`, `tests/integration.test.ts`
- **New MCP protocol handlers**: `ListPromptsRequestSchema`, `GetPromptRequestSchema` from `@modelcontextprotocol/sdk`
- **Modified tool responses**: `register_user` and `login_user` return additional `onboarding` field
- **New tool action**: `manage_category` gains `seed_defaults` action
- **No database schema changes**: Onboarding state is dynamically evaluated from existing wallet/category counts
- **No breaking changes**: All existing tool input schemas remain backward-compatible
- **Security**: All onboarding queries and prompt data are RLS-scoped to the authenticated userId
- **Edge compatibility**: No new dependencies; uses existing Drizzle ORM queries on D1
