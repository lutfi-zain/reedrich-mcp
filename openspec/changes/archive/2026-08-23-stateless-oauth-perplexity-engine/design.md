## Context

See `proposal.md` — Why and What Changes for motivation, scope, and capability list. See `specs/oauth-*/spec.md` for normative externally observable behavior (RFC 2119, scenarios).

Current state: `reedrich-mcp` runs as a stateless Hono app on Cloudflare Workers (`src/index.ts`), authenticating via `extractAuthenticatedUserId` which verifies either a persistent `rd_live_` / `fp_live_` API key (SHA-256 hash lookup in D1 `users`) or a 15-minute HMAC-SHA256 JWT (`hono/jwt` `sign`/`verify`, `JWT_SECRET`, claims `sub`, `iss: reedrich-mcp`, `aud: reedrich-client`). MCP is served at `/mcp` and `/sse` via `WebStandardStreamableHTTPServerTransport` with no session persistence. There are no OAuth discovery, DCR, authorize, or token endpoints; unauthenticated `/mcp` requests currently flow into the MCP transport and fail inside tool handlers rather than returning RFC 9728 `WWW-Authenticate` challenges. `src/utils/token.ts` already provides `hashApiKey`, `generateApiKey`, `generateUserId`, `generateUserToken`, `verifyUserToken` using Web Crypto. No `oauth_*` tables exist and the design must keep it that way.

Constraints that shape the approach:
- **Edge runtime (workerd):** No Node.js `crypto` C++ bindings beyond Web Crypto (`crypto.subtle`, `crypto.randomUUID`, `crypto.getRandomValues`), no `fs`, no `jsonwebtoken` native deps. Only Web Standard APIs and `hono/jwt` are safe. CPU 50 ms / 128 MB / 10 ms p50 budget.
- **Zero-Storage Invariant:** Zero D1 tables, zero D1 writes, zero KV/DO/R2 for OAuth. All state must be encoded in HMAC-SHA256 JWTs. Verification is `O(1)` HMAC + optional `SHA-256` for PKCE.
- **Multi-tenancy & RLS:** `sub` (userId) extracted statelessly is the sole RLS principal for all downstream `drizzle` queries (`eq(table.userId, sub)`). No cross-tenant ambient authority.
- **Backward compatibility:** Legacy `rd_live_` / `fp_live_` + existing JWTs must remain valid on `/mcp`; existing REST `/openapi.json`, `/privacy`, `GET /`, `GET /health`, and Claude plugin `skills/` must not regress.
- **Mathematical grounding:** Lifetimes minimize replay window (`P_replay ∝ T_window`) while bounding edge verification cost (one HMAC per request). S256 is `BASE64URL(SHA256(verifier))` (32-byte digest → 43-char URL-safe string), not reversible; verifier entropy `43..128` chars over 66-symbol alphabet gives `log2(66^43) ≈ 260` bits minimum.

## Goals / Non-Goals

**Goals:**
- Deliver RFC 8414 + RFC 9728 + `/.well-known/openid-configuration` discovery with dynamic origin reflection, `Cache-Control: public, max-age=3600`, and CORS.
- Deliver RFC 7591 DCR statelessly (opaque `client_id`, optional `client_secret` verified via HMAC derivation, zero persistence).
- Deliver `GET /oauth/authorize` issuing 5-minute HS256 JWT authorization codes binding `sub`, `client_id`, `redirect_uri`, `scope`, `code_challenge` (S256), `jti`, `iat/exp`.
- Deliver `POST /oauth/token` for `authorization_code` (verifies `code_verifier` via `SHA-256` + constant-time compare, checks `redirect_uri`/`client_id` equality, rejects expired codes) and `refresh_token` (verifies 30-day JWT, enforces scope narrowing, rotates with new `jti`/`iat`), issuing 15-minute access JWTs and 30-day refresh JWTs.
- Enforce `401` with `WWW-Authenticate: Bearer resource_metadata="https://<host>/.well-known/oauth-protected-resource"` on `/mcp`/`/sse` for unauthenticated/invalid/expired/insufficient-scope requests.
- Preserve 100% statelessness (Web Crypto only, zero D1 writes, zero new tables) and merge cleanly with `chatgpt-compat` (OpenAPI scopes, privacy policy, REST).
- Keep all new code workerd-compatible and testable via `MockD1Database` + `node:sqlite` without touching remote D1.

