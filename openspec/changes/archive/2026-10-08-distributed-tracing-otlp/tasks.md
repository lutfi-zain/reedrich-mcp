## 1. Edge-Native OTLP Tracer & Context Propagation

- [x] 1.1 Create `src/observability/tracer.ts` with `WorkerTracer`, W3C `traceparent` parsing/formatting utilities, and Protobuf/JSON OTLP serialization targeting Arize Phoenix (`POST /v1/traces`)
- [x] 1.2 Implement `src/middleware/tracing.ts` to inspect incoming `traceparent`, initialize the root server span (`kind: SERVER`), attach `traceparent` and `X-Trace-Id` response headers, and register asynchronous trace flushing via `c.executionCtx.waitUntil()`
- [x] 1.3 Update `src/index.ts` to mount `tracingMiddleware` globally across all endpoints (REST, MCP, and OAuth)

## 2. Database Query Instrumentation

- [x] 2.1 Update `src/db/index.ts` to support optional tracer binding in `getDb` / `createDb`, attaching a query execution listener that records child spans with `db.system: "postgresql"`, `db.name: "reedrich"`, `db.operation`, and duration
- [x] 2.2 Enforce privacy sanitization so `db.statement` captures parameterized SQL templates without exposing cleartext financial balances, account identifiers, or user secrets

## 3. Outbound HTTP Client Instrumentation

- [x] 3.1 Implement `tracedFetch` utility in `src/observability/tracer.ts` that wraps standard Web `fetch` and records child spans (`kind: CLIENT`) with `http.method`, `http.url`, and `http.status_code`
- [x] 3.2 Update `src/utils/fx.ts` (`getExchangeRates`) to utilize `tracedFetch` when calling `https://open.er-api.com/v6/latest/USD`
- [x] 3.3 Update Google OAuth token and userinfo calls in `src/index.ts` to utilize `tracedFetch`

## 4. Testing & Verification

- [x] 4.1 Create `tests/tracing.test.ts` covering W3C `traceparent` parsing, ID generation, span lifecycle, and error handling
- [x] 4.2 Update `tests/mcp.test.ts` to assert that incoming `traceparent` headers are properly reflected in response headers and child spans are collected
- [x] 4.3 Run `npm run typecheck` and `npm test` to verify zero TypeScript errors and zero regressions in the test database
