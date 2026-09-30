## Why

As the Reedrich MCP & REST platform evolved through multiple capabilities, several documentation files, OpenAPI specifications, and router endpoints accumulated stale artifacts. Specifically:
1. `POST /api/v1/goals/:goalId/contribute` is still advertised in OpenAPI as returning HTTP 200 with Goal data, despite the implementation intentionally throwing a `VALIDATION` error since goals migrated to wallet-linked derived balances.
2. `README.md` underreports MCP tool count as 13 (while 18 tools are actively exposed in `src/mcp.ts`) and still lists `contributeGoal` in its architecture tree.
3. `src/docs/llms.ts` omits the high-value `GET /api/v1/account-detail` endpoint and misdocuments `apply` as an action of `manage_recurring_template` (which causes runtime errors if invoked, as `apply_recurring_template` is a distinct standalone tool).
4. OpenAPI documents `adjustWalletBalance` with `default: false` on debt/loan operations, whereas runtime implementation and MCP tool schemas default to `true`.
5. `PATCH /api/v1/user/profile` is mounted at runtime but omitted from OpenAPI.

Cleaning up these discrepancies ensures AI coding agents, OpenAPI generators, and developers interact with truthful, reliable contracts without encountering unexpected failures.

## What Changes

- **Route & MCP Cleanup**:
  - Remove dead route `POST /api/v1/goals/:goalId/contribute` from `src/routes/goals.ts`.
  - Remove obsolete `if (action === "contribute")` dead code branch in `src/mcp.ts`.
  - Remove unused `contributeGoal` export from `src/services/goal.ts` (or retain as private deprecated stub if needed).
- **OpenAPI Specification Parity (`src/docs/openapi.ts`)**:
  - Remove path `/api/v1/goals/{goalId}/contribute`.
  - Fix `adjustWalletBalance` property definition to `default: true` on `POST /api/v1/debts-loans` and `POST /api/v1/debts-loans/{debtLoanId}/repay`.
  - Document `PATCH` operation on `/api/v1/user/profile` (matching `/api/v1/me`).
- **LLM Manifest Accuracy (`src/docs/llms.ts`)**:
  - Add `GET /api/v1/account-detail` to Section 1 (Analytics & Summary).
  - Correct `manage_recurring_template` documentation to `(create, list, update, delete)`.
  - Document `apply_recurring_template` as a separate top-level tool.
- **Project Documentation (`README.md`)**:
  - Update MCP tools count from 13 to 18.
  - List all 18 MCP tools accurately.
  - Remove `contributeGoal` from architecture tree.
- **Tests**:
  - Update `tests/mcp.test.ts` to verify 404 for removed `/contribute` route, and ensure all existing integration and unit test suites remain clean.

## Capabilities

### New Capabilities
- `docs-contract-hygiene`: Contract alignment, OpenAPI accuracy, and documentation hygiene across all public REST routes and MCP tools.

### Modified Capabilities
None.

## Non-Goals

- Altering database schema or tables in Cloudflare D1.
- Modifying business logic or calculation algorithms in services.
- Introducing new functional features or endpoints.

## Impact & Constraints

- **Multi-Tenant RLS**: Remains untouched and strictly enforced.
- **Zero Remote Deletions**: Purely non-destructive documentation, OpenAPI, and dead-route cleanup.
- **Zero Breaking Changes for Valid Calls**: The `/contribute` endpoint was already throwing errors at runtime, so removing it formalizes existing behavior.