**Non-Goals:**
- No `oauth_*` D1 tables, KV namespaces, Durable Objects, or migration SQL.
- No OIDC `id_token` / `userinfo` / OIDC-specific discovery beyond aliasing `openid-configuration`.
- No external IdP federation, no hosted consent UI framework beyond minimal redirect/JSON, no per-tool scope ACL beyond bearer presence (v1).
- No token introspection (`/oauth/introspect`) or revocation list; `POST /oauth/revoke` is best-effort if included.
- No changes to existing MCP tool input schemas, resource URIs, or `src/db/schema.ts`.

## Decisions

### 1. Stateless JWT for Every OAuth Artifact (code, access, refresh) — HMAC-SHA256 via `hono/jwt` + Web Crypto

*Decision:* Reuse `hono/jwt` `sign`/`verify` (HS256) with `JWT_SECRET` (existing binding) for all OAuth JWTs. Payloads: code `{ sub, client_id, redirect_uri, scope, code_challenge, code_challenge_method, iss, aud, iat, exp = iat+300, jti }`; access `{ sub, client_id, scope, iss, aud, iat, exp = iat+900, jti }`; refresh `{ sub, client_id, scope, token_type:"refresh", iss, aud, iat, exp = iat+2592000, jti }`. Verification is pure `verify(jwt, secret, "HS256")` plus expiry/clock-skew (`≤ 60s`) checks; no D1/KV lookup.

*Rationale:* Satisfies Zero-Storage invariant; eliminates token-store exfiltration surface; keeps p50 < 10 ms (single HMAC). `hono/jwt` is already workerd-compatible (Web Crypto Subtle import, no Node `crypto` require). 5/15/30-day lifetimes give `T_code << T_access << T_refresh` leakage hierarchy: code replay window 300 s, access blast radius 900 s, refresh rotation without storage via new `jti`/`iat`.

*Alternatives Considered:*
- D1 table `oauth_codes`/`oauth_tokens` (rejected: adds migration, writes on every handshake, violates 100% stateless goal, increases tail latency via D1 `INSERT`/`SELECT`).
- KV or Durable Objects for client/code store (rejected: adds binding, eventual consistency, cost, and still requires cleanup TTL logic).
- RS256 with `jwks_uri` (rejected: requires key rotation infra, `crypto.subtle` RSA key import is heavier, HS256 is sufficient for first-party authorization server where clients do not verify JWTs — only the server does; `jwks_uri` can be added later without breaking HS256).

*Edge Fit:* `hono/jwt` uses `crypto.subtle.importKey` + `sign`/`verify` (HMAC) — confirmed workerd-supported. No `node:crypto` `createHmac` needed in production path (though `node:crypto` may be used in tests for vector checks).

### 2. PKCE S256 Implemented via `crypto.subtle.digest("SHA-256")` + Base64url (No Padding)

*Decision:* Implement `code_challenge = base64url(sha256(ascii(verifier)))` where `sha256` is `crypto.subtle.digest("SHA-256", TextEncoder.encode(verifier))`, base64url is `btoa` with `+→-`, `/→_`, `=→""` stripping, per RFC 7636 §4.2. Verifier validation: `43 ≤ len ≤ 128`, alphabet `A-Za-z0-9\-._~`, enforced before digest. Comparison at `/oauth/token` uses constant-time equality (loop over char codes, accumulate `diff |= a ^ b`, check length equality separately but without early return on mismatch content).

*Rationale:* Public clients (Perplexity, ChatGPT) cannot keep `client_secret`; S256 binds code to the original verifier holder, mitigating authorization code interception even if `redirect_uri` is leaked. `plain` is rejected because it offers no cryptographic binding. Web Crypto `digest` is available in workerd; using `TextEncoder` ensures ASCII vs UTF-8 equivalence for the RFC's unreserved alphabet.

