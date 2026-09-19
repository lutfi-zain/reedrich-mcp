## Purpose

Defines the behavioral specification for serving machine-optimized documentation (`llms.txt` and `llm.txt`) both as a repository file and as an edge HTTP endpoint, enabling LLMs, AI agents, and frontend developers to understand and integrate with Reedrich via MCP and REST API.

## Requirements

### Requirement: llms.txt Static File in Repository Root

The repository SHALL include `llms.txt` (and identical copy `llm.txt`) in the root directory formatted according to the `/llms.txt` standard.

The file MUST:
- State project title, persona, and core role (Deterministic Personal Finance Engine on Cloudflare Workers + D1).
- Document both integration interfaces:
  * MCP (JSON-RPC over Streamable HTTP & SSE) at `/mcp` and `/sse`.
  * REST API at `/api/v1/*` with interactive docs at `/docs` and OpenAPI schema at `/openapi.json`.
- Provide an exhaustive Authorization Architecture Guide explaining all 3 methods:
  * Persistent API Key (`rd_live_...` / `fp_live_...`) via `Authorization: Bearer` or `X-API-Key`.
  * OAuth2 PKCE (S256) flow (`/oauth/authorize`, `/oauth/token`) with Google Login federation and 30-day refresh tokens.
  * Ephemeral 15-minute JWT tokens via `login_user` and `register_user`.
- List all 9 `/api/v1/*` endpoint paths with HTTP methods, query parameters, request bodies, and response shapes.
- Detail the `ServiceError` codes (`VALIDATION`, `NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `CONFLICT`, `INTERNAL`) and their HTTP status mapping.
- Document tracing and performance headers (`X-Request-ID`, `X-Response-Time`).
- Provide concrete copy-paste integration code snippets for:
  * Web SPAs (TypeScript / Fetch client for Vite React, Svelte, Vue).
  * Mobile applications (Dart / HTTP client for Flutter).

#### Scenario: Agent reads llms.txt from repository

- **WHEN** an AI coding agent reads `llms.txt` or `llm.txt`
- **THEN** the file SHALL contain complete instructions for authenticating and consuming both MCP and REST APIs with zero missing steps

### Requirement: Edge Endpoint for llms.txt

The server SHALL serve the markdown content of `llms.txt` at `GET /llms.txt` and `GET /llm.txt`.

The endpoint MUST:
- Respond with HTTP status `200` and `Content-Type: text/markdown; charset=utf-8`.
- Set CORS header `Access-Control-Allow-Origin: *`.
- Set public edge caching headers (`Cache-Control: public, max-age=3600`).
- Support `OPTIONS` preflight requests returning HTTP `204`.

#### Scenario: Remote agent fetches llms.txt over HTTP

- **WHEN** an HTTP `GET /llms.txt` request is received
- **THEN** the response status MUST be `200` with `Content-Type: text/markdown; charset=utf-8`
- **THEN** the response body SHALL contain the full LLM-optimized documentation

#### Scenario: Remote agent fetches llm.txt alias

- **WHEN** an HTTP `GET /llm.txt` request is received
- **THEN** the response status MUST be `200` with `Content-Type: text/markdown; charset=utf-8` and identical content to `/llms.txt`

### Requirement: Discovery Link in Root Server Status

The server SHALL include `"llms": "/llms.txt"` in the `endpoints` object of `GET /`.

#### Scenario: Agent checks root discovery

- **WHEN** an HTTP `GET /` request is received
- **THEN** the JSON response SHALL include `"llms": "/llms.txt"` in the `endpoints` object
