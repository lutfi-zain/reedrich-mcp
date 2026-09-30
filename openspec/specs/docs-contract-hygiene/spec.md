# docs-contract-hygiene Specification

## Purpose

Defines the behavioral specification and contract verification standards for public API documentation hygiene, OpenAPI 3.0 schema fidelity, machine-readable LLM manifest (`/llms.txt`) completeness, and dead-route elimination across the Reedrich edge platform.

## Requirements

### Requirement: OpenAPI & Route Contract Symmetry

The system's OpenAPI 3.0 specification (`/openapi.json` and Scalar interactive UI at `/docs`) MUST strictly mirror the runtime behavior of deployed endpoints:

1. **Dead Route Removal**:
   - The deprecated route `POST /api/v1/goals/:goalId/contribute` SHALL NOT be registered in the router and SHALL NOT appear in OpenAPI paths.
   - Any HTTP request to `/api/v1/goals/:goalId/contribute` MUST return HTTP `404 Not Found`.

2. **Schema Property Default Alignment**:
   - In OpenAPI schemas for `createDebtLoan` (`POST /api/v1/debts-loans`) and `repayDebtLoan` (`POST /api/v1/debts-loans/{debtLoanId}/repay`), the `adjustWalletBalance` property MUST be documented with `default: true`.

3. **Alias Route Documentation**:
   - The alias endpoint `PATCH /api/v1/user/profile` MUST be documented in OpenAPI with identical request body and response schemas as `PATCH /api/v1/me`.

#### Scenario: Requesting removed contribute endpoint returns 404

- **GIVEN** an authenticated user with a goal `g1`
- **WHEN** the client invokes `POST /api/v1/goals/g1/contribute`
- **THEN** the system MUST respond with HTTP `404 Not Found`

#### Scenario: OpenAPI schema reflects true default for adjustWalletBalance

- **WHEN** a client or OpenAPI generator inspects `GET /openapi.json`
- **THEN** the paths `/api/v1/debts-loans` and `/api/v1/debts-loans/{debtLoanId}/repay` MUST declare `adjustWalletBalance` with `default: true`

#### Scenario: OpenAPI schema documents user profile patch alias

- **WHEN** a client inspects `GET /openapi.json`
- **THEN** `/api/v1/user/profile` MUST include a `patch` operation definition matching `/api/v1/me`

---

### Requirement: LLM Manifest & Tool Registry Accuracy

The machine-readable LLM documentation (`/llms.txt`, `/llm.txt`) and developer documentation (`README.md`) MUST accurately describe the tool surface and REST resources:

1. **Analytical Snapshot Discovery**:
   - The endpoint `GET /api/v1/account-detail` MUST be documented under the Analytics & Summary section of `/llms.txt`.

2. **Recurring Tools Demarcation**:
   - The `manage_recurring_template` tool MUST be documented with actions `create`, `list`, `update`, and `delete`.
   - The `apply_recurring_template` tool MUST be documented as an autonomous top-level tool for realizing planned occurrences.

3. **Total Tool Count Truthfulness**:
   - Documentation in `README.md` MUST state the exact count of MCP tools registered in `src/mcp.ts` (18 tools), itemizing each tool without omitting recently introduced tools or referencing deprecated functions.

#### Scenario: AI agent discovers account-detail in LLM manifest

- **WHEN** an AI agent retrieves `GET /llms.txt`
- **THEN** the text MUST contain `GET /api/v1/account-detail` with its query parameters (`startDate`, `endDate`) and return structure

#### Scenario: AI agent discovers accurate recurring template tool signatures

- **WHEN** an AI agent inspects `/llms.txt` tools reference
- **THEN** `manage_recurring_template` SHALL NOT include `apply` in its action list
- **THEN** `apply_recurring_template` SHALL be listed as an independent tool with its required parameters
