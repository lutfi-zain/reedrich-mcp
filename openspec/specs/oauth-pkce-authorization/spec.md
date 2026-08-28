# oauth-pkce-authorization Specification

## Purpose

Provides PKCE S256 challenge encoding and verification inside stateless 5-minute signed JWT authorization codes, securing the OAuth authorization step for public clients on the edge without persistent storage.

## Requirements

### Requirement: Authorization Endpoint with PKCE S256

The system SHALL expose `GET /oauth/authorize` supporting query parameters `response_type` (MUST be `"code"`), `client_id` (REQUIRED, opaque string from registration or any non-empty value for stateless mode), `redirect_uri` (REQUIRED, MUST exactly match one of the registered URIs or be any valid HTTPS URI in stateless mode where no registry exists), `scope` (optional, defaults to `"mcp"`), `state` (optional opaque, MUST be echoed verbatim), `code_challenge` (REQUIRED), `code_challenge_method` (REQUIRED, MUST be `"S256"`, plain is not supported), and `code_challenge` length constraints per RFC 7636. The endpoint SHALL authenticate the resource owner via existing Reedrich session (query `?token=<jwt>` or `Authorization: Bearer` or interactive login hint) before issuing a code. On success the system SHALL respond `302 Found` with `Location: {redirect_uri}?code={jwt_authorization_code}&state={state}` and `Cache-Control: no-store`, `Pragma: no-cache`. On client-recoverable error before authentication, the system SHALL redirect with `error` query param; on pre-redirect validation failure it MAY return `400` JSON.

#### Scenario: Successful authorization with PKCE S256

- **GIVEN** an authenticated user with valid `rd_live_` or OAuth session and a registered client `{ client_id: "test_client_123", redirect_uris: ["https://perplexity.ai/oauth/callback"] }`
- **WHEN** the user agent sends `GET /oauth/authorize?response_type=code&client_id=test_client_123&redirect_uri=https://perplexity.ai/oauth/callback&scope=mcp&state=xyz123&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256` with valid auth
- **THEN** the system MUST respond `302` with `Location` containing `code` as a JWT (three dot-separated base64url segments), `state=xyz123` echoed exactly, `Cache-Control: no-store`, and the `code` MUST decode to a JWT whose payload contains `code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"` and `code_challenge_method: "S256"`

#### Scenario: Authorization rejects plain PKCE method

- **WHEN** a client sends `GET /oauth/authorize?...&code_challenge=abc123&code_challenge_method=plain`
- **THEN** the system MUST NOT issue a code; it MUST either redirect to `redirect_uri` with `error=invalid_request&error_description=...S256...` or respond `400` JSON with `error: "invalid_request"` and description mentioning S256 is required

#### Scenario: Authorization rejects missing code_challenge

- **WHEN** a client sends `GET /oauth/authorize?response_type=code&client_id=x&redirect_uri=https://example.com/cb&state=s`
- **THEN** the system MUST respond with `error=invalid_request` (via redirect if `redirect_uri` is valid, else `400` JSON), and MUST NOT issue a code

#### Scenario: State parameter echoed verbatim

- **GIVEN** a valid authorization request with `state=abc%3D123%26foo`
- **WHEN** the system issues the authorization code redirect
- **THEN** the `Location` header MUST contain `state=abc%3D123%26foo` byte-identical to the input (URL-encoded form), enabling CSRF protection verification by the client

#### Scenario: Unauthenticated user receives authentication hint

- **GIVEN** no valid user session is present
- **WHEN** a client sends `GET /oauth/authorize` with valid PKCE params but without auth
- **THEN** the system MUST respond either `401` JSON with `error: "login_required"` and `error_description` instructing to authenticate via Reedrich, or `302` to a login hint URI, and MUST NOT issue a code

---

### Requirement: Authorization Code JWT Structure and Lifetime

The system SHALL issue authorization codes as HMAC-SHA256 signed JWTs (HS256 via Web Crypto, `JWT_SECRET`) with header `{ alg: "HS256", typ: "JWT" }` and payload containing `sub: string` (authenticated userId, e.g., `usr_...`), `client_id: string`, `redirect_uri: string`, `scope: string`, `code_challenge: string`, `code_challenge_method: "S256"`, `iss: "https://<host>"`, `aud: "https://<host>"` or client_id, `iat: number` (seconds), `exp: number` (`iat + 300`, i.e., 5 minutes), `jti: string` (unique per code, `crypto.randomUUID()`), and optionally `client_secret_hash` for confidential binding. The JWT MUST be signed with `JWT_SECRET` and verifiable statelessly. Clock skew tolerance SHALL be ≤ 60 seconds.

#### Scenario: Code JWT has 5-minute lifetime

- **GIVEN** server time `T0 = 1_700_000_000` (seconds)
- **WHEN** the system issues an authorization code JWT at `T0`
- **THEN** the JWT payload MUST have `exp - iat == 300` and `iat` within 2 seconds of `T0`, and `exp` equal to `iat + 300`

