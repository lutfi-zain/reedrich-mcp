## Why

When client applications (such as ChatGPT Actions, Claude Desktop/Web, or custom web frontends) initiate OAuth 2.0 PKCE authorization, users are directed to `GET /oauth/authorize`. Currently, unauthenticated users must see an intermediate HTML consent page and manually click the "Lanjutkan dengan Akun Google" button to reach Google Sign-In.

By introducing a `provider=google` (with `idp=google` alias) query parameter on `GET /oauth/authorize`, client applications can trigger a direct, zero-click redirect straight to Google OAuth 2.0 while preserving end-to-end PKCE S256 security, reducing user friction and login drop-off.

## What Changes

- **Direct IdP Parameter on `/oauth/authorize`**: `GET /oauth/authorize` checks for optional `provider` or `idp` query parameters.
- **Immediate 302 Redirection to Google**: When `provider=google` (or `idp=google`) is present on an unauthenticated request with valid PKCE parameters (`client_id`, `redirect_uri`, `code_challenge`), the server generates the cryptographically signed Google OAuth relay state JWT and returns an immediate `302 Found` redirect to `https://accounts.google.com/o/oauth2/v2/auth`.
- **Full Backward Compatibility**: If `provider` is omitted, `GET /oauth/authorize` continues to render the existing HTML consent page containing the Google login button and manual API key drawer.
- **Stateless Security Preservation**: Downstream client parameters (`client_id`, `redirect_uri`, `code_challenge`, `state`, `scope`) remain encapsulated in the signed HMAC-SHA256 state token, preserving PKCE S256 guarantees without database writes.
- **Documentation**: Document the `provider=google` parameter in OpenAPI (`src/docs/openapi.ts`) and developer guidance (`src/docs/llms.ts`).

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `google-oauth-federation`: Adds direct identity provider federation via `provider=google` / `idp=google` query parameter on `GET /oauth/authorize`.

## Non-Goals

- Adding support for alternative identity providers (e.g. GitHub, Microsoft, Apple) at this time.
- Altering the downstream callback and token exchange flows: once Google authentication finishes, the flow through `/oauth/google/callback` and `POST /oauth/token` remains completely identical.
- Eliminating the HTML consent page: it remains the default interactive landing page when no provider parameter is passed.

## Security, Multi-Tenancy & Performance

- **Stateless PKCE Protection**: The server packages all downstream OAuth parameters into a signed HMAC-SHA256 JWT state token using `JWT_SECRET`. No state is stored in memory or database, ensuring workerd isolate independence and CSRF protection.
- **Edge Latency**: Direct redirect executes in under 5ms CPU time on Cloudflare Workers edge runtime with zero database queries required.
