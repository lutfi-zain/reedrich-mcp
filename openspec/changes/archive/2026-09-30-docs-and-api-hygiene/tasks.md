## 1. Dead Route & Handler Cleanup

- [x] 1.1 Remove `goals.post("/:goalId/contribute")` route registration from `src/routes/goals.ts`.
- [x] 1.2 Retain `if (action === "contribute")` in `src/mcp.ts` to provide explicit RFC 2119 deprecation guidance pointing agents to wallet-linking and transactions.
- [x] 1.3 Clean up unused `contributeGoal` import in `src/routes/goals.ts` and `src/mcp.ts`.

## 2. OpenAPI & Route Parity Updates
- [x] 2.1 Remove path `/api/v1/goals/{goalId}/contribute` from `src/docs/openapi.ts`.
- [x] 2.2 Update `adjustWalletBalance` property to `default: true` on `POST /api/v1/debts-loans` and `POST /api/v1/debts-loans/{debtLoanId}/repay` in `src/docs/openapi.ts`.
- [x] 2.3 Document `patch` operation on `/api/v1/user/profile` path in `src/docs/openapi.ts`.

## 3. LLM Manifest & Documentation Updates
- [x] 3.1 Add `GET /api/v1/account-detail` documentation under Analytics & Summary in `src/docs/llms.ts`.
- [x] 3.2 Update `manage_recurring_template` actions list to `(create, list, update, delete)` in `src/docs/llms.ts`.
- [x] 3.3 Add `apply_recurring_template` tool documentation in `src/docs/llms.ts`.
- [x] 3.4 Update `README.md` MCP tool count to 18 tools and itemize all registered tools accurately.
- [x] 3.5 Remove `contributeGoal` reference from the project architecture tree in `README.md`.

## 4. Tests & Verification

- [x] 4.1 Update test in `tests/mcp.test.ts` to assert that `POST /api/v1/goals/:goalId/contribute` returns HTTP 404 Not Found.
- [x] 4.2 Run `npm run typecheck` to verify zero TypeScript static check errors.
- [x] 4.3 Run `npm test` to verify all unit test suites pass with zero regressions.
- [x] 4.4 Run `npm run test:local` to verify full local E2E journey integrity.
