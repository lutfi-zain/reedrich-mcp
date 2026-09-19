## Why

Business logic for all 12 MCP tools is inlined in a single 2800-line `createMCPServer` closure (`src/mcp.ts`), and a subset is duplicated verbatim in REST route handlers (`src/index.ts` — `financial_summary` alone is ~195 lines copy-pasted). A web app frontend (Vite React/Svelte on Cloudflare Pages) needs read-only REST endpoints for wallets, transactions, budgets, categories, goals, debts/loans, recurring templates, and the financial summary. Adding those endpoints by copy-pasting MCP tool logic a third time is unsustainable: every bug fix must apply in multiple places, validation diverges silently, and observability must be instrumented per-transport instead of once.

The same duplication exists in authentication: three near-identical functions (`extractAuthenticatedUserId`, `authenticateRestUser`, `resolveEffectiveUserId`) resolve user identity from tokens and API keys with subtly different fallback chains.

Extracting a shared service layer and unified auth function eliminates this duplication, enables a single observability hook for both transports, and provides the foundation for rolling out web app features incrementally — starting with read-only endpoints.

## What Changes

- **New `src/services/` module** — pure TypeScript functions encapsulating all business logic (validation, DB queries, computation). Transport-agnostic: no HTTP, no MCP, no Hono context. Each function signature: `(db, userId, params) → result | throw ServiceError`.
- **New `src/services/errors.ts`** — typed `ServiceError` class with discriminated codes (`VALIDATION`, `NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `CONFLICT`, `INTERNAL`) enabling transport adapters to map errors to correct HTTP status codes or MCP error format.
- **New `src/middleware/auth.ts`** — single `resolveUserId(db, secret, opts)` function replacing three redundant auth functions. Accepts bearer tokens, API keys, header keys, query params, and MCP tool-arg fallback. Backward-compatible with ChatGPT/Perplexity OAuth, Claude plugin, and direct API key usage.
- **New `src/routes/` module** — read-only REST API thin adapters mounted at `/api/v1/*`, each ~10-20 lines, delegating to service functions. Initial endpoints: `GET /api/v1/wallets`, `GET /api/v1/transactions`, `GET /api/v1/categories`, `GET /api/v1/budgets`, `GET /api/v1/debts-loans`, `GET /api/v1/goals`, `GET /api/v1/recurring-templates`, `GET /api/v1/summary`.
- **New `src/middleware/observability.ts`** — request timing, request ID propagation, and error categorization middleware applied to all routes (REST and MCP).
- **Refactored `src/mcp.ts`** — MCP tool handlers become thin adapters (~10-20 lines each) that delegate to service functions, eliminating inline business logic.
- **Refactored `src/index.ts`** — existing REST endpoints (`/api/v1/summary`, `/api/v1/goals`, `/api/v1/recurring-templates`, `/api/v1/feedback`) refactored to use service functions. Redundant `authenticateRestUser` and `extractAuthenticatedUserId` replaced by shared `resolveUserId`.
- **Deleted duplicate logic** — ~400 lines of duplicated financial summary, goal, recurring template, and feedback logic removed from `index.ts`.

### Non-breaking guarantees

- All existing MCP tool input schemas, output formats, and error messages remain unchanged.
- All existing REST endpoint paths, request formats, and response shapes remain unchanged.
- All existing OAuth endpoints (`/oauth/*`), discovery endpoints (`/.well-known/*`), and consent page remain unchanged.
- MCP in-tool `apiKey`/`token` argument fallback preserved for clients without HTTP header auth.

## Capabilities

### New Capabilities

- `service-layer`: Shared business logic extraction, typed error handling, and service function contracts for all financial domains (wallets, categories, budgets, transactions, transfers, summary, debts/loans, goals, recurring templates, auth, feedback).
- `rest-api-read`: Read-only REST API endpoints for web app consumption, covering all financial entities with pagination, filtering, and proper HTTP semantics.
- `observability`: Request-level and service-level observability middleware for timing, request ID propagation, error categorization, and metrics — applied uniformly to both REST and MCP transports.

### Modified Capabilities

_None — this change does not alter externally observable MCP tool behavior, resource URIs, or authentication protocols. It restructures internal implementation only._

## Non-Goals

- No new database schema or D1 migrations.
- No write/mutate REST endpoints (POST, PUT, DELETE) — those come in a future phase.
- No frontend (web app) implementation — this change only provides the backend foundation.
- No new OAuth scopes (e.g. `read`, `write`) — the existing `mcp` scope is sufficient for Phase 1.
- No third-party observability integration (Datadog, Grafana) — only the instrumentation hooks. Concrete export targets are a future decision.
- No changes to the ChatGPT Actions OpenAPI spec or Claude plugin configuration.

## Security, Multi-Tenancy, and Performance Impact

- **Multi-tenancy RLS preserved**: every service function receives `userId` as an explicit parameter; all Drizzle queries continue to include `eq(table.*UserId, userId)`. The auth consolidation does not change the trust boundary — `userId` is still resolved from verified tokens before any service call.
- **Auth backward compatibility**: the unified `resolveUserId` function maintains the exact same token resolution order and fallback chain. ChatGPT, Perplexity, Claude, and direct API key users see zero change.
- **Performance**: no new D1 queries, no additional network calls. Service extraction is a compile-time refactor — the same Drizzle queries execute at runtime. Bundle size may slightly decrease due to deduplication.
- **Edge compatibility**: all new code uses only Web Standard APIs compatible with Cloudflare Workers (workerd). No Node.js native bindings.
