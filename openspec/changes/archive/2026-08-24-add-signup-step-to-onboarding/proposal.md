## Why

The current `onboarding_assistant` MCP prompt begins by checking the user's onboarding status, assuming the user is already authenticated. When a new user or autonomous AI agent initiates onboarding without existing credentials, the prompt lacks explicit instructions on collecting user details and calling `register_user`. Adding an explicit signup step directly to the onboarding workflow closes this gap, providing seamless end-to-end guidance from first-time registration to wallet setup and transaction readiness.

## What Changes

- Update `onboarding_assistant` MCP prompt in `src/mcp.ts` to include Step 1: User Registration & Authentication (guiding the agent to prompt for `firstName`, `lastName`, `email`, and `whatsappNumber` to call `register_user`, or `apiKey` to call `login_user`).
- Update `mcp-prompts` specification to require registration and login instructions within the `onboarding_assistant` prompt.
- Ensure `skills/reedrich-onboarding/SKILL.md` maintains exact structural and argument alignment with the updated prompt.
- Update automated test suite in `tests/mcp.test.ts` to verify `onboarding_assistant` references `register_user` and `login_user`.

## Capabilities

### New Capabilities
<!-- None: this change enhances existing prompt workflows. -->

### Modified Capabilities
- `mcp-prompts`: Update `onboarding_assistant` prompt requirement to mandate first-time user registration and returning user authentication instructions.

## Impact

- **Agent Autonomy**: AI agents calling `onboarding_assistant` can guide unauthenticated users through complete registration without needing out-of-band prompt engineering.
- **Zero Breaking Changes**: Tool schemas (`register_user`, `login_user`, `manage_wallet`, `manage_category`, `manage_budget`), database schemas, and endpoints remain unchanged and 100% backward-compatible.

## Non-Goals

- Modifying the parameters, validation logic, or return payloads of `register_user` or `login_user`.
- Modifying D1 database schema or table definitions.
- Changing authentication token expiration policies or hashing algorithms.
