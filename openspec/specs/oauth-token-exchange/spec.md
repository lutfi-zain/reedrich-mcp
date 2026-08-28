# oauth-token-exchange Specification

## Purpose

Defines stateless token exchange and refresh behavior for authorization_code and refresh_token grants, issuing 15-minute access tokens and 30-day refresh tokens via HMAC-SHA256 JWTs with zero persistence and mathematically bounded lifetimes.

## Requirements

### Requirement: Authorization Code Grant Token Exchange

The system SHALL expose `POST /oauth/token` with `Content-Type: application/x-www-form-urlencoded` (and accept `application/json` as lenient alias) handling `grant_type=authorization_code` with parameters `code` (JWT from authorize), `redirect_uri` (MUST equal the `redirect_uri` bound in the code JWT, string equality), `client_id` (MUST equal code's `client_id`), `code_verifier` (REQUIRED for S256, validated via transform), and optional `client_secret` (when `token_endpoint_auth_method` is `client_secret_basic`/`client_secret_post`). On success the system SHALL respond `200` with `Content-Type: application/json`, `Cache-Control: no-store`, `Pragma: no-cache`, and JSON body `{ access_token: string (JWT), token_type: "Bearer", expires_in: 900, refresh_token: string (JWT), scope: string }`. The `access_token` SHALL be an HS256 JWT with `sub`, `client_id`, `scope`, `iss`, `aud`, `iat`, `exp = iat + 900`. The `refresh_token` SHALL be an HS256 JWT with `sub`, `client_id`, `scope`, `token_type: "refresh"`, `iat`, `exp = iat + 2592000` (30 days), and `jti`. Verification SHALL be stateless via `JWT_SECRET`. The endpoint SHALL support unauthenticated public clients (`client_secret` absent) and confidential clients via `Authorization: Basic` or `client_secret` form field.

#### Scenario: Successful authorization_code exchange issues token pair

- **GIVEN** a valid 5-minute authorization code JWT for `sub: usr_abc123`, `client_id: perplx_client`, `redirect_uri: https://perplexity.ai/oauth/callback`, `scope: mcp`, `code_challenge: E9Melho...`
- **WHEN** a client sends `POST /oauth/token` with `grant_type=authorization_code&code=<jwt>&redirect_uri=https://perplexity.ai/oauth/callback&client_id=perplx_client&code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk` and `Content-Type: application/x-www-form-urlencoded`
- **THEN** the system MUST respond `200` with `access_token` as a JWT whose payload has `sub: usr_abc123`, `client_id: perplx_client`, `exp - iat == 900`, `token_type: "Bearer"`, `expires_in: 900`, and `refresh_token` as a JWT with `exp - iat == 2592000`

#### Scenario: Token exchange rejects mismatched redirect_uri

- **GIVEN** a code bound to `redirect_uri: https://perplexity.ai/oauth/callback`
- **WHEN** a client sends `POST /oauth/token` with `redirect_uri: https://evil.com/callback`
- **THEN** the system MUST respond `400` with `error: "invalid_grant"` and `error_description` mentioning redirect_uri mismatch

#### Scenario: Token exchange rejects mismatched client_id

- **GIVEN** a code bound to `client_id: client_A`
- **WHEN** a client sends `POST /oauth/token` with `client_id: client_B` (different)
- **THEN** the system MUST respond `400` with `error: "invalid_grant"`

#### Scenario: Token exchange rejects expired code

- **GIVEN** a code with `exp = T0 + 300` verified at `T0 + 301`
- **WHEN** a client sends `POST /oauth/token` with that `code`
- **THEN** the system MUST respond `400` with `error: "invalid_grant"`

#### Scenario: Token exchange supports client_secret_basic

- **GIVEN** a confidential client with `client_id: chatgpt_cli` and `client_secret: s3cr3tXYZ...`
- **WHEN** the client sends `POST /oauth/token` with `Authorization: Basic base64(chatgpt_cli:s3cr3tXYZ...)` plus valid `grant_type`, `code`, `redirect_uri`, `code_verifier`
- **THEN** the system MUST verify the Basic credential statelessly and on success return `200` with tokens; with wrong secret MUST return `401` with `error: "invalid_client"`

#### Scenario: Token exchange accepts JSON content type leniently

- **WHEN** a client sends `POST /oauth/token` with `Content-Type: application/json` and JSON body `{ "grant_type": "authorization_code", "code": "<jwt>", "redirect_uri": "https://example.com/cb", "client_id": "x", "code_verifier": "y..." }`
- **THEN** the system MUST parse the JSON and process identically to form-urlencoded (or return `400 invalid_request` with clear description if JSON is malformed)

---

### Requirement: PKCE Verifier Enforcement at Token Exchange

The system SHALL at `POST /oauth/token` with `grant_type=authorization_code` recompute `BASE64URL(SHA256(ASCII(code_verifier)))` and compare to `code_challenge` in the code JWT using constant-time equality. The `code_verifier` SHALL be validated for length `43..128` and alphabet `[A-Za-z0-9\-._~]` before transform. Missing `code_verifier` when code was issued with S256 SHALL result in `400 invalid_request`. Mismatch SHALL result in `400 invalid_grant`.

#### Scenario: Missing code_verifier rejected

- **GIVEN** a code issued with `code_challenge_method: S256` and `code_challenge: E9Mel...`
- **WHEN** a client sends `POST /oauth/token` without `code_verifier` parameter
- **THEN** the system MUST respond `400` with `error: "invalid_request"` and description mentioning `code_verifier` required

#### Scenario: Verifier with illegal characters rejected at token endpoint

- **WHEN** a client sends `code_verifier: "bad+verifier/with=chars"`
- **THEN** the system MUST respond `400` with `error: "invalid_request"` before performing the transform

#### Scenario: Constant-time comparison prevents timing oracle (observable)

- **GIVEN** two verifiers that differ only in the last character and both produce wrong challenges
- **WHEN** the system verifies each
- **THEN** both MUST return `400 invalid_grant` with identical error shape and the response time delta MUST be < 5 ms (no early-exit length leak beyond generic 400; implementation SHOULD use constant-time compare)

---

### Requirement: Refresh Token Grant Exchange

The system SHALL handle `grant_type=refresh_token` at `POST /oauth/token` with parameters `refresh_token` (REQUIRED, 30-day JWT issued previously), `scope` (optional, MUST be equal or narrower than original scope), `client_id` and optional `client_secret` (MUST match the `client_id` bound in the refresh_token JWT). On success the system SHALL respond `200` with `Content-Type: application/json`, `Cache-Control: no-store`, and JSON body `{ access_token: string (JWT, exp = iat + 900), token_type: "Bearer", expires_in: 900, refresh_token: string (JWT, exp = iat + 2592000, new jti), scope: string }` — i.e., rotation: a new refresh token is issued with fresh `iat`/`jti` and new 30-day window. The endpoint SHALL verify the refresh_token signature, expiry (≤ 60s clock skew), and `token_type == "refresh"`. Expired or tampered refresh tokens SHALL be rejected with `400 invalid_grant`.

#### Scenario: Successful refresh issues rotated tokens

- **GIVEN** a valid refresh_token JWT issued at `T0` with `sub: usr_abc123`, `client_id: perplx_client`, `scope: mcp`, `exp: T0 + 2592000`
- **WHEN** a client sends `POST /oauth/token` at `T0 + 1000` with `grant_type=refresh_token&refresh_token=<jwt>&client_id=perplx_client`
- **THEN** the system MUST respond `200` with new `access_token` (`exp - iat == 900`) and new `refresh_token` (`exp - iat == 2592000`, `jti` distinct from the presented token's `jti`), both signed with `JWT_SECRET`

#### Scenario: Refresh with narrower scope

- **GIVEN** a refresh_token with `scope: "mcp read write"`
- **WHEN** a client sends `grant_type=refresh_token&scope=mcp&refresh_token=<jwt>`
- **THEN** the system MUST issue tokens with `scope: "mcp"` (narrowed) and succeed with `200`

#### Scenario: Refresh with broader scope rejected

- **GIVEN** a refresh_token with `scope: "mcp"`
- **WHEN** a client sends `grant_type=refresh_token&scope=mcp%20admin&refresh_token=<jwt>`
- **THEN** the system MUST respond `400` with `error: "invalid_scope"`

#### Scenario: Expired refresh token rejected

- **GIVEN** a refresh_token with `exp: T0 + 2592000` presented at `T0 + 2592001` (1 second past expiry)
- **WHEN** a client sends `POST /oauth/token` with that token
- **THEN** the system MUST respond `400` with `error: "invalid_grant"` and description mentioning expiration

#### Scenario: Refresh token bound to different client rejected

- **GIVEN** a refresh_token with `client_id: client_A`
- **WHEN** a client sends `grant_type=refresh_token&client_id=client_B&refresh_token=<jwt_for_A>`
- **THEN** the system MUST respond `400` with `error: "invalid_grant"` (or `401 invalid_client` if secret check fails first)

#### Scenario: Access token cannot be used as refresh token

- **GIVEN** an access_token JWT (with no `token_type: refresh` or `exp - iat == 900`)
- **WHEN** a client sends `grant_type=refresh_token&refresh_token=<access_token>`
- **THEN** the system MUST respond `400` with `error: "invalid_grant"` mentioning token_type mismatch

---

### Requirement: Token Response Format, Lifetimes, and Error Codes

The system SHALL for `POST /oauth/token` set `Cache-Control: no-store` and `Pragma: no-cache` on all responses (success and error), SHALL return `200` with `expires_in` as integer seconds (900 for access, 2592000 implicit for refresh), SHALL return errors as `400` or `401` with `Content-Type: application/json` and JSON body `{ "error": "<oauth_error>", "error_description": "<string>" }` where `error` is one of `invalid_request`, `invalid_client`, `invalid_grant`, `unauthorized_client`, `unsupported_grant_type`, `invalid_scope`. For `invalid_client` the system SHALL return `401` with `WWW-Authenticate: Basic realm="oauth"` when Basic auth was attempted, otherwise `400`. Lifetimes SHALL be mathematically enforced: `T_access = 900`, `T_refresh = 2_592_000`, `T_code = 300`, with `T_refresh >> T_access > T_code` to bound leakage window.

#### Scenario: Successful token response has correct headers and fields

- **WHEN** any valid `POST /oauth/token` grant succeeds
- **THEN** the response MUST have `Cache-Control: no-store`, `Pragma: no-cache`, `Content-Type: application/json`, body fields `access_token` (string, JWT with 3 segments), `token_type: "Bearer"`, `expires_in: 900` (number, not string), `refresh_token` (string, JWT), `scope` (string)

#### Scenario: Unsupported grant_type rejected

- **WHEN** a client sends `POST /oauth/token` with `grant_type=client_credentials`
- **THEN** the system MUST respond `400` with `error: "unsupported_grant_type"`

#### Scenario: Missing grant_type rejected

- **WHEN** a client sends `POST /oauth/token` without `grant_type`
- **THEN** the system MUST respond `400` with `error: "invalid_request"`

#### Scenario: Invalid client secret returns 401

- **WHEN** a confidential client sends `POST /oauth/token` with `Authorization: Basic base64(client_id:wrong_secret)`
- **THEN** the system MUST respond `401` with `error: "invalid_client"` and `WWW-Authenticate: Basic realm="oauth"`

#### Scenario: Error responses are no-store

- **WHEN** a client sends an invalid `POST /oauth/token` request that returns `400`
- **THEN** the response MUST still contain `Cache-Control: no-store` and `Pragma: no-cache`

---

### Requirement: Stateless Zero-Storage Token Invariant

The system SHALL issue and verify all tokens (authorization codes, access tokens, refresh tokens) using only HMAC-SHA256 with `JWT_SECRET` and Web Crypto, without any D1 table, D1 write, KV, or Durable Object storage for token state. Token revocation SHALL be via expiry only; `POST /oauth/revoke` (if implemented) SHALL be stateless best-effort (verify signature then return `200` regardless, no revocation list). The system SHALL NOT require a database migration for OAuth.

#### Scenario: Token issuance performs zero database writes

- **WHEN** a client performs a full OAuth flow: `POST /oauth/register` → `GET /oauth/authorize` → `POST /oauth/token` (authorization_code) → `POST /oauth/token` (refresh_token)
- **THEN** the aggregate D1 writes across all four steps MUST be `0` (verified via mock D1 spy), and at most one D1 read for initial user authentication

#### Scenario: Token verification performs zero database queries

- **WHEN** a client presents a valid access_token JWT to `GET /mcp` or `POST /oauth/token` (as refresh_token)
- **THEN** verification MUST complete with zero D1 queries (pure `crypto.subtle.verify` / `hono/jwt verify`), and succeed in < 10 ms p50

#### Scenario: Revocation is stateless best-effort

- **GIVEN** `POST /oauth/revoke` is implemented with `token=<jwt>&token_type_hint=refresh_token`
- **WHEN** a client revokes a valid refresh_token and then attempts `grant_type=refresh_token` with the same token before expiry
- **THEN** the system MAY still accept the token (since no revocation list exists) and MUST document this behavior: revocation is expiry-based, `POST /oauth/revoke` returns `200` for any syntactically valid JWT
