# OAuth 2.0 Provider Specification

## Purpose

The OAuth 2.0 Provider capability enables ChatGPT Custom GPTs to authenticate end-users via standard web-based authorization and token exchange flows, seamlessly integrating new and existing Reedrich user accounts without exposing raw API keys in chat conversations.

## Requirements

### Requirement: OAuth 2.0 Authorization Endpoint
The server SHALL expose `GET /oauth/authorize` and `POST /oauth/authorize` endpoints. The `GET` request MUST render an interactive HTML consent page allowing the user to either log in with an existing API key (`rd_live_...`) or sign up with their name, email, and WhatsApp number. Upon successful credentials verification or registration, the `POST` handler MUST issue a cryptographically signed authorization code and redirect the browser back to `redirect_uri` with `code` and `state`.

#### Scenario: Authorize existing user via API key
- **GIVEN** a valid client request with `client_id`, `redirect_uri=https://chatgpt.com/aip/callback`, `response_type=code`, and `state=xyz`
- **WHEN** the user submits their valid API key `rd_live_123` on the authorization page
- **THEN** the server redirects with HTTP 302 to `https://chatgpt.com/aip/callback?code=<auth_code>&state=xyz`

#### Scenario: Authorize new user via registration form
- **GIVEN** a valid authorization request from ChatGPT
- **WHEN** a new user fills and submits first name, last name, email, and WhatsApp number
- **THEN** the server creates a new user account in D1, generates a persistent API key, and redirects to `redirect_uri` with a valid authorization code

#### Scenario: Invalid client or missing redirect_uri
- **WHEN** a client sends `GET /oauth/authorize` without a `redirect_uri`
- **THEN** the server returns HTTP 400 with an error description

---

### Requirement: OAuth 2.0 Token Exchange Endpoint
The server SHALL expose a `POST /oauth/token` endpoint accepting `application/x-www-form-urlencoded` or `application/json` payloads with `grant_type=authorization_code`, `code`, `client_id`, `client_secret`, and `redirect_uri`. The server MUST validate the authorization code and client credentials, and respond with a valid JSON access token payload containing `access_token`, `token_type: "Bearer"`, and `expires_in`.

#### Scenario: Successful token exchange
- **GIVEN** a valid, unexpired authorization code for user `u-456` and matching client credentials
- **WHEN** ChatGPT backend sends `POST /oauth/token` with `grant_type=authorization_code` and valid credentials
- **THEN** the server returns HTTP 200 with `{ "access_token": "<jwt>", "token_type": "Bearer", "expires_in": 86400 }`

#### Scenario: Expired or tampered authorization code
- **WHEN** a client attempts token exchange with an invalid, expired, or previously used code
- **THEN** the server returns HTTP 400 with `{ "error": "invalid_grant" }`

---

### Requirement: Unified Identity and MCP Backward Compatibility
The OAuth provider MUST share the same underlying `users` database table and SHA-256 API key hashing system as the JSON-RPC MCP server. Users created via OAuth registration MUST be immediately usable via MCP tools (`login_user`, direct API key bearer auth) using their generated `rd_live_...` key, and users created via MCP `register_user` MUST be immediately able to log in via `/oauth/authorize`.

#### Scenario: Cross-protocol identity verification
- **GIVEN** a user registered via MCP tool `register_user` with API key `rd_live_abc`
- **WHEN** the user inputs `rd_live_abc` into the `/oauth/authorize` web form
- **THEN** the server successfully recognizes the user's existing account and wallets without duplicating user records
