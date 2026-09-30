## Context

Over successive feature releases, the platform added major capabilities (e.g. goal-wallet derived balances, account-detail snapshots, planned transaction materialization, transaction type mutation). However, documentation and contract specifications in `src/docs/openapi.ts`, `src/docs/llms.ts`, `README.md`, and certain route handlers retained deprecated or inaccurate signatures.

See `proposal.md` for full problem statement.

## Goals / Non-Goals

**Goals:**
- Eliminate the dead `POST /api/v1/goals/:goalId/contribute` route from `src/routes/goals.ts`, `src/docs/openapi.ts`, and dead handler code in `src/mcp.ts`.
- Fix the default value of `adjustWalletBalance` in OpenAPI 3.0 schemas to `true` on debt/loan operations to match service layer behavior.
- Document `PATCH /api/v1/user/profile` alias in OpenAPI.
- Add `GET /api/v1/account-detail` to `src/docs/llms.ts`.
- Demarcate `apply_recurring_template` as a top-level tool in `src/docs/llms.ts` and remove `apply` from `manage_recurring_template`.
- Update `README.md` to reflect the truthful count of 18 MCP tools and clean up architectural references.

**Non-Goals:**
- Schema changes in Cloudflare D1 or migrations.
- Altering core financial calculation algorithms.

## Decisions

### 1. Complete Removal of `POST /goals/:id/contribute` vs. Keeping as 400

- **Decision**: Completely unmount the route from `src/routes/goals.ts` and remove it from `src/docs/openapi.ts`.
- **Alternatives Considered**:
  - *Keep route and document as deprecated in OpenAPI*:
    *Rejected*: The endpoint has returned a hard `VALIDATION` error since `goal-wallet-links` was merged. Keeping an endpoint in OpenAPI that always returns HTTP 400 confuses clients and OpenAPI client generators. Removing it returns standard HTTP 404.
- **Rationale**: Clean cutover per repository guidelines. Inoperative endpoints should not be published in public API specifications.

### 2. OpenAPI Debt/Loan Default Corrections

- **Decision**: Update `adjustWalletBalance` property to `default: true` in `createDebtLoan` and `repayDebtLoan` schemas in `src/docs/openapi.ts`.
- **Rationale**: `src/services/debt-loan.ts` checks `const shouldAdjustWallet = adjustWalletBalance !== false;`. When omitted, it resolves to `true`. Documenting `default: false` was an artifact error that misleads API consumers.

### 3. LLMs Manifest Tool Alignment

- **Decision**:
  - In `src/docs/llms.ts`, update Section 5 / Tools Reference to document `manage_recurring_template (create, list, update, delete)` and explicitly add `apply_recurring_template (realize planned occurrence)` as an independent tool.
  - Add `GET /api/v1/account-detail` under Section 1 (Analytics & Summary).
- **Rationale**: Autonomous agents relying on `/llms.txt` rely on exact tool names and action parameters. Misnaming actions causes agents to hallucinate invalid arguments and fail tool calls.

### 4. README MCP Tool Catalog Update

- **Decision**: Update `README.md` header from `13 MCP Tools` to `18 MCP Tools`, list all 18 tools in the bullet list, and remove `contributeGoal` from the file tree diagram.
- **Rationale**: Eliminates documentation lag and reflects full system capabilities.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                       DOCUMENTATION & CONTRACT HYGIENE MAP                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   src/routes/goals.ts          ──> Remove POST /:goalId/contribute              │
│   src/docs/openapi.ts          ──> Remove /goals/{id}/contribute                │
│                                ──> Fix adjustWalletBalance default: true        │
│                                ──> Add PATCH /api/v1/user/profile              │
│   src/docs/llms.ts             ──> Add GET /api/v1/account-detail               │
│                                ──> Fix manage_recurring_template actions       │
│                                ──> Document apply_recurring_template tool       │
│   README.md                    ──> Update to 18 MCP tools                       │
│                                ──> Remove contributeGoal reference              │
│   src/mcp.ts                   ──> Remove action === 'contribute' dead branch   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Risks / Trade-offs

- **[Risk: Breaking outdated test asserting 400 on /contribute]** ➔ **Mitigation**: Update test in `tests/mcp.test.ts` to assert that the contribute route returns 404 Not Found (or remove the dead route test assertion).
- **[Risk: Breaking downstream clients relying on /contribute]** ➔ **Mitigation**: Zero risk of functional breakage because the endpoint was already throwing a fatal validation error; clients were already forced to use `link_wallet` and `record_transaction`/`transfer_funds`.
