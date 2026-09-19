## Context

See proposal.md for motivation. Key constraints shaping this design:

- `src/mcp.ts` is a single 2806-line function closure (`createMCPServer`) containing all 12 MCP tool handlers with inline business logic, validation, and Drizzle queries.
- `src/index.ts` is 2733 lines containing Hono routes, OAuth endpoints, and 5 REST handlers that duplicate subsets of MCP tool logic.
- Three auth functions exist with overlapping behavior: `extractAuthenticatedUserId` (index.ts:941), `authenticateRestUser` (index.ts:310), and `resolveEffectiveUserId` (mcp.ts:117).
- Cloudflare Workers runtime (workerd): V8 isolate, no Node.js native bindings, D1 SQLite, stateless per-request.
- Drizzle ORM is used throughout — it IS the query builder; no additional repository abstraction needed.
- No database schema changes in this change — D1 tables and migrations remain untouched.

## Goals / Non-Goals

**Goals:**
- Extract all business logic into `src/services/*.ts` — pure functions with typed errors
- Unify auth into a single `resolveUserId` function in `src/middleware/auth.ts`
- Make MCP tool handlers and REST routes thin transport adapters (~10-20 lines each)
- Add observability middleware (request ID, timing, error logging) applied once for all transports
- Create read-only REST endpoints for all financial entities
- Eliminate ~400 lines of duplicated logic in `index.ts`

**Non-Goals:**
- No new Drizzle schema, D1 migrations, or index changes
- No write REST endpoints (POST/PUT/DELETE) — future phase
- No external observability backend integration (Datadog, Grafana, etc.)
- No refactor of OAuth endpoints — they remain in `index.ts`
- No changes to MCP tool names, input schemas, or output formats

## Decisions

### Decision 1: 2-Layer Architecture (Transport → Service), No Repository Layer

**Chosen:** Service functions call Drizzle ORM directly. No separate repository/data-access layer.

**Rationale:** Drizzle ORM already provides a typed, composable query builder. Wrapping `db.select().from(schema.wallets).where(eq(...))` inside `walletRepository.findByUserId()` adds a file and an indirection hop with zero benefit — the queries are already type-safe and won't change shape (D1 is locked in).

**Alternatives considered:**
- 4-layer (Controller → Service → Repository → Entity): ~40+ files, 3 hops per operation, repository layer provides no value over Drizzle. Rejected as overengineered for this project's scale.
- Direct Drizzle in route handlers (current state): Works but forces logic duplication across transports. Rejected — this is what we're fixing.

**Workers fit:** Fewer imports = smaller bundle = faster cold starts on V8 isolates.

### Decision 2: ServiceError with Discriminated Code, Not Error Subclasses

**Chosen:** Single `ServiceError` class with a `code: ServiceErrorCode` discriminant field.

```
ServiceError { code: "VALIDATION" | "NOT_FOUND" | "UNAUTHORIZED" | ..., message: string, field?: string }
```

**Rationale:** A flat discriminated union is simpler than a class hierarchy (`ValidationError extends ServiceError`, `NotFoundError extends ServiceError`, ...). The transport adapter needs one `instanceof ServiceError` check and a status map lookup. No `instanceof` chain, no catch-per-class.

**Alternatives considered:**
- Error subclasses: More idiomatic OOP, but adds 6 classes for 6 codes with zero behavioral difference. Rejected as unnecessary complexity.
- Result type (`{ ok: true, data } | { ok: false, error }`): Forces every callsite to check `.ok` — verbose. Rejected; `throw` is idiomatic for errors in this codebase.

### Decision 3: Service Functions as Module-Level Exports, Not Classes

**Chosen:** Each service file exports plain async functions.

```typescript
// src/services/wallet.ts
export async function listWallets(db, userId): Promise<WalletRow[]> { ... }
export async function createWallet(db, userId, params): Promise<WalletRow> { ... }
```

