## Purpose

Enforces protected-resource access control on MCP endpoints with RFC 9728 / RFC 6750 compliant 401 challenges and preserves backward compatibility with existing Reedrich API key and JWT bearers while maintaining zero database writes for OAuth handshakes.

## ADDED Requirements

### Requirement: Protected Resource 401 Challenge with Resource Metadata

The system SHALL on every unauthenticated, expired, malformed, or scope-insufficient request to `GET /mcp`, `POST /mcp`, `GET /sse`, or `POST /sse` respond `401 Unauthorized` with header `WWW-Authenticate: Bearer resource_metadata="https://<host>/.well-known/oauth-protected-resource"` plus `error` and `error_description` per RFC 6750. Specifically: `error="invalid_token"` for expired/malformed/tampered Bearer tokens, `error="insufficient_scope"` for valid token with insufficient scope, and no `error` duplication beyond one `Bearer` challenge. The response body SHALL be `Content-Type: application/json` with JSON `{ "error": "<error>", "error_description": "<string>" }`, and headers `Cache-Control: no-store`, `Pragma: no-cache`. The `resource_metadata` URI MUST be the exact RFC 9728 protected resource metadata URL for the current host.

#### Scenario: Unauthenticated MCP request returns 401 with resource_metadata

- **WHEN** a client sends `POST https://<host>/mcp` with no `Authorization` header and body `{ "jsonrpc": "2.0", "id": 1, "method": "tools/list" }`
- **THEN** the system MUST respond `401` with `WWW-Authenticate: Bearer resource_metadata="https://<host>/.well-known/oauth-protected-resource", error="invalid_token", error_description="..."`, `Content-Type: application/json`, `Cache-Control: no-store`, and JSON body `{ "error": "invalid_token" }`

#### Scenario: Expired access token returns 401 invalid_token

- **GIVEN** an access_token JWT with `exp = T0 + 900` presented at `T0 + 901`
- **WHEN** a client sends `POST /mcp` with `Authorization: Bearer <expired_jwt>`
- **THEN** the system MUST respond `401` with `WWW-Authenticate` containing `error="invalid_token"` and `resource_metadata="https://<host>/.well-known/oauth-protected-resource"`, and MUST NOT proxy the request to the MCP handler

#### Scenario: Malformed bearer token returns 401

- **WHEN** a client sends `POST /mcp` with `Authorization: Bearer not.a.jwt`
- **THEN** the system MUST respond `401` with `error="invalid_token"` in both header and JSON body

#### Scenario: Resource metadata URI matches current host

- **GIVEN** the request is `POST https://custom.example.com/mcp` without auth
- **WHEN** the system returns `401`
- **THEN** `WWW-Authenticate` MUST contain `resource_metadata="https://custom.example.com/.well-known/oauth-protected-resource"` (not a hard-coded origin)

#### Scenario: 401 response is no-store and CORS-enabled

- **WHEN** a browser client sends `POST /mcp` without auth and `Origin: https://perplexity.ai`
- **THEN** the `401` response MUST include `Access-Control-Allow-Origin: *`, `Cache-Control: no-store`, `Pragma: no-cache`

---

### Requirement: Bearer Token Validation on MCP Endpoints

The system SHALL accept as valid Bearer tokens on `/mcp` and `/sse`: (a) newly issued OAuth access_token JWTs (`exp - iat == 900`, `token_type` absent or `Bearer`, verified via `JWT_SECRET` HS256), (b) existing Reedrich JWTs (issued via `login_user` / `register_user`, `iss` in `["reedrich-mcp","eve-finance-mcp"]`, `aud` in `["reedrich-client","eve-finance-client"]`), and (c) persistent API keys `rd_live_*` / `fp_live_*` (hashed via SHA-256 and looked up in `users`). For type (a) and (b), validation SHALL be stateless (HMAC verify, no D1 query). For type (c), one D1 lookup by `user_api_key_hash` is permitted. On success the system SHALL extract `sub` / `userId` as the RLS principal and forward the request to the MCP transport with that identity. Query param `?apiKey=` and header `X-API-Key` remain supported for backward compatibility but the 401 challenge header MUST reference `resource_metadata` regardless.

#### Scenario: Valid OAuth access token grants MCP access

- **GIVEN** a valid OAuth access_token JWT for `sub: usr_test123`, `scope: mcp`, `exp: T0 + 900` presented at `T0 + 100`
- **WHEN** a client sends `POST /mcp` with `Authorization: Bearer <oauth_access_token>` and JSON-RPC `tools/list`
- **THEN** the system MUST verify the JWT statelessly, extract `userId: usr_test123`, and return `200` with the MCP response (not `401`), with RLS scoped to `usr_test123`

#### Scenario: Valid legacy rd_live API key still grants MCP access

- **GIVEN** a user with `user_api_key_hash = SHA256("rd_live_abc123...")` in D1
- **WHEN** a client sends `POST /mcp` with `Authorization: Bearer rd_live_abc123...`
- **THEN** the system MUST hash the key, find the user via D1, and return `200` with MCP response (backward compatibility)

#### Scenario: Valid legacy Reedrich JWT still grants MCP access

- **GIVEN** a JWT issued by `login_user` with `iss: "reedrich-mcp"`, `aud: "reedrich-client"`, `sub: usr_legacy`, `exp: T0 + 900` presented at `T0 + 100`
- **WHEN** a client sends `POST /mcp` with `Authorization: Bearer <legacy_jwt>`
- **THEN** the system MUST verify via `JWT_SECRET` and return `200` with MCP response scoped to `usr_legacy`

