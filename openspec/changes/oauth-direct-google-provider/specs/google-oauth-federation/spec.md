## ADDED Requirements

### Requirement: Direct Google Federation via Authorization Endpoint Query Parameter

The authorization server SHALL support direct Google federation on `GET /oauth/authorize` via the query parameter `provider=google` or `idp=google`.

When an unauthenticated request arrives at `GET /oauth/authorize` with valid PKCE parameters (`client_id`, `redirect_uri`, `code_challenge`, `code_challenge_method=S256`) and `provider=google` (or `idp=google`), the server SHALL NOT render the interactive HTML consent interface. Instead, it MUST immediately generate the cryptographically signed Google OAuth state JWT encapsulating the downstream client parameters and return an HTTP `302 Found` redirection directly to Google's OAuth 2.0 authorization endpoint (`https://accounts.google.com/o/oauth2/v2/auth`) with parameters:
- `client_id`: Configured Google OAuth Client ID
- `redirect_uri`: Server's Google callback endpoint (`/oauth/google/callback`)
- `response_type`: `code`
- `scope`: `openid email profile`
- `state`: The signed state JWT
- `prompt`: `select_account`

When `provider` and `idp` are omitted, the server SHALL continue to render the interactive HTML consent page.

When an unsupported provider parameter is supplied (e.g. `provider=github`), the server SHALL return an HTTP `400 Bad Request` with `error: "invalid_request"` and a descriptive message.

#### Scenario: Direct Google federation via provider=google
- **GIVEN** an unauthenticated client request with valid PKCE parameters (`client_id`, `redirect_uri`, `code_challenge`, `code_challenge_method=S256`)
- **WHEN** the user agent navigates to `GET /oauth/authorize?response_type=code&client_id=client_1&redirect_uri=https://app.com/cb&code_challenge=challenge_1&code_challenge_method=S256&provider=google`
- **THEN** the server MUST respond with HTTP `302 Found`
- **THEN** the `Location` header MUST point to `https://accounts.google.com/o/oauth2/v2/auth` with a valid signed `state` parameter
- **THEN** no HTML consent page SHALL be rendered

#### Scenario: Direct Google federation via idp=google alias
- **GIVEN** an unauthenticated client request with valid PKCE parameters
- **WHEN** the user agent navigates to `GET /oauth/authorize?...&idp=google`
- **THEN** the server MUST respond with HTTP `302 Found` redirecting directly to Google's authorization endpoint

#### Scenario: Missing provider parameter renders interactive consent interface
- **GIVEN** an unauthenticated client request with valid PKCE parameters
- **WHEN** the user agent navigates to `GET /oauth/authorize` without `provider` or `idp`
- **THEN** the server MUST respond with HTTP `200 OK` and Content-Type `text/html` rendering the consent page with the Google Sign-In button

#### Scenario: Unsupported provider value rejected
- **GIVEN** an unauthenticated client request
- **WHEN** the user agent navigates to `GET /oauth/authorize?...&provider=github`
- **THEN** the server MUST return HTTP `400 Bad Request` with an `invalid_request` error indicating unsupported provider
