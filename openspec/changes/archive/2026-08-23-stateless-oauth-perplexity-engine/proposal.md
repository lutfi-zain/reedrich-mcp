## Why

Perplexity Pro Connectors, ChatGPT Custom Actions / GPT Store, and modern coding agents (Claude Code, Cursor, OMP) now require standards-compliant OAuth 2.1 discovery and authorization before connecting to external MCP servers. Reedrich MCP currently authenticates via in-band MCP tools (`register_user` / `login_user`) with bearer `rd_live_` API keys and 15-minute JWTs, but exposes no `/.well-known/oauth-*` discovery, no Dynamic Client Registration (RFC 7591), no authorization-code + PKCE (RFC 7636), and no RFC 9728 protected-resource metadata. Without these endpoints Perplexity cannot auto-discover, register, or complete a PKCE-constrained authorization_code flow, and ChatGPT cannot perform OAuth-gated Actions discovery — blocking distribution on the two largest AI assistant surfaces while coding agents lack a zero-config OAuth entry-point. This change delivers a 100% stateless OAuth 2.1 and discovery engine on Cloudflare Workers edge that satisfies all three client classes with zero database tables and zero writes.

## What Changes

- **New discovery endpoints (unauthenticated, `GET`, `Cache-Control: public, max-age=3600`):**
  - `GET /.well-known/oauth-authorization-server` — RFC 8414 Authorization Server Metadata (issuer, `authorization_endpoint`, `token_endpoint`, `registration_endpoint`, `jwks_uri` if applicable, `scopes_supported`, `response_types_supported: ["code"]`, `grant_types_supported: ["authorization_code","refresh_token"]`, `code_challenge_methods_supported: ["S256"]`, `token_endpoint_auth_methods_supported`).
  - `GET /.well-known/oauth-protected-resource` — RFC 9728 Protected Resource Metadata (resource, `authorization_servers`, `scopes_supported`, `bearer_methods_supported`).
  - `GET /.well-known/openid-configuration` — alias of RFC 8414 metadata for OpenID Discovery clients that probe this path.
- **New OAuth 2.1 endpoints (Web Crypto / Hono, stateless):**
  - `POST /oauth/register` — RFC 7591 Dynamic Client Registration. Accepts `client_name`, `redirect_uris[]`, `grant_types`, `response_types`, `scope`, `token_endpoint_auth_method`. Returns `client_id` (deterministic opaque ID), `client_id_issued_at`, optional `client_secret` (only for `client_secret_basic` / `client_secret_post`), without any database write. Client identity is encoded as a stateless signed JWT when needed.
  - `GET /oauth/authorize` — Authorization endpoint initiating PKCE S256 flow. Validates `client_id`, `redirect_uri`, `response_type=code`, `code_challenge` + `code_challenge_method=S256`, `scope`, `state`. Authenticates resource owner (existing Reedrich user via `login_user` API key / email flow or direct `userId` binding) and issues a 5-minute HMAC-SHA256 signed JWT authorization code containing `{ sub, client_id, redirect_uri, scope, code_challenge, exp, iat, jti }`.
  - `POST /oauth/token` — Token endpoint handling `grant_type=authorization_code` (verifies `code_verifier` against `code_challenge` via `BASE64URL(SHA256(verifier)) == challenge`, validates JWT code expiry, single-use via `jti` + `exp` window) and `grant_type=refresh_token` (validates 30-day refresh JWT). Issues 15-minute access token JWT `{ sub, client_id, scope, iss, aud, iat, exp }` and 30-day refresh token JWT `{ sub, client_id, scope, token_type:"refresh", iat, exp }`, both HMAC-SHA256 via Web Crypto (`JWT_SECRET`). Supports `client_secret_basic` / `client_secret_post` / `none` (public clients).
  - `POST /oauth/revoke` (optional but recommended) — stateless best-effort revocation (validates JWT signature then returns 200; no revocation list — expiry is the revocation mechanism, documented explicitly).