*Alternatives Considered:*
- Supporting `plain` alongside `S256` (rejected: weakens security, doubles test matrix, RFC 7636 recommends S256-only for new servers).
- Using `node:crypto` `createHash("sha256")` (rejected: not available in workerd; would require polyfill).
- Storing `code_challenge` in D1 for later comparison (rejected: violates statelessness; embedding challenge in code JWT is sufficient).

*Math Note:* SHA-256 output is 256 bits → 32 bytes → 43 base64url chars (ceil(32*4/3) = 43 after padding removal). Collision resistance `~2^128`, preimage `~2^256`, adequate for PKCE.

### 3. Dynamic Client Registration Without Persistence (Opaque `client_id` + HMAC-Derived or Random `client_secret`)

*Decision:* `POST /oauth/register` generates `client_id` as `crypto.randomUUID()` (or `base64url(random 16 bytes)`) — opaque, not encoding `redirect_uris` — and returns it with `client_id_issued_at`. For `token_endpoint_auth_method: "none"` no secret is issued. For `client_secret_basic`/`client_secret_post`, generate `client_secret` as `base64url(random 32 bytes)` (256 bits entropy) and return it once; verification at `/oauth/token` recomputes `HMAC-SHA256(JWT_SECRET, client_id)` or performs stateless check `verifyClientSecret(client_id, presented)` by re-deriving expected secret via `HMAC(client_id)` if derivation mode is used, or by treating the presented secret as the verification key for the non-derivation random mode — the design chooses **random + HMAC-envelope**: store nothing, but derive a verifiable tag `tag = HMAC(JWT_SECRET, client_id + "." + client_secret)` embedded in a stateless envelope or simply re-hash on token endpoint by checking `HMAC(JWT_SECRET, client_id) == truncated(client_secret)` if derivation is chosen. The cleanest stateless approach is: if confidential, set `client_secret = base64url(HMAC(JWT_SECRET, "client-secret:" + client_id + ":" + randomSalt))` where `randomSalt` is returned? Actually simpler: generate random `client_secret` and consider it valid iff `HMAC(JWT_SECRET, client_id)`-derived check passes via a separate signing — but pure random cannot be verified statelessly without storage. Therefore for true statelessness we use **HMAC-derived deterministic secret**: `client_secret = base64url(HMAC_SHA256(JWT_SECRET, "oauth:client-secret:" + client_id))`. This is verifiable without storage (recompute HMAC), deterministic per `client_id`, and still has 256-bit entropy (HMAC output). Uniqueness of `client_id` ensures secret uniqueness. An alternative that keeps per-registration randomness while staying stateless is to issue `client_secret` as `JWT(client_id, salt)` signed with `JWT_SECRET`; verification is `verify(jwt)`. Both satisfy zero-storage. We select HMAC-derived deterministic secret for minimal implementation (single `crypto.subtle.sign`).

*Rationale:* RFC 7591 expects the server to store client metadata; stateless interpretation is permitted when the server can verify `client_id`/`client_secret` without a store. Deterministic HMAC derivation gives us that at cost of one HMAC per token request (negligible). Random-UUID `client_id` avoids collisions (`2^122` space) and avoids encoding PII.

*Alternatives Considered:*
- Hard error if `redirect_uri` not pre-registered (strict RFC) vs stateless lenient mode where any `https` `redirect_uri` is accepted if no registry exists (chosen: support both — if `client_id` was previously registered in this stateless design there is no registry to check, so we accept any `https` URI; but if we issue `client_id` we can optionally bind `redirect_uris` into a JWT envelope returned as part of `client_id` itself — rejected as over-engineering for v1; instead `GET /oauth/authorize` and `POST /oauth/token` enforce `redirect_uri` equality against the value bound in the authorization code JWT, which itself was validated at authorize time against the registration's `redirect_uris` if a prior register call's `client_id` is presented together with its `redirect_uris` echo — for true stateless mode without registry, the first `redirect_uri` seen is treated as the bound value).

### 4. Hono Router Layout and `WWW-Authenticate` 401 Handling

