## Purpose

Defines the behavioral contract for observability middleware that instruments both REST and MCP transports uniformly, providing request-level timing, request ID propagation, and structured error categorization.

## ADDED Requirements

### Requirement: Request ID Propagation

The system MUST generate a unique request ID for every incoming HTTP request. If the request includes an `X-Request-ID` header, that value SHALL be used; otherwise, a new UUID SHALL be generated. The request ID MUST be included in the response via the `X-Request-ID` header.

#### Scenario: Request ID generated when not provided

- **WHEN** an HTTP request arrives without an `X-Request-ID` header
- **THEN** the system SHALL generate a UUID and include it in the response as `X-Request-ID`

#### Scenario: Client-provided request ID is preserved

- **GIVEN** a request with header `X-Request-ID: abc-123-def`
- **WHEN** the request is processed
- **THEN** the response SHALL include `X-Request-ID: abc-123-def`

### Requirement: Request Timing

The system MUST measure the wall-clock duration of every HTTP request from receipt to response. The duration in milliseconds SHALL be included in the response via the `X-Response-Time` header.

#### Scenario: Response time header present

- **WHEN** any HTTP request completes
- **THEN** the response SHALL include an `X-Response-Time` header with the duration in milliseconds (e.g. `X-Response-Time: 42ms`)

### Requirement: Structured Error Logging

When a service function throws an error, the observability layer MUST log a structured entry containing: request ID, HTTP method, path, error code (from `ServiceError`), error message, and response duration. The log entry MUST NOT include sensitive data (tokens, API keys, passwords).

#### Scenario: Service error logged with context

- **GIVEN** a `GET /api/v1/wallets` request that results in a `NOT_FOUND` service error
- **WHEN** the error is caught by the transport adapter
- **THEN** the observability layer SHALL log an entry with `requestId`, `method: "GET"`, `path: "/api/v1/wallets"`, `errorCode: "NOT_FOUND"`, and `durationMs`
- **THEN** the log entry SHALL NOT contain the user's Bearer token or API key

### Requirement: Uniform Coverage

The observability middleware MUST apply to all HTTP routes: REST API endpoints (`/api/v1/*`), MCP endpoints (`/mcp`, `/sse`), OAuth endpoints (`/oauth/*`), and health endpoints. No transport-specific instrumentation duplication SHALL exist.

#### Scenario: MCP request includes timing and request ID

- **WHEN** a `POST /mcp` JSON-RPC request completes
- **THEN** the response SHALL include `X-Request-ID` and `X-Response-Time` headers

#### Scenario: OAuth token request includes timing

- **WHEN** a `POST /oauth/token` request completes
- **THEN** the response SHALL include `X-Request-ID` and `X-Response-Time` headers
