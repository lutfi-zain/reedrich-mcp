## MODIFIED Requirements

### Requirement: Consistent Authentication Across All REST Endpoints

All `/api/v1/*` endpoints (both read and write) MUST accept the same authentication methods: OAuth2 Bearer access tokens, legacy Reedrich JWT tokens, and persistent API keys (`rd_live_*` / `fp_live_*`). The credential SHALL be provided via the `Authorization: Bearer <token>` header or the `X-API-Key` header.

Query parameter authentication (`?apiKey`, `?token`) SHALL NOT be supported on REST endpoints — it is reserved for MCP/OAuth flows only.

The only exception is `POST /api/v1/feedback`, which SHALL allow anonymous submissions without authentication.

#### Scenario: OAuth access token authenticates REST request

- **GIVEN** a valid OAuth2 access token obtained via PKCE flow
- **WHEN** `GET /api/v1/wallets` is called with `Authorization: Bearer <oauth-access-token>`
- **THEN** the request SHALL be authenticated and return the user's wallets

#### Scenario: API key authenticates REST request via X-API-Key header

- **GIVEN** a valid API key `rd_live_abc123`
- **WHEN** `GET /api/v1/wallets` is called with `X-API-Key: rd_live_abc123`
- **THEN** the request SHALL be authenticated and return the user's wallets

#### Scenario: Write endpoint requires authentication

- **WHEN** `POST /api/v1/wallets` is called without any authentication header
- **THEN** the response SHALL be HTTP `401` with `{ "error": "UNAUTHORIZED", "message": "Authentication required via Bearer token or API key" }`

#### Scenario: Feedback endpoint allows anonymous submission

- **WHEN** `POST /api/v1/feedback` is called without authentication
- **THEN** the request SHALL be accepted and processed normally