- **Protected resource enforcement on `POST/GET /mcp` and `/sse`:**
  - Unauthenticated or expired/invalid Bearer token now returns `401 Unauthorized` with `WWW-Authenticate: Bearer resource_metadata="https://<host>/.well-known/oauth-protected-resource", error="invalid_token"` (RFC 9728 / RFC 6750) pointing to resource metadata, instead of bare 401/JSON error.
  - Valid Bearer access token (15-minute JWT) resolves `userId` via `verifyUserToken`-compatible path and enforces existing multi-tenant RLS for all downstream MCP tool handlers.
  - Existing `rd_live_` / `fp_live_` API keys and existing 15-minute `reedrich-mcp` JWTs remain accepted as Bearer tokens alongside new OAuth access tokens (**no breaking change** to current clients).
- **Merge compatibility with `chatgpt-compat` surface (REST API, OpenAPI 3.0, Privacy Policy):**
  - Existing REST endpoints, OpenAPI 3.0 spec at `/openapi.json`, and `/privacy` policy document remain served unchanged. OAuth discovery documents advertise `scopes_supported` and `resource` consistently with OpenAPI security schemes. No route collision between `/.well-known/*` and existing `/.well-known` probes; CORS headers mirror current MCP CORS policy.
- **Cryptographic & storage invariants:**
  - **Zero Database Tables, Zero Database Writes** for all OAuth handshakes (register, authorize, token, refresh, revoke, discovery). All state is encoded in HMAC-SHA256 signed JWTs (Web Crypto `crypto.subtle` / `hono/jwt`). No D1 migration, no new Drizzle tables, no KV writes.
  - Lifetimes (mathematically grounded): authorization code `T_code = 300s` (5 min, minimizes replay window: `P(replay) ∝ T_code`); access token `T_access = 900s` (15 min, balances edge verification cost vs. leakage blast radius); refresh token `T_refresh = 2_592_000s` (30 days, `T_refresh >> T_access`, rotation on each use is deterministic without storage by issuing new JWT with fresh `iat`/`jti`).
  - PKCE S256: `code_challenge = BASE64URL-ENCODE(SHA256(ASCII(code_verifier)))` where `43 ≤ len(verifier) ≤ 128`, `verifier ∈ [A-Z a-z 0-9 - . _ ~]`.
- **Affected existing code (no breaking MCP tool schema changes):**
  - `src/index.ts` — Hono router augmentation (new routes, 401 challenge helper, auth helper branching).
  - `src/utils/token.ts` — new stateless JWT helpers: `generateAuthorizationCode`, `verifyAuthorizationCode`, `generateOAuthAccessToken`, `verifyOAuthAccessToken`, `generateRefreshToken`, `verifyRefreshToken`, `deriveClientId`, `verifyClientSecret` (if confidential clients), PKCE helpers `generateCodeChallenge` / `verifyCodeChallenge` reusing `crypto.subtle.digest("SHA-256")`.
  - `src/utils/pkce.ts` (new) or extended `token.ts` — pure functions for S256 transform, verifier validation.
  - No changes to `src/db/schema.ts` (zero tables) and no changes to `src/mcp.ts` tool input schemas; MCP transport / `extractAuthenticatedUserId` gains an additional Bearer verification path for OAuth access tokens.

## Capabilities

### New Capabilities
- `oauth-discovery`: RFC 8414 Authorization Server Discovery and RFC 9728 Protected Resource Discovery metadata endpoints, including `/.well-known/openid-configuration` alias, caching, CORS, and error semantics.
- `oauth-registration`: RFC 7591 Dynamic Client Registration via stateless signed JWTs / deterministic opaque `client_id`, supporting public and confidential clients with zero persistence.
- `oauth-pkce-authorization`: PKCE S256 challenge generation and verification (`code_challenge` / `code_verifier`) encoded in 5-minute HMAC-SHA256 signed JWT authorization codes via `GET /oauth/authorize`.
- `oauth-token-exchange`: Token exchange and refresh (`grant_type=authorization_code` and `grant_type=refresh_token`) issuing 15-minute access tokens and 30-day refresh tokens statelessly via `POST /oauth/token`, including `client_secret_basic` / `none` auth, error codes, and rotation semantics.
- `oauth-resource-protection`: Protected resource enforcement on `/mcp` and `/sse` — 401 challenge with `WWW-Authenticate: Bearer resource_metadata="..."`, scope enforcement, and backward-compatible acceptance of legacy `rd_live_` and existing JWT bearers.

