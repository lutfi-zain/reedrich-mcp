# oauth-discovery Specification

## Purpose

Exposes RFC 8414 OAuth Authorization Server metadata and RFC 9728 Protected Resource metadata for Perplexity Pro, ChatGPT, and coding-agent auto-discovery with 100% stateless edge delivery.

## Requirements

### Requirement: OAuth Authorization Server Discovery Metadata

The system SHALL expose `GET /.well-known/oauth-authorization-server` returning RFC 8414 compliant JSON metadata without authentication, with `Content-Type: application/json`, `Cache-Control: public, max-age=3600`, and CORS headers `Access-Control-Allow-Origin: *`.

The response MUST include at minimum: `issuer` (canonical `https://<host>`), `authorization_endpoint` (`https://<host>/oauth/authorize`), `token_endpoint` (`https://<host>/oauth/token`), `registration_endpoint` (`https://<host>/oauth/register`), `scopes_supported` (at least `["mcp"]` or `["read","write"]` as advertised), `response_types_supported: ["code"]`, `grant_types_supported: ["authorization_code","refresh_token"]`, `code_challenge_methods_supported: ["S256"]`, `token_endpoint_auth_methods_supported: ["none","client_secret_basic","client_secret_post"]`, and `revocation_endpoint` when present.

#### Scenario: Perplexity fetches authorization server metadata

- **WHEN** an unauthenticated client sends `GET https://<host>/.well-known/oauth-authorization-server` with `Accept: application/json`
- **THEN** the system MUST respond `200` with `Content-Type: application/json`, a JSON body containing all REQUIRED fields above, `issuer` exactly matching `https://<host>` (no path, no trailing slash mismatch), and `Cache-Control: public, max-age=3600`

#### Scenario: Metadata issuer matches request host dynamically

- **GIVEN** the deployment is reachable at `https://reedrich-mcp.lutfidmz.workers.dev` and also at `https://example.workers.dev` (custom domain)
- **WHEN** a client fetches `GET /.well-known/oauth-authorization-server` via `Host: example.workers.dev`
- **THEN** the returned `issuer`, `authorization_endpoint`, `token_endpoint`, and `registration_endpoint` MUST use `https://example.workers.dev` as origin (dynamic per-request, not hard-coded), and `issuer` MUST NOT contain a path suffix

#### Scenario: CORS and method constraints

- **WHEN** a browser-based client sends `OPTIONS /.well-known/oauth-authorization-server` or `GET` with `Origin: https://perplexity.ai`
- **THEN** the system MUST respond with `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET, OPTIONS`, and for `OPTIONS` return `204` with no body

#### Scenario: Unsupported method rejected

- **WHEN** a client sends `POST /.well-known/oauth-authorization-server`
- **THEN** the system MUST respond `405 Method Not Allowed` with `Allow: GET, OPTIONS`

---

### Requirement: Protected Resource Discovery Metadata

The system SHALL expose `GET /.well-known/oauth-protected-resource` returning RFC 9728 compliant JSON without authentication, with `Content-Type: application/json`, `Cache-Control: public, max-age=3600`, and CORS headers.

The response MUST include: `resource` (`https://<host>/mcp`), `authorization_servers: ["https://<host>"]` (or the canonical issuer), `scopes_supported` (consistent with authorization server metadata), `bearer_methods_supported: ["header"]`, and optionally `resource_name: "Reedrich MCP"` and `resource_documentation`.

#### Scenario: MCP client discovers protected resource metadata

- **WHEN** an unauthenticated client sends `GET https://<host>/.well-known/oauth-protected-resource`
- **THEN** the system MUST respond `200` with JSON containing `resource: "https://<host>/mcp"`, `authorization_servers` array containing `https://<host>`, `bearer_methods_supported` containing `"header"`, and `Cache-Control: public, max-age=3600`

#### Scenario: Protected resource metadata consistency with authorization server

- **GIVEN** `GET /.well-known/oauth-authorization-server` returns `issuer: "https://<host>"` and `scopes_supported: ["mcp"]`
- **WHEN** a client fetches `GET /.well-known/oauth-protected-resource`
- **THEN** `authorization_servers[0]` MUST equal the authorization server `issuer`, and `scopes_supported` MUST be identical between the two documents (set equality)

#### Scenario: Resource metadata CORS

- **WHEN** a client sends `GET /.well-known/oauth-protected-resource` with `Origin: https://chat.openai.com`
- **THEN** the system MUST include `Access-Control-Allow-Origin: *` in the response

---

### Requirement: OpenID Configuration Alias

The system SHALL expose `GET /.well-known/openid-configuration` as an alias of the RFC 8414 authorization server metadata, returning identical JSON semantics (with additional `jwks_uri` if applicable, or omitting it for symmetric HS256 deployments) without authentication.

#### Scenario: ChatGPT probes OpenID configuration

- **WHEN** an unauthenticated client sends `GET https://<host>/.well-known/openid-configuration`
- **THEN** the system MUST respond `200` with `Content-Type: application/json` and a body that is field-for-field compatible with `GET /.well-known/oauth-authorization-server` (same `issuer`, `authorization_endpoint`, `token_endpoint`, `registration_endpoint`, `code_challenge_methods_supported`)

#### Scenario: OpenID alias and OAuth metadata remain synchronized

- **GIVEN** the authorization server metadata has been updated (e.g., `scopes_supported` changed)
- **WHEN** a client fetches both `/.well-known/oauth-authorization-server` and `/.well-known/openid-configuration` sequentially without cache
- **THEN** both responses MUST contain identical values for `issuer`, `authorization_endpoint`, `token_endpoint`, `registration_endpoint`, `response_types_supported`, `grant_types_supported`, and `code_challenge_methods_supported`

---

### Requirement: Discovery Endpoints Availability Without Authentication and Cacheability

The system SHALL serve all `/.well-known/*` discovery endpoints without requiring any `Authorization` header, API key, or session, and SHALL set `Cache-Control: public, max-age=3600` and `Content-Type: application/json; charset=utf-8`. The endpoints SHALL be reachable via `GET` only (and `OPTIONS` for CORS preflight) and SHALL NOT trigger any D1 database query or write.

#### Scenario: Discovery without bearer succeeds despite invalid token

- **GIVEN** a client sends `Authorization: Bearer invalid_token_xyz`
- **WHEN** the client requests `GET /.well-known/oauth-authorization-server`
- **THEN** the system MUST ignore the Authorization header and return `200` with valid discovery JSON (discovery is public)

#### Scenario: Discovery endpoints perform zero database operations

- **WHEN** a client fetches `GET /.well-known/oauth-authorization-server` and `GET /.well-known/oauth-protected-resource` in sequence
- **THEN** the system MUST complete both requests with zero D1 queries and zero D1 writes (verifiable via mock D1 instrumentation in tests), and respond in < 25 ms p50 on Workers edge

#### Scenario: Discovery returns JSON error for unknown well-known path

- **WHEN** a client requests `GET /.well-known/oauth-nonexistent`
- **THEN** the system MUST respond `404` with `Content-Type: application/json` and JSON body `{ "error": "not_found" }`
