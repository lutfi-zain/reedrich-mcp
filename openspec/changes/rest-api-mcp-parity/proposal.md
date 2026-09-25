## Why

The REST API currently exposes only read endpoints (GET) and a handful of write endpoints (POST /goals, POST /recurring-templates, POST /recurring-templates/:id/apply, POST /feedback). All remaining write operations — creating wallets, recording transactions, managing debts, transferring funds — are available exclusively through MCP tools. Web apps, mobile clients, and third-party integrations that consume the REST API cannot perform any mutation without an MCP client, blocking adoption of a standalone web dashboard and any non-AI integration.

## What Changes

- Add 14 new REST endpoints that mirror existing MCP write operations, achieving full 1:1 parity between every MCP tool action and a corresponding REST verb+path (excluding `register_user` and `login_user`, which are covered by the existing OAuth 2.0 PKCE flow).
- Create 1 new route file (`src/routes/transfers.ts`) for `POST /api/v1/transfers`.
- Extend 6 existing route files with write handlers: `wallets.ts`, `categories.ts`, `budgets.ts`, `transactions.ts`, `debts-loans.ts`, `goals.ts`, `recurring-templates.ts`.
- Add all 14 new paths to the OpenAPI spec (`src/docs/openapi.ts`) and REST directory in `src/docs/llms.ts`.
- No new service functions, database migrations, or MCP tool changes. Every REST handler calls an existing, tested service function.

## Capabilities

### New Capabilities

- `rest-api-write`: Behavior contract for all REST write endpoints (POST, PATCH, DELETE) that mutate financial data. Covers wallets, categories, budgets, transactions, transfers, debts/loans, goals, and recurring templates.

### Modified Capabilities

- `rest-api-read`: Adding the consistent authentication and error handling contract for write endpoints, extending the existing read-only spec to cover the full REST surface. Specifically, the auth requirement now applies to all `/api/v1/*` endpoints (not just GET), and the `ServiceError` → HTTP status mapping applies uniformly.

## Non-Goals

- No new MCP tools or changes to existing MCP tool input schemas.
- No new database migrations or schema changes.
- No REST endpoints for `register_user` or `login_user` — OAuth 2.0 PKCE flow already covers authentication for web/mobile clients.
- No request body validation middleware beyond what the service layer already provides — services validate with `ServiceError(VALIDATION)`, centralized error handler maps to HTTP 400.

## Impact

- **Routes**: 7 existing route files extended + 1 new file (`transfers.ts`) + route registration in `routes/index.ts`.
- **Documentation**: `src/docs/openapi.ts` gains 14 new path entries; `src/docs/llms.ts` REST directory updated.
- **Security**: All write endpoints inherit the existing REST auth middleware (`routes/index.ts` use handler). Multi-tenant RLS enforced by service functions. No new auth surface.
- **Performance**: No impact — thin handlers delegate to existing service functions with zero additional queries.
- **Testing**: Local integration tests for each new write endpoint against local D1 dev server.
