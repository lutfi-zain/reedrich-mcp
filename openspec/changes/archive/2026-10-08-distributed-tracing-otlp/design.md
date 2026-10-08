## Context

See `proposal.md` for motivation and background.

`reedrich-mcp` runs on Cloudflare Workers edge runtime (`workerd` / V8 Isolate), interfacing with PostgreSQL 16 on VPS via Cloudflare Hyperdrive connection pooling and serving requests over Hono. The upstream client is the Maniyy v2 financial agent (`lz-maniyy-v2`), which initiates chat and tool execution requests with W3C `traceparent` headers.

Cloudflare Workers has strict constraints:
- No Node.js native networking or `async_hooks` (ruling out standard `@opentelemetry/sdk-trace-node` and `@arizeai/phoenix-otel`).
- Strict CPU limits per invocation.
- Background asynchronous tasks must be registered with `c.executionCtx.waitUntil()`.

## Goals / Non-Goals

**Goals:**
- Seamlessly continue distributed traces initiated by Maniyy v2 using W3C `traceparent` standard.
- Instrument database queries executed by Drizzle ORM and `postgres.js` with `db.statement` (parameterized SQL), `db.system: "postgresql"`, and duration.
- Instrument outbound HTTP client requests (currency exchange rate lookups at `open.er-api.com` and OAuth token calls) as child `CLIENT` spans.
- Export OpenTelemetry spans to Arize Phoenix (`POST /v1/traces`) with zero impact on HTTP response latency.

**Non-Goals:**
- No LLM evaluators, datasets, or prompt management in this deterministic backend repository.
- No logging of plaintext user balances, transaction amounts, NIK, or API keys in trace payloads.
- No schema or migration changes to PostgreSQL tables.

## Decisions

### 1. Edge-Native Protobuf Tracer (`WorkerTracer`) vs. Node.js OpenTelemetry SDK

- **Decision:** Implement a lightweight, standalone `WorkerTracer` in `src/observability/tracer.ts` leveraging `@opentelemetry/otlp-transformer` (`ProtobufTraceSerializer`) and standard Web `crypto.getRandomValues`.
- **Rationale:** Standard `@opentelemetry/sdk-trace-node` relies on `node:net`, `node:http`, and `process.on('exit')`, which crash or fail under Cloudflare Workers. Custom fetch-based Protobuf export operates entirely over Web Standards (`fetch`, `Uint8Array`, `crypto`) with minimal bundle size and near-zero memory footprint.
- **Alternatives Considered:**
  - `@arizeai/phoenix-otel`: Incompatible with `workerd` isolate runtime.
  - JSON OTLP export: Higher payload size over HTTP compared to Protobuf binary serialization.

### 2. Lifecyle Architecture & Non-Blocking Flush via `waitUntil`

```
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │ INCOMING HTTP REQUEST (traceparent: 00-traceId-parentSpanId-01)            │
 └──────────────────────────────────────┬──────────────────────────────────────┘
                                        │
                                        ▼
                             [ tracingMiddleware ]
                                        │
               ┌────────────────────────┴────────────────────────┐
               ▼                                                 ▼
        [ REST / MCP Handler ]                         [ Set Response Headers ]
               │                                       - traceparent
               ├─► [ tracedFetch (FX Rates) ]          - X-Trace-Id
               │    └─► Span: kind CLIENT              - X-Response-Time
               │                                                 │
               ├─► [ Drizzle Query Hook ]                        ▼
               │    └─► Span: kind CLIENT / db.query    [ HTTP 200 Sent to User ]
               │                                                 │
               ▼                                                 ▼
        [ Request Complete ] ─── tracer.flush() ───► [ c.executionCtx.waitUntil ]
                                                                 │
                                                                 ▼
                                                    [ POST https://phoenix... ]
```

- **Decision:** Register the OTLP export promise in `c.executionCtx.waitUntil(tracer.flush(c.env))`.
- **Rationale:** Calling `waitUntil()` allows Cloudflare Workers to keep the isolate alive to complete the outbound trace push without delaying the HTTP response stream to the caller.

### 3. Parameterized Database Query Instrumentation

- **Decision:** Instrument Drizzle ORM queries using a lightweight query listener / logger attached during `getDb(c.env, tracer)`.
- **Rationale:** Drizzle query builder generates SQL templates with `$1`, `$2` parameter markers. By capturing the generated SQL template as `db.statement`, we obtain complete insight into query structure, joins, and table targets without exposing user account balances or sensitive transaction remarks in the observability platform.
- **Span Schema:**
  - `name`: `db.query: ${operation} ${table}` (e.g. `db.query: SELECT wallets`)
  - `kind`: `CLIENT` (SpanKind 3)
  - `attributes`:
    - `db.system`: `"postgresql"`
    - `db.name`: `"reedrich"`
    - `db.operation`: `"SELECT"` | `"INSERT"` | `"UPDATE"` | `"DELETE"`
    - `db.statement`: parameterized SQL query string
    - `db.duration_ms`: duration in milliseconds

### 4. Outbound HTTP Client Instrumentation (`tracedFetch`)

- **Decision:** Provide a `tracedFetch(tracer, url, init)` utility used in `src/utils/fx.ts` and OAuth handlers.
- **Rationale:** Captures external service latencies as distinct child spans. If `open.er-api.com` stalls for 3 seconds before timing out, the span clearly attributes the delay to the third-party provider, preventing false-positive investigations into internal database performance.

## Risks / Trade-offs

- **[Collector Outage / Network Partition] -> Mitigation:** Trace export is wrapped in an isolated `try/catch` block with a 2.5-second timeout and fails silently without throwing unhandled exceptions or affecting caller responses.
- **[Worker CPU Overhead] -> Mitigation:** Spans are accumulated in an in-memory array and transformed to Protobuf in a single pass at the end of the request.
- **[Data Privacy & Secret Leakage] -> Mitigation:** Parameterized queries only (`$1`, `$2`); strict sanitization of headers (omitting `Authorization`, `X-Api-Key`, and Cookie values from span attributes).
