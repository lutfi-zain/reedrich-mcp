## Why

While `reedrich-mcp` has basic request-timing and request-ID middleware (`src/middleware/observability.ts`), it operates as a black box during distributed financial flows initiated by the upstream Maniyy v2 AI agent (`lz-maniyy-v2`). When the agent executes financial tools via HTTP/JSON-RPC, traces terminate at the agent gateway; backend PostgreSQL/Hyperdrive query durations, connection queue latency, and outbound currency rate fetch latencies (`open.er-api.com`) are invisible in Arize Phoenix.

Implementing edge-native OpenTelemetry (OTLP) distributed tracing with W3C `traceparent` context propagation bridges this observability gap, providing full end-to-end waterfall visibility from user prompt down to database queries and external third-party HTTP calls, while strictly sanitizing sensitive financial parameters.

## What Changes

- **W3C Distributed Trace Context Propagation**:
  - Add W3C `traceparent` parsing (`00-${traceId}-${spanId}-01`) and response header propagation (`traceparent`, `X-Trace-Id`) across all HTTP routes (REST `/api/v1/*`, MCP `/mcp`, `/sse`, and OAuth `/oauth/*`).
  - Generate standards-compliant trace and span IDs when incoming requests omit `traceparent`.
- **Database Query Tracing & Parameter Sanitization**:
  - Instrument Drizzle ORM and `postgres.js` client with an edge-compatible query hook.
  - Record `db.system: "postgresql"`, `db.name: "reedrich"`, `db.operation` (`SELECT`, `INSERT`, `UPDATE`, `DELETE`), `db.statement` (parameterized SQL template), and query execution duration in milliseconds.
  - Enforce financial privacy: sanitize and omit raw user values (salids, account numbers, user credentials) from recorded `db.statement` strings.
- **Outbound HTTP Client Spans**:
  - Instrument outbound HTTP calls in the FX exchange rate engine (`https://open.er-api.com/v6/latest/USD`) and Google OAuth federation (`oauth2.googleapis.com`, `googleapis.com`).
  - Capture HTTP client spans (`kind: CLIENT`) with `http.method`, `http.url`, `http.status_code`, and execution duration to quickly distinguish external API timeouts from internal database bottlenecks.
- **Edge-Native OTLP Protobuf Exporter**:
  - Implement a lightweight, zero-Node-dependency tracer using `@opentelemetry/otlp-transformer` (`ProtobufTraceSerializer`) exporting directly via Web `fetch` to Arize Phoenix (`POST /v1/traces`).
  - Flush trace buffers asynchronously using Cloudflare Workers `c.executionCtx.waitUntil()`, adding 0ms latency to caller responses.

## Capabilities

### New Capabilities

- `distributed-tracing`: Edge-native OpenTelemetry tracing covering W3C context propagation, parameterized database query spans, external HTTP client spans, and asynchronous OTLP export to Arize Phoenix.

### Modified Capabilities

- None. (Existing `observability` spec remains intact as the base request-response logging and request-ID baseline).

## Non-Goals

- No LLM evaluators or prompt management: `reedrich-mcp` is a deterministic math and storage service with no generative models.
- No raw SQL parameter logging: User account balances, UUIDs, and credentials will not be logged in cleartext.
- No heavy Node.js OpenTelemetry SDK dependencies: The worker must run within Cloudflare Workers V8 isolate constraints with zero `node:net` or `async_hooks` dependencies.
- No breaking changes to existing REST endpoints, MCP JSON-RPC schemas, or database tables.

## Impact

- **`src/middleware/tracing.ts`**: New middleware extracting and forwarding W3C trace context, creating top-level server spans.
- **`src/observability/tracer.ts`**: Edge-native OTLP tracer serializing spans into Protobuf and sending to Phoenix.
- **`src/db/index.ts`**: Drizzle/Postgres client instrumentation capturing parameterized query execution times and statements.
- **`src/utils/fx.ts`**: Wrapped `fetch` capturing outbound HTTP timing for exchange rate lookups.
- **`src/index.ts`**: Mounting tracing middleware into global Hono pipeline.
- **`tests/mcp.test.ts` & unit tests**: Verifying trace header parsing, span attribute generation, and privacy sanitization.