**Rationale:** The functions are stateless — they receive `db` and `userId` per call. A `WalletService` class would hold `db` and `userId` as constructor params, requiring instantiation per-request. Plain functions avoid this ceremony and align with the existing codebase pattern (utility functions in `src/utils/*.ts`).

**Workers fit:** No class instantiation overhead per request. Tree-shakeable — unused exports are dead-code-eliminated by Wrangler's bundler.

### Decision 4: Unified resolveUserId Replaces Three Functions

**Chosen:** Single `resolveUserId(db, secret, opts: ResolveUserOptions)` in `src/middleware/auth.ts`.

`ResolveUserOptions` carries optional credential sources:
- `bearerToken?: string` — from `Authorization: Bearer` header
- `headerKey?: string` — from `X-API-Key` / `mcp-api-key` header
- `queryToken?: string` — from `?apiKey=` / `?token=` query params
- `toolArgs?: { apiKey?: string; token?: string }` — from MCP tool arguments

The function iterates candidates in priority order and attempts resolution for each via: API key prefix → OAuth JWT → Legacy JWT → fallback hash lookup. Returns the first resolved `userId` or `null`.

**Rationale:** All three existing functions use the same resolution logic with different input sources. Unifying them eliminates ~120 lines of redundant code and guarantees consistent behavior across transports.

**Backward compatibility:** MCP clients (ChatGPT, Perplexity) that send credentials via HTTP headers continue to work. MCP clients that embed `apiKey`/`token` in tool arguments continue to work via `toolArgs`. REST endpoints accept `bearerToken` and `headerKey` only — no query param auth on REST (as per spec).

### Decision 5: REST Routes as Separate Hono Router Module

**Chosen:** `src/routes/index.ts` creates a Hono sub-app mounted at `/api/v1`, importing individual route files.

```typescript
// src/routes/index.ts
import wallets from "./wallets";
import transactions from "./transactions";
// ...
const api = new Hono();
api.route("/wallets", wallets);
api.route("/transactions", transactions);
export default api;

// src/index.ts
import api from "./routes/index";
app.route("/api/v1", api);
```

**Rationale:** Hono's `.route()` method provides clean sub-routing without middleware leakage. Each route file is ~20-40 lines (auth middleware + service call + response formatting). This keeps `index.ts` focused on OAuth, CORS, MCP mounting, and the OpenAPI spec.

**Migration:** The existing 5 REST endpoints in `index.ts` (`/api/v1/summary`, `/api/v1/goals` GET/POST, `/api/v1/recurring-templates` GET/POST, `/api/v1/feedback`) will be moved to route files. The old handlers will be deleted from `index.ts`.

### Decision 6: Auth Middleware on REST Routes, Not Global

**Chosen:** Auth middleware applied specifically to `/api/v1/*` routes, not globally.

```typescript
// src/routes/index.ts
api.use("*", authMiddleware);  // applies to /api/v1/* only
```

**Rationale:** OAuth endpoints (`/oauth/authorize`, `/oauth/token`) and discovery endpoints (`/.well-known/*`) must remain unauthenticated. The MCP handler has its own auth gate (checking public tools before auth). Global auth middleware would break these flows.

### Decision 7: Observability as Top-Level Hono Middleware

**Chosen:** `src/middleware/observability.ts` exports a Hono middleware that wraps every request with request ID generation and timing.

```typescript
app.use("*", observabilityMiddleware);  // first middleware in chain
```

Applied before CORS, before auth, before routing. This captures timing for all requests including 401s and 404s.

**Error logging:** The observability middleware catches errors from downstream handlers, logs structured entries via `console.log` (captured by Workers runtime for `wrangler tail`), and re-throws or formats the response.

**Workers fit:** `console.log` in Workers is captured by the runtime's logging pipeline. No external dependencies needed. Tail Workers or Logpush can process structured logs later — that integration is a non-goal for this change.

### Decision 8: Service Extraction Order — Read Functions First

The MCP tool handlers contain interleaved read and write logic (e.g., `manage_wallet` handles `list`, `create`, `update`). Extraction order:

