## Purpose

Defines the behavioral contract for edge-native OpenTelemetry (OTLP) distributed tracing in the financial backend, ensuring seamless W3C trace context continuation, parameterized database query visibility, and external HTTP client timing without leaking sensitive user data or blocking response latency.

## ADDED Requirements

### Requirement: W3C Traceparent Ingestion and Propagation

The system MUST inspect incoming HTTP requests across all routes (REST `/api/v1/*`, MCP `/mcp`, `/sse`, OAuth `/oauth/*`, and health endpoints) for the W3C `traceparent` header (`00-${traceId}-${spanId}-${traceFlags}`). If present and valid, the system SHALL continue the distributed trace using the provided `traceId` and `parentSpanId`. If absent or malformed, the system SHALL generate a new compliant 32-hexadecimal character `traceId` and 16-hexadecimal character `spanId`. The system MUST return both `traceparent` and `X-Trace-Id` in the response headers.

#### Scenario: Ingest valid incoming traceparent header
- **GIVEN** an incoming HTTP request with header `traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01`
- **WHEN** the request is processed by the edge service
- **THEN** the root server span SHALL use trace ID `4bf92f3577b34da6a3ce929d0e0e4736` and parent span ID `00f067aa0ba902b7`
- **THEN** the response SHALL include header `X-Trace-Id: 4bf92f3577b34da6a3ce929d0e0e4736`
- **THEN** the response SHALL include a valid `traceparent` header carrying trace ID `4bf92f3577b34da6a3ce929d0e0e4736`

#### Scenario: Generate new trace when traceparent header is omitted
- **GIVEN** an incoming HTTP request without a `traceparent` header
- **WHEN** the request is processed by the edge service
- **THEN** the system SHALL generate a new 32-hexadecimal character trace ID and 16-hexadecimal character span ID
- **THEN** the response SHALL include `X-Trace-Id` matching the generated trace ID
- **THEN** the response SHALL include `traceparent` starting with `00-` and ending with `-01`

### Requirement: Database Query Span Recording and Privacy Protection

The system MUST record an OpenTelemetry span for every database query executed during request processing. The span MUST include `db.system: "postgresql"`, `db.name: "reedrich"`, the operation name (`SELECT`, `INSERT`, `UPDATE`, `DELETE`), execution duration, and the SQL statement template. The recorded statement MUST be parameterized or sanitized, and SHALL NOT contain raw user account balances, plaintext API keys, passwords, or personally identifiable information.

#### Scenario: Record SELECT query with parameterized statement
- **GIVEN** an authenticated user requesting `GET /api/v1/wallets`
- **WHEN** the service executes a query against the `wallets` table
- **THEN** the system SHALL record a child span with `db.system` set to `"postgresql"`
- **THEN** the span attribute `db.statement` SHALL record the parameterized SQL template (e.g. `SELECT ... WHERE "user_id" = $1`)
- **THEN** the span attribute `db.statement` SHALL NOT contain raw user financial balances or secret tokens

#### Scenario: Record database failure as error span
- **GIVEN** an incoming transaction write that violates a database constraint
- **WHEN** the database query rejects with a PostgreSQL error
- **THEN** the query span status code SHALL be set to error (code 2)
- **THEN** the error description or exception event SHALL be attached to the span without leaking connection credentials

### Requirement: Outbound HTTP Client Span Recording

The system MUST record an OpenTelemetry client span (`kind: CLIENT`) for every outbound external HTTP request initiated during request execution, including live exchange rate fetches and third-party OAuth token exchanges. The span MUST record `http.method`, `http.url`, response `http.status_code`, and execution duration.

#### Scenario: Record exchange rate external API call
- **GIVEN** an endpoint requiring currency conversion that invokes the live FX rates engine
- **WHEN** the engine issues an HTTP request to `https://open.er-api.com/v6/latest/USD`
- **THEN** the system SHALL record a child span with `kind: CLIENT` and `http.url: "https://open.er-api.com/v6/latest/USD"`
- **THEN** the span SHALL capture the HTTP response status code and round-trip duration

#### Scenario: Record external API timeout or network failure
- **GIVEN** an outbound HTTP request to an external provider that exceeds the 3000ms timeout
- **WHEN** the request aborts or fails
- **THEN** the client span SHALL record the error status and duration
- **THEN** the system fallback mechanism SHALL engage without crashing the parent trace

### Requirement: Non-Blocking Edge OTLP Export

The system MUST export completed trace spans formatted as OpenTelemetry OTLP Protobuf or JSON to the configured Arize Phoenix collector endpoint. The export SHALL be performed asynchronously utilizing edge execution context (`c.executionCtx.waitUntil()`) so that trace transmission adds zero blocking latency to caller responses. In the event of Phoenix network unavailability or collector HTTP errors, the system SHALL log the error diagnostics without altering the caller's HTTP response status or body.

#### Scenario: Asynchronous trace export via execution context
- **GIVEN** a completed HTTP request with multiple child spans
- **WHEN** the response headers and payload are dispatched to the client
- **THEN** the trace buffer SHALL be dispatched to the Phoenix endpoint in the background via `waitUntil`
- **THEN** the client response time SHALL NOT be delayed by collector export duration

#### Scenario: Graceful collector failure tolerance
- **GIVEN** an unreachable Phoenix collector endpoint returning HTTP 503 or network timeout
- **WHEN** the background trace export fails
- **THEN** the system SHALL handle the rejection silently or log a warning
- **THEN** the client HTTP response SHALL remain completely unaffected