#### Scenario: Code JWT signature verification

- **GIVEN** an issued authorization code JWT `code`
- **WHEN** the system verifies it with the same `JWT_SECRET` at time `iat + 100s`
- **THEN** verification MUST succeed and payload fields `sub`, `client_id`, `redirect_uri`, `code_challenge` MUST be extractable; flipping any single character in the signature MUST cause verification to fail

#### Scenario: Expired code rejected at token exchange

- **GIVEN** an authorization code JWT issued at `T0` with `exp = T0 + 300`
- **WHEN** a client presents it at `POST /oauth/token` at time `T0 + 301`
- **THEN** the token endpoint MUST reject it with `400` and `error: "invalid_grant"`, `error_description` mentioning expiration

#### Scenario: Code JWT contains unpredictable jti

- **WHEN** the system issues two authorization codes for the same user and client 10 ms apart
- **THEN** their `jti` values MUST be distinct and each match `^[0-9a-f-]{36}$` or equivalent UUID format, and their `iat` values MAY differ by 0 or 1 second

---

### Requirement: PKCE S256 Challenge Transform Validation

The system SHALL implement RFC 7636 Section 4.2 S256 transform as `code_challenge = BASE64URL-ENCODE(SHA256(ASCII(code_verifier)))` without padding, where `code_verifier` MUST satisfy `43 ≤ len(verifier) ≤ 128` and `verifier ∈ [A-Za-z0-9\-._~]`. At `POST /oauth/token`, the system SHALL compute the transform over the presented `code_verifier` and compare to the `code_challenge` embedded in the authorization code JWT using constant-time comparison. Mismatch SHALL result in `400 invalid_grant`.

#### Scenario: Valid verifier passes S256 check

- **GIVEN** `code_verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"` and `code_challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"` (RFC 7636 example)
- **WHEN** the client sends `POST /oauth/token` with `grant_type=authorization_code&code=<jwt>&code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk&redirect_uri=...&client_id=...`
- **THEN** the token endpoint MUST compute `BASE64URL(SHA256(verifier))` and find it equal to `E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM`, and proceed to issue tokens

#### Scenario: Invalid verifier fails S256 check

- **GIVEN** an issued code with `code_challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"`
- **WHEN** the client sends `code_verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXkX"` (single char appended)
- **THEN** the system MUST respond `400` with `error: "invalid_grant"` and `error_description` mentioning PKCE verification failed

#### Scenario: Verifier length too short rejected

- **WHEN** a client sends `code_verifier = "short"` (len 5)
- **THEN** the system MUST respond `400` with `error: "invalid_request"` and description mentioning `43 ≤ length ≤ 128`

#### Scenario: Verifier with illegal characters rejected

- **WHEN** a client sends `code_verifier = "abc+def/ghi=jkl"` (contains `+`, `/`, `=`)
- **THEN** the system MUST respond `400` with `error: "invalid_request"`

#### Scenario: Verifier length boundaries accepted

- **WHEN** a client uses a verifier of exactly `43` characters (`A-Za-z0-9-._~` alphabet) and separately a verifier of exactly `128` characters
- **THEN** both MUST be accepted as syntactically valid (subject to correct challenge match)

---

### Requirement: Authorization Error Handling and Security Constraints

The system SHALL enforce that `redirect_uri` exactly matches (string equality, including query and trailing slash) the registered URI or the URI bound in the code JWT, SHALL reject `response_type` values other than `"code"`, and SHALL NOT issue codes for expired sessions. Error redirects SHALL include `error` and `error_description` and echo `state` when present, with `Cache-Control: no-store`. Error `error` values SHALL be from `invalid_request`, `unauthorized_client`, `access_denied`, `unsupported_response_type`, `invalid_scope`, `server_error`.

#### Scenario: Mismatched redirect_uri rejected

- **WHEN** a client registered with `redirect_uris: ["https://example.com/callback"]` requests `GET /oauth/authorize?redirect_uri=https://evil.com/callback&...`
- **THEN** the system MUST respond `400` JSON with `error: "invalid_request"` (not a redirect to the attacker URI)

#### Scenario: Unsupported response_type rejected

- **WHEN** a client sends `GET /oauth/authorize?response_type=token&...`
- **THEN** the system MUST respond with `error: "unsupported_response_type"`

#### Scenario: Invalid scope rejected

- **WHEN** a client sends `GET /oauth/authorize?scope=admin%20root&...` where `admin` is not in `scopes_supported`
- **THEN** the system MUST respond with `error: "invalid_scope"`

#### Scenario: Authorization request performs zero database writes

- **WHEN** a valid `GET /oauth/authorize` request is processed
- **THEN** the system MUST perform zero D1 writes and at most one D1 read (user lookup via existing auth path, if needed), and the code issuance path itself MUST require zero D1 operations beyond optional legacy API key hash lookup
