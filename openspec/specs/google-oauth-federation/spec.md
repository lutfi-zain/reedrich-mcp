# google-oauth-federation Specification

## Purpose

Enables frictionless, 1-click authentication and account creation for Perplexity Pro, ChatGPT, and browser users via Google OAuth 2.0 Identity Federation, automatically provisioning or linking Cloudflare D1 user accounts without requiring manual API key generation or external database tables for OAuth handshakes.

## Requirements

### Requirement: Google Sign-In Entry and Redirect
The authorization server SHALL initiate Google OAuth 2.0 authorization code flow at `GET /oauth/google/start`.

The endpoint MUST:
- Accept standard OAuth 2.1 / PKCE parameters: `client_id`, `redirect_uri`, `response_type`, `code_challenge`, `code_challenge_method`, `scope`, and optional `state`.
- Validate `redirect_uri` format (reject invalid/disallowed URIs).
- Generate a cryptographically signed HMAC-SHA256 state JWT encapsulating the downstream client parameters and a short 10-minute expiration.
- Return an HTTP `302 Found` redirection to Google's OAuth 2.0 endpoint (`https://accounts.google.com/o/oauth2/v2/auth`) with parameters:
  - `client_id`: Configured Google OAuth Client ID
  - `redirect_uri`: Server's callback endpoint (`/oauth/google/callback`)
  - `response_type`: `code`
  - `scope`: `openid email profile`
  - `state`: The signed state JWT
  - `prompt`: `select_account`

#### Scenario: Successful Google login initiation
- **WHEN** a client navigates to `GET /oauth/google/start` with valid PKCE parameters
- **THEN** the server MUST respond with HTTP `302 Found` redirecting to Google with the signed state parameter.

#### Scenario: Google login initiation with invalid redirect_uri
- **WHEN** a client calls `GET /oauth/google/start` with an invalid `redirect_uri` (e.g. `javascript:alert(1)`)
- **THEN** the server MUST return HTTP `400 Bad Request` with an `invalid_request` error.

---

### Requirement: Google Callback and User Provisioning
The authorization server SHALL handle Google OAuth 2.0 callbacks at `GET /oauth/google/callback`.

The endpoint MUST:
- Verify the Google `state` parameter using the server's `JWT_SECRET` to recover original downstream client parameters.
- Handle error parameters from Google (e.g., `error=access_denied`) and redirect back to the downstream client's `redirect_uri` with appropriate OAuth error parameters.
- Exchange the Google authorization code for Google access and ID tokens via `https://oauth2.googleapis.com/token`.
- Fetch and decode user profile from Google UserInfo endpoint (`https://www.googleapis.com/oauth2/v3/userinfo`).
- Query Cloudflare D1 `users` table by normalized `userEmail`:
  - If user exists: link identity to existing `userId`.
  - If user does not exist: auto-provision new user record with generated UUID `userId`, Google `given_name` / `family_name`, dummy WhatsApp `+0`, and a fresh hashed API key.
- Generate a 5-minute signed authorization code JWT bound to the downstream client's `client_id`, `redirect_uri`, and `code_challenge`.
- Redirect HTTP `302 Found` to the downstream client's `redirect_uri` with `code` and preserved `state`.

#### Scenario: Existing Google user logs in
- **WHEN** an existing user completes Google authentication and returns to `/oauth/google/callback`
- **THEN** the server MUST identify the user by email in D1, issue a short-lived authorization code, and redirect to the downstream client's `redirect_uri`.

#### Scenario: New Google user signs up
- **WHEN** a new user completes Google authentication and returns to `/oauth/google/callback`
- **THEN** the server MUST insert a new user record into D1, generate an authorization code, and redirect to downstream client's `redirect_uri`.

#### Scenario: Google user denies consent
- **WHEN** Google returns `error=access_denied` to `/oauth/google/callback`
- **THEN** the server MUST redirect to downstream client's `redirect_uri` with `error=access_denied`.

---

### Requirement: Google Sign-In Option in Consent UI
The authorization consent interface at `GET /oauth/authorize` SHALL present a prominent Google Sign-In button alongside the manual API key input tab.

#### Scenario: Render consent interface
- **WHEN** a client accesses `GET /oauth/authorize` with valid query parameters
- **THEN** the rendered HTML MUST include a direct link to `/oauth/google/start` preserving all current PKCE and OAuth query parameters.

---

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
