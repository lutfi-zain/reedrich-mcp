## 1. Database Schema & Migration

- [x] 1.1 Add `goals` and `recurringTemplates` tables and indices to `src/db/schema.ts`
- [x] 1.2 Create SQL migration file `drizzle/0005_add_goals_and_recurring_templates.sql` ensuring Zero-Remote-Deletion compliance
- [x] 1.3 Update Drizzle journal metadata to reflect migration `0005`

## 2. Core Financial Engine & Utilities

- [x] 2.1 Implement FX rate engine with live fetching, 3s timeout, and edge baseline fallback in `src/utils/fx.ts`
- [x] 2.2 Implement goal pacing & velocity calculation utilities in `src/utils/goals.ts`
- [x] 2.3 Implement recurring template date advancement and virtual cashflow projection in `src/utils/recurring.ts`

## 3. MCP Tools Implementation

- [x] 3.1 Implement `manage_goal` tool in `src/mcp.ts` with create, list, update, contribute, and delete actions
- [x] 3.2 Implement `manage_recurring_template` tool in `src/mcp.ts` with create, list, update, and delete actions
- [x] 3.3 Implement `apply_recurring_template` tool in `src/mcp.ts` for atomic transaction creation and date advancement
- [x] 3.4 Enhance `financial_summary` tool in `src/mcp.ts` with multi-currency consolidation, goal pacing metrics, and 30-day cashflow projections

## 4. REST API & OpenAPI Specification

- [x] 4.1 Mount `/api/v1/goals` and `/api/v1/recurring-templates` endpoints in `src/index.ts`
- [x] 4.2 Update `/api/v1/summary` handler in `src/index.ts` to output consolidated currency values and goal pacing
- [x] 4.3 Update OpenAPI 3.0 specification at `/openapi.json` to describe new endpoints and request/response schemas

## 5. Testing & Verification

- [x] 5.1 Add unit and integration tests for `manage_goal` and goal pacing in `tests/mcp.test.ts`
- [x] 5.2 Add unit and integration tests for FX rate conversion and fallback in `tests/mcp.test.ts`
- [x] 5.3 Add unit and integration tests for `manage_recurring_template`, `apply_recurring_template`, and cashflow projections in `tests/mcp.test.ts`
- [x] 5.4 Run local test suite and verify 100% test pass rate with zero type errors