*Decision:* Add routes before the MCP catch-all in `src/index.ts`:
```
GET  /.well-known/oauth-authorization-server
GET  /.well-known/oauth-protected-resource
GET  /.well-known/openid-configuration
POST /oauth/register
GET  /oauth/authorize
POST /oauth/token
POST /oauth/revoke   (optional)
GET  /oauth/jwks      (optional stub, returns {} or HS256 notice)
```
Discovery handlers read `c.req.header("host")` or `new URL(c.req.url).origin` to reflect issuer dynamically, set `Content-Type: application/json; charset=utf-8`, `Cache-Control: public, max-age=3600` (discovery) vs `no-store` (oauth), and `Access-Control-*`. MCP handler `handleMcpRequest` is wrapped with an auth gate: first try OAuth access JWT path (`verifyOAuthAccessToken`), then legacy Reedrich JWT, then `rd_live_` hash lookup, then `401` with `WWW-Authenticate: Bearer resource_metadata="https://<host>/.well-known/oauth-protected-resource", error="invalid_token"` (or `insufficient_scope`). The 401 helper constructs `resource_metadata` from `new URL(c.req.url).origin + "/.well-known/oauth-protected-resource"`.

*Rationale:* Route ordering prevents `/mcp` from swallowing `/.well-known/*`. Dynamic origin reflection supports custom domains and `workers.dev` without config. `WWW-Authenticate` with `resource_metadata` is REQUIRED by RFC 9728 §5.3 for protected resource discovery; Perplexity and ChatGPT libraries look for this header to auto-discover.

*Alternatives Considered:*
- Single `/oauth/discovery` endpoint (rejected: not RFC compliant, clients hard-code `/.well-known/*` paths).
- Hard-coded issuer `https://reedrich-mcp.lutfidmz.workers.dev` (rejected: breaks custom domains, fails dynamic host test scenario).
- Returning `403` for expired tokens (rejected: RFC 6750 mandates `401 invalid_token` for expired bearer).

### 5. Module Split: `src/utils/oauth.ts` + `src/utils/pkce.ts` (or single `token.ts` extension)

*Decision:* Create `src/utils/oauth.ts` (or extend `token.ts`) exporting `generateAuthorizationCode`, `verifyAuthorizationCode`, `generateOAuthAccessToken`, `verifyOAuthAccessToken`, `generateRefreshToken`, `verifyRefreshToken`, `deriveClientCredentials`, `verifyClientCredentials`, plus constants `OAUTH_CODE_EXPIRY = 300`, `OAUTH_ACCESS_EXPIRY = 900`, `OAUTH_REFRESH_EXPIRY = 2592000`, `CLOCK_SKEW = 60`. Create `src/utils/pkce.ts` exporting `isValidVerifier`, `computeS256Challenge(verifier): Promise<string>`, `verifyS256Challenge(verifier, challenge): Promise<boolean>`. Keep `src/utils/token.ts`'s existing `verifyUserToken`/`generateUserToken` unchanged; add OAuth helpers there or in new file to avoid circular deps.

*Rationale:* Separation keeps PKCE pure functions testable in isolation (RFC 7636 test vectors). OAuth helpers mirror existing `token.ts` patterns (`sign`/`verify` via `hono/jwt`), making review easy. Workerd compatibility is isolated to Web Crypto calls.

*Alternatives Considered:*
- New `src/oauth/*` directory with per-endpoint files (rejected: over-modularization for a change with zero DB and ~300 LOC total; single file is easier to audit).
- Using `jose` library for JWT (rejected: `hono/jwt` already in deps, `jose` adds bundle size and requires `JWKS` handling).

### 6. Backward Compatibility Strategy (No **BREAKING**)

*Decision:* Auth helper on `/mcp` tries in order: (1) OAuth access JWT (HS256, `iss` = origin, `aud` = origin or `client_id`), (2) legacy Reedrich JWT (`ACCEPTED_TOKEN_ISSUERS`/`ACCEPTED_TOKEN_AUDIENCES`), (3) `rd_live_`/`fp_live_` hash lookup, (4) `X-API-Key`/`mcp-api-key`/`?apiKey=` fallbacks, then `401` with `WWW-Authenticate`. This is additive; existing clients see no change unless they are unauthenticated (previously they got JSON error inside MCP, now they get RFC 9728 401 — this is a behavioral refinement but not a breaking schema change; documented as such).

