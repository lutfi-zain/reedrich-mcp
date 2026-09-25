## Context

The REST API surface currently covers read endpoints and a few write endpoints (POST /goals, POST /recurring-templates, POST /recurring-templates/:id/apply, POST /feedback). All remaining write operations are MCP-only. The service layer is fully transport-neutral: every MCP tool action delegates to a service function that accepts `(db, userId, params)` and throws `ServiceError` on validation failures. The centralized REST error handler in `src/routes/index.ts` already maps `ServiceError` codes to HTTP status codes. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- Add 14 REST write endpoints, one per missing MCP write action
- Pure RESTful verbs: POST for create, PATCH for update, DELETE for delete
- All handlers follow the existing thin-handler pattern (extract params → call service → return JSON)
- Route files colocated with their read counterparts

**Non-Goals:**
- No request-body validation middleware or schema enforcement layer (Zod, AJK, etc.) — service functions already validate
- No new service functions — every endpoint calls an existing import
- No database migrations
- No auth endpoints (register/login) — OAuth flow covers REST clients

## Decisions

### 1. RESTful Verb Mapping over Action-Based RPC

**Decision**: Map MCP `manage_*` tool actions to standard HTTP verbs and resource paths.

**Rationale**: The existing read endpoints already use RESTful conventions (`GET /wallets`, `GET /goals`). Continuing with `POST /wallets` (create), `PATCH /wallets/:id` (update), `DELETE /goals/:id` (delete) is consistent. The MCP `action` parameter pattern is an MCP transport concern and does not belong in REST.

**Alternative considered**: Action-based routes (`POST /wallets/create`, `POST /wallets/:id/update`). Rejected because it conflicts with established patterns and introduces unnecessary redundancy.

### 2. Transfers as a Standalone Resource (`/transfers`)

**Decision**: `POST /api/v1/transfers` as a dedicated route in a new file `src/routes/transfers.ts`.

**Rationale**: The service layer already separates `transferFunds()` into its own file (`src/services/transfer.ts`). Transfers have distinct semantics (two wallets, fee handling, balance validation) that don't fit under `/transactions`. A dedicated route reflects the domain separation cleanly.

**Alternative considered**: `POST /transactions` with `type: "transfer"`. Rejected because transfers require `sourceWalletId` + `targetWalletId` (different from single-wallet transactions) and use a different service function.

### 3. Service-Layer Validation as the Sole Validation Boundary

**Decision**: No additional validation middleware or schema enforcement in route handlers.

**Rationale**: Every service function already validates input types, required fields, enum membership, and business rules via `validationError()` → `ServiceError(VALIDATION)`. The centralized error handler maps this to HTTP 400 with `{ error, message, field }`. Adding a second validation layer (Zod, JSON Schema) would create redundancy and divergence risk. The MCP inputSchema provides schema hints to LLM clients but is not a runtime enforcement layer — the service functions are.

**Tradeoff**: REST clients receive validation errors reactively (after submission) rather than proactively (via schema introspection). This is acceptable because OpenAPI documentation provides the schema contract for client-side validation.

### 4. Route File Extension Pattern

**Decision**: Add write handlers to existing route files rather than creating separate write-route files.

**Rationale**: Each route file is small (10-30 lines). Adding POST/PATCH/DELETE handlers alongside GET keeps related endpoints together. Only `transfers.ts` is a new file because no `src/routes/transfers.ts` exists.

**Files modified:**
| File | Added handlers |
|---|---|
| `src/routes/wallets.ts` | `POST /`, `PATCH /:walletId` |
| `src/routes/categories.ts` | `POST /`, `POST /seed` |
| `src/routes/budgets.ts` | `POST /` |
| `src/routes/transactions.ts` | `POST /`, `PATCH /:transactionId` |
| `src/routes/transfers.ts` (new) | `POST /` |
| `src/routes/debts-loans.ts` | `POST /`, `POST /:debtLoanId/repay`, `PATCH /:debtLoanId` |
| `src/routes/goals.ts` | `PATCH /:goalId`, `DELETE /:goalId`, `POST /:goalId/contribute`, `POST /:goalId/wallets`, `DELETE /:goalId/wallets/:walletId` |
| `src/routes/recurring-templates.ts` | `PATCH /:templateId`, `DELETE /:templateId` |
| `src/routes/index.ts` | Add `api.route("/transfers", transfers)` |

### 5. HTTP Status Codes for Write Operations

**Decision**: Follow REST conventions consistently:
- `201 Created` for POST that creates a new resource (wallets, categories, budgets, transactions, transfers, debts-loans)
- `200 OK` for PATCH updates, DELETE confirmations, repayments, contributions, goal-wallet link/unlink, and seed operations
- Error codes from existing `HTTP_STATUS_MAP` in `src/services/errors.ts`

### 6. Request Body Extraction Pattern

**Decision**: Use `await c.req.json()` cast to `Record<string, unknown>`, then pass directly to service functions.

**Rationale**: This is the exact pattern used by the existing write handlers (goals POST, recurring POST, feedback POST). Service functions accept `unknown` typed params and validate internally.

For URL parameters (`:walletId`, `:goalId`, etc.), use `c.req.param("walletId")` — Hono guarantees these are non-empty strings when the route matches.

## Risks / Trade-offs

- **[Risk] Malformed JSON body** → Hono's `c.req.json()` throws on invalid JSON. The centralized `api.onError` handler catches this and returns HTTP 500 with the parse error message. This is acceptable; clients sending invalid JSON get a clear error.
- **[Risk] Large request bodies** → Cloudflare Workers have a 100MB request body limit. Financial transaction bodies are trivially small (<1KB). No mitigation needed.
- **[Risk] Inconsistent response shapes between MCP and REST** → Both transports call the same service functions and receive identical return objects. The MCP handler wraps the result in `{ content: [{ type: "text", text: JSON.stringify(result) }] }` while REST returns the raw object. No divergence risk.
