## Context

See `proposal.md` for problem motivation and background.

Currently in `src/index.ts`, `GET /oauth/authorize` checks whether the user is authenticated via Bearer token or session. If unauthenticated, it renders an interactive HTML consent page (`renderConsentHtml`) containing a button linked to `/oauth/google/start?...`. 

This design specifies how `GET /oauth/authorize` handles an incoming `provider=google` (or `idp=google`) parameter to bypass the intermediate HTML page and issue an immediate 302 redirect directly to Google's OAuth 2.0 authorization endpoint.

## Goals / Non-Goals

**Goals:**
- Inspect `provider` and `idp` query parameters in `GET /oauth/authorize`.
- For unauthenticated requests with `provider=google` or `idp=google`, generate the signed Google OAuth state JWT (`generateGoogleOAuthState`) and return an immediate HTTP 302 redirect to `https://accounts.google.com/o/oauth2/v2/auth`.
- If an unsupported provider is passed (e.g. `provider=github`), return HTTP 400 with `error: "invalid_request"`.
- If no provider parameter is passed, continue rendering the HTML consent interface.
- Maintain identical PKCE S256 parameters and security bindings.

**Non-Goals:**
- Implementing identity providers other than Google.
- Modifying `/oauth/google/callback` or `/oauth/token`.

## Decisions

### 1. Parameter Naming: Primary `provider=google` with `idp=google` Alias
**Rationale:** `provider=google` matches modern developer conventions (Supabase, Auth0, Firebase). `idp=google` matches enterprise OpenID Connect Identity Provider hints. Normalizing with `.toLowerCase()` prevents casing issues.

### 2. Execution Point inside `GET /oauth/authorize`
**Placement:** In `src/index.ts`, inside `app.get('/oauth/authorize')`, immediately after `userId` check fails (`if (!userId)`):
```typescript
const rawProvider = c.req.query('provider') || c.req.query('idp');
if (rawProvider) {
  const provider = rawProvider.trim().toLowerCase();
  if (provider === 'google') {
    if (!codeChallenge) {
      c.header('Cache-Control', 'no-store');
      c.header('Pragma', 'no-cache');
      return c.json({ error: 'invalid_request', error_description: 'code_challenge is required' }, 400);
    }
    const signedState = await generateGoogleOAuthState(
      {
        client_id: clientId,
        redirect_uri: redirectUri,
        state: state || '',
        code_challenge: codeChallenge,
        code_challenge_method: codeChallengeMethod || 'S256',
        scope,
      },
      secret,
      origin
    );
    const googleClientId = c.env?.GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID;
    const googleCallbackUrl = `${origin}/oauth/google/callback`;
    const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    googleAuthUrl.searchParams.set('client_id', googleClientId);
    googleAuthUrl.searchParams.set('redirect_uri', googleCallbackUrl);
    googleAuthUrl.searchParams.set('response_type', 'code');
    googleAuthUrl.searchParams.set('scope', 'openid email profile');
    googleAuthUrl.searchParams.set('state', signedState);
    googleAuthUrl.searchParams.set('prompt', 'select_account');

    return new Response(null, {
      status: 302,
      headers: {
        Location: googleAuthUrl.toString(),
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
      },
    });
  }
  return c.json({ error: 'invalid_request', error_description: `Unsupported identity provider '${rawProvider}'. Supported providers: google` }, 400);
}
```

### 3. Preservation of Security & Multi-Tenancy Invariants
**Rationale:**
- `redirect_uri` validation occurs before the provider check, preventing open redirect attacks.
- Downstream `code_challenge` and `state` are encapsulated in the tamper-proof HMAC-SHA256 JWT state token signed with `JWT_SECRET`.
- Zero database queries are performed on this redirect path.

## Risks / Trade-offs

- **[Risk] Unsupported provider query string causing confusion** ➔ *Mitigation:* Explicitly return a clear HTTP 400 with `error: "invalid_request"` stating supported providers (`google`).
- **[Risk] State tampering** ➔ *Mitigation:* Google state token is signed via HS256 (`JWT_SECRET`) with 10-minute expiry; flipping any character causes verification failure at callback.
