## Purpose

Implements RFC 7591 Dynamic Client Registration as a 100% stateless endpoint that issues deterministic client credentials without any database table or write, enabling Perplexity and ChatGPT to register programmatically.

## ADDED Requirements

### Requirement: Dynamic Client Registration Endpoint

The system SHALL expose `POST /oauth/register` accepting `Content-Type: application/json` with body fields `client_name?: string`, `redirect_uris: string[]` (REQUIRED, at least one valid HTTPS URI or `http://localhost` / `http://127.0.0.1` for loopback), `grant_types?: string[]`, `response_types?: string[]`, `scope?: string`, and `token_endpoint_auth_method?: "none" | "client_secret_basic" | "client_secret_post"`. On success the system MUST respond `201 Created` with `Content-Type: application/json`, `Cache-Control: no-store`, `Pragma: no-cache`, and JSON body containing `client_id: string`, `client_id_issued_at: number` (seconds since epoch), `client_name`, `redirect_uris`, `grant_types`, `response_types`, `scope`, `token_endpoint_auth_method`, and when `token_endpoint_auth_method` is `client_secret_basic` or `client_secret_post`, also `client_secret: string` and `client_secret_expires_at: 0` (non-expiring). The endpoint SHALL NOT perform any D1 write or require prior authentication.

#### Scenario: Public client registration for Perplexity Pro

- **WHEN** an unauthenticated client sends `POST /oauth/register` with `Content-Type: application/json` and body `{ "client_name": "Perplexity", "redirect_uris": ["https://perplexity.ai/oauth/callback"], "grant_types": ["authorization_code","refresh_token"], "response_types": ["code"], "token_endpoint_auth_method": "none" }`
- **THEN** the system MUST respond `201` with `client_id` matching `^[A-Za-z0-9_-]{16,128}$`, `client_id_issued_at` within 5 seconds of server time, `token_endpoint_auth_method: "none"`, no `client_secret` field, and `Cache-Control: no-store`

#### Scenario: Confidential client registration returns client_secret

- **WHEN** a client sends `POST /oauth/register` with `{ "client_name": "ChatGPT Actions", "redirect_uris": ["https://chat.openai.com/aip/callback"], "token_endpoint_auth_method": "client_secret_basic" }`
- **THEN** the system MUST respond `201` with `client_secret` as a cryptographically random string `len >= 32` with at least 128 bits of entropy, `client_secret_expires_at: 0`, and `token_endpoint_auth_method: "client_secret_basic"`

#### Scenario: Registration with multiple redirect_uris

- **WHEN** a client sends `POST /oauth/register` with `{ "redirect_uris": ["https://app.example.com/callback", "https://app.example.com/silent-renew"] }`
- **THEN** the system MUST echo both URIs verbatim in the response `redirect_uris` array in the same order

#### Scenario: Registration defaults for omitted optional fields

- **WHEN** a client sends `POST /oauth/register` with only `{ "redirect_uris": ["https://example.com/callback"] }`
- **THEN** the system MUST default `grant_types` to `["authorization_code","refresh_token"]`, `response_types` to `["code"]`, `token_endpoint_auth_method` to `"none"`, and `scope` to `"mcp"`

---

### Requirement: Stateless Client Identity Derivation

The system SHALL derive `client_id` deterministically or randomly without persistence, and SHALL NOT store client records in D1, KV, or Durable Objects. For confidential clients, `client_secret` SHALL be derived via HMAC-SHA256 over `client_id` using `JWT_SECRET` (or generated randomly and returned once with verification via stateless HMAC check), such that subsequent `POST /oauth/token` authentications can verify `client_secret` without a lookup table. The `client_id` SHALL be opaque and NOT encode PII.

#### Scenario: Same registration payload yields different client_ids (non-deterministic uniqueness)

- **WHEN** a client sends two identical `POST /oauth/register` requests with the same `redirect_uris` and `client_name` 10 ms apart
- **THEN** the returned `client_id` values MUST be distinct (collision probability < 2^-64), proving randomness rather than pure hash-of-input determinism

#### Scenario: Stateless client_secret verification without storage

- **GIVEN** a confidential client registered with `token_endpoint_auth_method: "client_secret_basic"` and received `client_id` and `client_secret`
- **WHEN** the client later authenticates at `POST /oauth/token` using `Authorization: Basic base64(client_id:client_secret)`
- **THEN** the system MUST verify the secret statelessly (HMAC recomputation or JWT-derived check) without any D1 query, and accept the correct secret while rejecting any single-bit flip in the secret with `401 invalid_client`

#### Scenario: Registration performs zero database writes

- **WHEN** a client sends `POST /oauth/register` with valid `redirect_uris`
- **THEN** the system MUST complete the request with zero D1 writes and zero D1 reads (verified via mock D1 spy in tests) and still return a verifiable `client_id`

---

### Requirement: Registration Validation and Error Handling

The system SHALL validate `POST /oauth/register` inputs and on failure respond with `400 Bad Request`, `Content-Type: application/json`, `Cache-Control: no-store`, and JSON body `{ "error": "<rfc7591_error>", "error_description": "<human_readable>" }` where `error` is one of `invalid_redirect_uri`, `invalid_client_metadata`, `invalid_grant_type`, `invalid_response_type`. The system SHALL enforce that every `redirect_uri` is an absolute URI with `https` scheme except `http://localhost` and `http://127.0.0.1` with optional port (loopback exception per RFC 8252). The system SHALL reject `token_endpoint_auth_method` values other than `none`, `client_secret_basic`, `client_secret_post`.

#### Scenario: Rejection of non-HTTPS redirect_uri

- **WHEN** a client sends `POST /oauth/register` with `{ "redirect_uris": ["http://evil.com/callback"] }`
- **THEN** the system MUST respond `400` with `error: "invalid_redirect_uri"` and `error_description` mentioning HTTPS requirement

#### Scenario: Rejection of empty redirect_uris

- **WHEN** a client sends `POST /oauth/register` with `{ "redirect_uris": [] }` or omitting `redirect_uris`
- **THEN** the system MUST respond `400` with `error: "invalid_redirect_uri"`

#### Scenario: Rejection of unsupported grant_type

- **WHEN** a client sends `POST /oauth/register` with `{ "redirect_uris": ["https://example.com/cb"], "grant_types": ["implicit"] }`
- **THEN** the system MUST respond `400` with `error: "invalid_grant_type"` and list supported types in `error_description`

#### Scenario: Rejection of invalid token_endpoint_auth_method

- **WHEN** a client sends `POST /oauth/register` with `{ "redirect_uris": ["https://example.com/cb"], "token_endpoint_auth_method": "client_secret_jwt" }`
- **THEN** the system MUST respond `400` with `error: "invalid_client_metadata"`

#### Scenario: Rejection of malformed JSON

- **WHEN** a client sends `POST /oauth/register` with `Content-Type: application/json` but body `"{ invalid json"`
- **THEN** the system MUST respond `400` with `error: "invalid_client_metadata"`

#### Scenario: Loopback HTTP allowed for native apps

- **WHEN** a client sends `POST /oauth/register` with `{ "redirect_uris": ["http://localhost:8080/callback", "http://127.0.0.1:3000/cb"] }`
- **THEN** the system MUST respond `201` (loopback exception), not `400`