### Modified Capabilities
<!-- None: this change is additive. Existing MCP tools, resources, prompts, and database tables remain unchanged. Compatibility with chatgpt-compat (REST/OpenAPI/Privacy) is preserved without altering existing requirement blocks; the merge is handled at the routing/metadata level. -->

## Impact

- **Code & Routing:** `src/index.ts` gains 6+ new routes (`/.well-known/*`, `/oauth/*`); `src/utils/token.ts` (+ new `pkce.ts` if split) gains stateless JWT + PKCE primitives. No Drizzle/D1 migration; no `src/mcp.ts` tool signature changes.
- **APIs & Clients:** New externally observable HTTP contract for Perplexity Pro (Streamable HTTP `/mcp` with RFC 9728 discovery), ChatGPT (OAuth-gated Actions via RFC 8414), and coding agents. Existing MCP clients (Claude Code plugin, Cursor, OMP, Pi, OpenCode) continue to work via legacy Bearer API keys with zero migration.
- **Dependencies:** Zero new runtime dependencies beyond existing `hono/jwt` and Web Crypto (`crypto.subtle`). `hono/jwt` already provides `sign`/`verify` (HS256); PKCE uses `crypto.subtle.digest("SHA-256")` (available in workerd). No Node.js native addons.
- **Security:** Stateless HMAC-SHA256 JWTs eliminate token-store exfiltration risk; short-lived codes (5 min) and access tokens (15 min) minimize replay window; PKCE S256 binds authorization code to original client (mitigates code injection even if `redirect_uri` is intercepted). `client_secret` (when issued) is never stored — verified statelessly via HMAC derivation or treated as opaque for public clients. `state` parameter is echoed for CSRF protection. CORS and security headers unchanged.
- **Multi-Tenancy:** `sub` (userId) embedded in stateless tokens is the sole RLS principal; no cross-tenant state is persisted. DCR clients are not tenant-scoped; authorization codes and tokens bind `sub` + `client_id` + `scope` cryptographically.
- **Performance (Cloudflare Workers edge):** 100% stateless verification is O(1) CPU per request (single HMAC-SHA256 verify + optional SHA-256 for PKCE), zero D1 queries for OAuth handshakes, zero KV/Durable Object overhead. Keeps p50 < 10 ms, p99 < 50 ms, well within Workers 50 ms CPU / 128 MB limits. Discovery endpoints are `Cache-Control: public, max-age=3600` cacheable at the edge.
- **Breaking Changes:** None. Marked explicitly: legacy `Authorization: Bearer rd_live_*` / `fp_live_*` and existing `reedrich-mcp` JWTs remain valid. All new OAuth endpoints are additive.

## Non-Goals

- **No database-backed OAuth storage:** No `oauth_clients`, `oauth_codes`, `oauth_tokens`, or `oauth_sessions` tables; no D1 writes for OAuth; no KV, Durable Objects, or R2 for token storage. Stateless design is intentional and non-negotiable.
- **No full OpenID Connect (OIDC) identity layer:** No `id_token` issuance, no `userinfo` endpoint, no OIDC discovery beyond aliasing `/.well-known/openid-configuration` to RFC 8414 metadata. User identity remains Reedrich's existing `register_user` / `login_user` system.
- **No third-party IdP federation:** No Google/GitHub/Apple SSO, no SAML, no OAuth proxy to external authorization servers. Reedrich is the sole authorization server.
- **No UI / consent screen framework beyond minimal redirect:** No hosted HTML consent portal or frontend SPA; `GET /oauth/authorize` may render a minimal confirmation or auto-approve for already-authenticated users, but no design-system or branding overhaul.
- **No scope-based fine-grained tool ACL beyond bearer validation (v1):** All scopes map to full MCP access initially; per-tool scope enforcement (e.g., `read:transactions` vs `write:wallets`) is deferred.
- **No token revocation list or introspection endpoint:** Revocation is expiry-based; `/oauth/revoke` is stateless best-effort. No `POST /oauth/introspect` in v1.
- **No modification to existing MCP tool JSON-RPC schemas, resource URIs, or Drizzle schema:** Out of scope.