*Rationale:* Zero migration for Claude Code plugin, Cursor, OMP, Pi, OpenCode users. Perplexity/ChatGPT use new OAuth flow; others continue with `rd_live_`.

*Alternatives Considered:*
- Deprecating `rd_live_` immediately (rejected: breaks existing users).
- Requiring OAuth for all clients (rejected: adds friction for coding agents that already handle `REEDRICH_API_KEY`).

### 7. Merge with `chatgpt-compat` (REST, OpenAPI 3.0, Privacy)

*Decision:* No new `chatgpt-compat` spec delta is needed (no existing file to modify). If `chatgpt-compat` is introduced in parallel, OAuth discovery's `scopes_supported` and `resource` will be kept consistent with `openapi.json` `securitySchemes` via a shared constant `OAUTH_SCOPES = ["mcp"]` imported by both handlers. `GET /openapi.json` and `GET /privacy` remain at same paths; OAuth routes do not shadow them. If `chatgpt-compat` adds `POST /api/*` REST endpoints, they will reuse the same Bearer validation gate as `/mcp`.

*Rationale:* Prevents route collision and scope drift. Shared constant eliminates inconsistency risk.

## Risks / Trade-offs

- **[HMAC Secret Compromise]** -> `JWT_SECRET` is single point of failure for all stateless JWTs. Mitigation: Require `JWT_SECRET` to be ≥ 32 bytes random, document rotation procedure (dual-secret verify: try `JWT_SECRET` then `JWT_SECRET_PREVIOUS` for ≤ 900 s overlap), and warn that compromise requires immediate rotation and forces all clients to re-auth (bounded by 30-day refresh window).
- **[Clock Skew Between Edge and Client]** -> `iat`/`exp` checks with 60 s skew mitigate minor drift, but severely skewed clients may see premature expiry. Mitigation: Use `Date.now()/1000` server-side only, never trust client clock; document that clients SHOULD sync via NTP.
- **[Authorization Code Replay Within 5-Minute Window]** -> Stateless design has no single-use store; an intercepted code could be replayed until `exp`. Mitigation: PKCE S256 binds code to verifier holder (attacker without verifier cannot exchange), `redirect_uri` binding prevents redirection theft, short 300 s window bounds exposure, `jti` uniqueness allows optional in-memory LRU single-use cache per isolate (best-effort, not required for correctness).
- **[Refresh Token Theft (30-Day Window)]** -> Stolen refresh JWT is valid for 30 days with no revocation list. Mitigation: Short access window (900 s) limits blast radius, document that rotation issues new `jti`/`iat` (old token remains valid until expiry — stateless tradeoff), recommend clients store refresh tokens securely and use `POST /oauth/revoke` best-effort; future `jti` denylist via KV can be added without breaking stateless guarantee.
- **[Client ID Collision]** -> `crypto.randomUUID()` collision probability negligible (`≈ 0` for < 1e9 clients), but not zero. Mitigation: Use `crypto.randomUUID()` (122 bits entropy) + timestamp prefix; collision would only cause one client to fail at `/oauth/token` with `invalid_grant`, not data leak (since `sub` is bound in code JWT).
- **[Workers CPU Limit (50 ms)]** -> Two HMAC verifies + one SHA-256 per token exchange could approach limit under load. Mitigation: Each crypto op is < 1 ms on V8; total < 5 ms p99. No D1 queries on hot path. Benchmark in tests with 100 sequential verifications and assert < 50 ms aggregate.
- **[CORS Misconfiguration Blocking Perplexity/ChatGPT]** -> Missing `Access-Control-Allow-Origin: *` on discovery or 401 would block browser-based OAuth flows. Mitigation: Global `app.use('*', cors)` already sets `Access-Control-Allow-Origin: *` and `Allow-Headers` including `Authorization`; add explicit `Access-Control-Allow-Origin: *` on all `/.well-known/*` and `/oauth/*` handlers and test with `Origin` header scenarios.
- **[Route Shadowing]** -> Wildcard `app.all('/mcp')` or `app.all('/*')` could swallow `/.well-known/*`. Mitigation: Register `/.well-known/*` and `/oauth/*` routes before `app.all('/mcp')` and `app.all('/sse')`; add test asserting `GET /.well-known/oauth-authorization-server` returns 200 not 401.
- **[Scope Creep to OIDC]** -> Clients may probe `/.well-known/openid-configuration` expecting `id_token`. Mitigation: Alias returns RFC 8414 fields plus optional `jwks_uri` stub; document that OIDC is not supported and `response_types_supported: ["code"]` only.
- **[Zero-Storage Auditability]** -> No D1 writes means no audit trail of client registrations or code issuances. Mitigation: Log `console.info` for register/authorize/token events (without secrets) for Workers tail; no PII in logs.