1. **Extract `src/services/errors.ts`** — ServiceError class and convenience throwers
2. **Extract read-only service functions** — `listWallets`, `listCategories`, `listBudgets`, `budgetStatus`, `listTransactions`, `listDebtsLoans`, `listGoals`, `listRecurringTemplates`, `financialSummary`
3. **Extract write service functions** — `createWallet`, `updateWallet`, `createCategory`, `seedDefaults`, `createBudget`, `recordTransaction`, `updateTransaction`, `transferFunds`, `createDebtLoan`, `repayDebtLoan`, `updateDebtLoan`, `createGoal`, `updateGoal`, `contributeGoal`, `deleteGoal`, `createRecurringTemplate`, `updateRecurringTemplate`, `deleteRecurringTemplate`, `applyRecurringTemplate`
4. **Extract auth-related services** — `registerUser`, `loginUser`, `submitFeedback`

Each extraction: move logic to service file → update MCP tool handler to call service → verify tests pass → move to next.

Write functions are extracted even though no write REST routes are in scope because MCP tool handlers need them, and leaving write logic inline while extracting read logic would create an inconsistent hybrid state in `mcp.ts`.

### Decision 9: `applyBalanceDelta` Stays as a Private Helper in Transaction Service

The `applyBalanceDelta` function (mcp.ts:1084-1111) handles atomic wallet balance reconciliation and is used by `record_transaction`, `update_transaction`, and `transfer_funds` tools. It will be extracted to `src/services/transaction.ts` as a non-exported helper, called internally by `recordTransaction`, `updateTransaction`, and `transferFunds`.

**Rationale:** This function is never called from outside the transaction domain. Making it a module-private helper in `transaction.ts` keeps the public API clean while preserving the atomic reconciliation guarantee.

### Decision 10: fetchFn Dependency Injection for Exchange Rates

The `financial_summary` service function needs `fetch` for exchange rates (`getExchangeRates`). The MCP server currently passes `options?.fetchFn` while REST handlers use the global `fetch`. The service function signature will accept an optional `fetchFn` parameter:

```typescript
export async function financialSummary(
  db, userId, params: { startDate?, endDate?, baseCurrency? },
  fetchFn?: typeof fetch
): Promise<SummaryResult> { ... }
```

**Rationale:** Keeps the service function testable (mock `fetch` for tests) while allowing both MCP and REST adapters to pass the appropriate `fetch` implementation. The global `fetch` in Workers is always available, so REST adapters just omit the parameter.

## Risks / Trade-offs

**[Risk] Large refactor touching both major files (mcp.ts + index.ts) simultaneously** → Mitigation: Extract one service domain at a time. Run `npm test` and `npm run typecheck` after each extraction. The existing test suite (`tests/mcp.test.ts`, 133KB) provides regression coverage.

**[Risk] MCP output regression — subtle changes in JSON field order or error message wording** → Mitigation: The MCP test suite validates tool responses. Additionally, run integration tests (`npm run test:local`) against the dev server post-refactor. Service functions return plain objects; the MCP adapter wraps them in `{ content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }` — identical to current behavior.

**[Risk] Auth behavior regression — some client type loses access after unification** → Mitigation: The unified `resolveUserId` function implements a superset of all three current functions' behavior. The priority order and fallback chain are preserved exactly. Integration tests cover API key, JWT, and OAuth token auth paths.

**[Risk] Workers bundle size increase from additional imports** → Mitigation: Wrangler's esbuild bundler tree-shakes unused exports. Service files use the same Drizzle and schema imports already in the bundle. Net bundle size is expected to decrease slightly due to deduplication.

**[Risk] Observability middleware adds latency to every request** → Mitigation: The middleware performs only `Date.now()` at start and end (sub-microsecond), UUID generation for request ID (~1μs), and string concatenation for the response header. Total overhead: <0.01ms per request. No D1 queries, no external network calls.