#### Scenario: Token with insufficient scope rejected with insufficient_scope

- **GIVEN** a valid access_token with `scope: "read"` but the requested MCP operation requires `scope: "mcp"` (when scope enforcement is enabled)
- **WHEN** a client sends `POST /mcp` with that token
- **THEN** the system MUST respond `401` (or `403` if the spec chooses, but MUST document) with `WWW-Authenticate` containing `error="insufficient_scope"` and `resource_metadata`, and JSON `error: "insufficient_scope"`

#### Scenario: Bearer extraction order preserves compatibility

- **GIVEN** a request with both `Authorization: Bearer <oauth_jwt>` and `X-API-Key: rd_live_xxx`
- **WHEN** the system authenticates `POST /mcp`
- **THEN** it MUST prefer `Authorization: Bearer` (first), and only fall back to `X-API-Key` when `Authorization` is absent (matching existing `extractAuthenticatedUserId` precedence)

---

### Requirement: Stateless Zero-Storage Invariant for OAuth Handshakes

The system SHALL guarantee zero D1 tables and zero D1 writes for all OAuth handshake endpoints: `GET /.well-known/*`, `POST /oauth/register`, `GET /oauth/authorize`, `POST /oauth/token`, and `POST /oauth/revoke`. Discovery and token verification SHALL perform zero D1 queries. Only legacy API key Bearer (`rd_live_*` / `fp_live_*`) on `/mcp` MAY perform one D1 read by `user_api_key_hash`; all OAuth JWT paths (authorization code, access token, refresh token) SHALL perform zero D1 reads/writes. No migration SQL file SHALL be added for OAuth.

#### Scenario: Full OAuth flow performs zero writes

- **WHEN** a test harness performs `GET /.well-known/oauth-authorization-server` → `GET /.well-known/oauth-protected-resource` → `POST /oauth/register` → `GET /oauth/authorize` (with mocked auth) → `POST /oauth/token` (authorization_code) → `POST /oauth/token` (refresh_token) against a mock D1 spy
- **THEN** the recorded D1 writes MUST be `0` across all steps, and D1 reads MUST be `0` except for the mocked user lookup in the authorize step (if legacy apiKey path is used) — the JWT verification steps themselves MUST report `0` reads

#### Scenario: No new Drizzle tables exist

- **WHEN** `src/db/schema.ts` is inspected and `drizzle/meta/*.json` snapshots are diffed after the change
- **THEN** no new table definitions (`oauth_clients`, `oauth_codes`, `oauth_tokens`, `oauth_sessions`, or similar) SHALL exist, and no SQL migration file SHALL be added for OAuth

#### Scenario: MCP request with OAuth token performs zero D1 queries

- **GIVEN** a valid OAuth access_token JWT
- **WHEN** a client sends `POST /mcp` with `Authorization: Bearer <oauth_access_token>`
- **THEN** the system MUST authenticate and authorize the request with exactly `0` D1 queries (verified via mock spy counting `db.select` / `db.execute` calls on the auth path)

---

### Requirement: Merge Compatibility with Existing ChatGPT-Compatible Surface

The system SHALL preserve the existing `chatgpt-compat` surface: REST API endpoints, `GET /openapi.json` (OpenAPI 3.0), `GET /privacy` (Privacy Policy), and any `/.well-known/*` routes not owned by OAuth. OAuth discovery metadata SHALL be consistent with the OpenAPI security scheme (e.g., `securitySchemes: { bearerAuth: { type: http, scheme: bearer, bearerFormat: JWT } }` and `scopes: ["mcp"]`). The `GET /` and `GET /health` endpoints SHALL remain unchanged. CORS policy for OAuth and MCP SHALL be identical (`Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers` including `Authorization`).

#### Scenario: OpenAPI and OAuth scopes remain consistent

- **GIVEN** `GET /openapi.json` advertises `securitySchemes.bearerAuth` and `GET /.well-known/oauth-authorization-server` advertises `scopes_supported`
- **WHEN** both are fetched without auth
- **THEN** `scopes_supported` in OAuth metadata MUST be a superset of scopes referenced in `openapi.json` security requirements (or exactly equal), and both MUST list `"mcp"` when present

#### Scenario: Privacy policy endpoint still served

- **WHEN** a client sends `GET /privacy`
- **THEN** the system MUST respond `200` with `Content-Type: text/html` or `application/json` (as previously implemented) and MUST NOT be shadowed by OAuth routes

#### Scenario: Root and health endpoints unchanged

- **WHEN** a client sends `GET /` and `GET /health`
- **THEN** `GET /` MUST still return `{ name: "reedrich-mcp", status: "ok", ... }` (existing shape) and `GET /health` MUST still return `200 OK` with `text/plain`

#### Scenario: No route collision between OAuth well-known and existing paths

- **WHEN** a client sends `GET /.well-known/oauth-authorization-server` and `GET /.well-known/oauth-protected-resource` and any pre-existing `/.well-known/*` (e.g., `/.well-known/some-other` if existed)
- **THEN** each MUST route to its correct handler without one shadowing the other, and unknown `/.well-known/*` paths MUST return `404` JSON, not `401` or `500`