## Migration Plan

1. **Code merge:** Add `src/utils/oauth.ts` / `src/utils/pkce.ts`, augment `src/index.ts` routes, extend `src/utils/token.ts` helpers. No `drizzle` migration, no `wrangler.toml` binding change (reuse `JWT_SECRET` + `DB`).
2. **Local verification:** `npm run typecheck` (zero errors), `npm test` with `MockD1Database` covering all new specs (discovery, DCR, PKCE, token exchange, 401), `npm run test:local` against `wrangler dev --local` with custom host header tests.
3. **Deploy:** `npm run deploy` (or `wrangler deploy --dry-run` first). Verify `GET /.well-known/oauth-authorization-server` and `GET /.well-known/oauth-protected-resource` via `curl` against `https://reedrich-mcp.lutfidmz.workers.dev`. Verify `POST /mcp` without auth returns `401` with `WWW-Authenticate: Bearer resource_metadata=...`.
4. **Perplexity/ChatGPT validation:** Register via `POST /oauth/register`, complete PKCE authorize + token exchange using RFC 7636 vector, call `POST /mcp` with `Authorization: Bearer <access_token>` and assert `financial_summary` returns scoped data.
5. **Rollback:** Since change is additive and stateless, rollback is `wrangler rollback` or redeploy previous version; no D1 data to revert. Clients with newly issued OAuth tokens will get `401` after rollback until they fall back to `rd_live_` (document fallback).

## Open Questions

- None — all RFC choices (S256-only, 5/15/30 lifetimes, HMAC-derived client_secret, dynamic origin) are resolved above and reflected in specs. If `POST /oauth/revoke` is deferred to a follow-up, specs already mark it optional and tasks gate it as stretch.

```mermaid
flowchart TD
    A[Perplexity / ChatGPT / Coding Agent] --> B[GET /.well-known/oauth-authorization-server\nRFC 8414]
    A --> C[GET /.well-known/oauth-protected-resource\nRFC 9728]
    B --> D[POST /oauth/register\nRFC 7591\nstateless client_id + client_secret]
    D --> E[GET /oauth/authorize\n?code_challenge S256\n+ user auth]
    E --> F[302 redirect\ncode=JWT{5min,\nchallenge, sub, jti}]
    F --> G[POST /oauth/token\ngrant_type=authorization_code\n+ code_verifier]
    G --> H{PKCE S256\nBASE64URL SHA256 verifier\n== challenge ?}
    H -- no --> I[400 invalid_grant]
    H -- yes --> J[200 access_token JWT 15min\n+ refresh_token JWT 30d\nHS256 stateless]
    J --> K[POST /mcp\nAuthorization: Bearer access_token]
    K --> L{Verify HMAC\n+ exp + iss/aud}
    L -- invalid/expired --> M[401 WWW-Authenticate\nresource_metadata=...]
    L -- valid --> N[MCP Transport\nRLS sub=userId\ntools/resources]
    J --> O[POST /oauth/token\ngrant_type=refresh_token]
    O --> P[200 rotated access+refresh\nnew jti/iat]
    Q[Legacy Client\nrd_live_ / old JWT] --> K
    C -.-> M
    B -.-> D
```

