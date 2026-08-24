## 1. Prompt Handler Enhancement

- [x] 1.1 Update `onboarding_assistant` prompt message text in `src/mcp.ts` to include Step 1: User Registration (`register_user`) and Returning User Login (`login_user`).

## 2. Parity & Documentation Updates

- [x] 2.1 Verify and synchronize `skills/reedrich-onboarding/SKILL.md` to ensure exact step sequencing and tool parameter alignment.
- [x] 2.2 Update onboarding documentation in `docs/CODING_AGENTS.md` and `README.md` to reflect the complete 5-stage onboarding flow.

## 3. Automated Tests & Verification

- [x] 3.1 Update prompt retrieval tests in `tests/mcp.test.ts` asserting `onboarding_assistant` messages include `register_user`, `login_user`, and registration parameters.
- [x] 3.2 Run `npm run typecheck` and `npm test` to verify full compilation and test suite passing.
