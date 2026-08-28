import { Hono, type Context } from 'hono';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from './db/schema';
import { createMCPServer } from './mcp';
import { verifyUserToken, hashApiKey } from './utils/token';
import { isValidVerifier, computeS256Challenge, verifyS256Challenge } from './utils/pkce';
import {
  OAUTH_SCOPES,
  generateAuthorizationCode,
  verifyAuthorizationCode,
  generateOAuthAccessToken,
  verifyOAuthAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  deriveClientId,
  deriveClientSecret,
  verifyClientSecret,
  buildIssuerOrigin,
} from './utils/oauth';

type Bindings = {
  DB: D1Database;
  JWT_SECRET: string;
  GITHUB_TOKEN?: string;
  GITHUB_REPO?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// Global Security & CORS Headers
app.use('*', async (c, next) => {
  const path = new URL(c.req.url).pathname;
  c.header('Access-Control-Allow-Origin', '*');
  if (path.startsWith('/.well-known/')) {
    c.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  } else {
    c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, mcp-api-key, mcp-session-id, MCP-Protocol-Version');
  }
  c.header('Access-Control-Max-Age', '86400');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');

  if (c.req.method === 'OPTIONS') {
    // Use c.body to preserve headers set via c.header
    return c.body(null, 204);
  }
  await next();
});

// Centralized Unhandled Error Handler (Sanitizes stack trace leaks)
app.onError((err, c) => {
  console.error('Unhandled Application Error:', err);
  return c.json({ error: 'Internal Server Error', message: err.message }, 500);
});

// Health check & Server info endpoint
app.get('/', (c) => {
  return c.json({
    name: 'reedrich-mcp',
    status: 'ok',
    auth: 'dual-auth-api-key-and-jwt',
    description: 'Stateless MCP Server for Reedrich — Mathematical Intelligence & Financial Planning on Cloudflare Workers (D1)',
    authMethods: [
      'Authorization: Bearer <rd_live_apiKey | fp_live_apiKey>',
      'Authorization: Bearer <jwt_token>',
      'X-API-Key: <rd_live_apiKey | fp_live_apiKey>',
      'In-tool apiKey argument',
    ],
    authTools: {
      register: 'register_user',
      login: 'login_user',
    },
    endpoints: {
      mcp: '/mcp',
      sse: '/sse',
    },
  });
});

app.get('/health', (c) => c.text('OK'));

// OpenAPI 3.0 specification for ChatGPT Actions compatibility
function generateOpenApiSpec(origin: string): Record<string, unknown> {
  return {
    openapi: "3.0.0",
    info: {
      title: "Reedrich Financial Intelligence API",
      version: "1.0.0",
      description: "Mathematical Intelligence & Personal Financial Planning Engine for AI Assistants and Custom GPT Actions.",
      contact: { name: "Reedrich Support", url: "https://github.com/lutfi-zain/reedrich-mcp" },
    },
    servers: [{ url: origin, description: "Cloudflare Workers Edge Server" }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Enter your 15-minute JWT session token or persistent API key (rd_live_...)",
        },
      },
      schemas: {
        ErrorResponse: { type: "object", properties: { error: { type: "string" }, message: { type: "string" } }, required: ["error"] },
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {
      "/api/v1/summary": {
        get: {
          summary: "Get Financial Summary & Net Worth",
          operationId: "getFinancialSummary",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "Financial summary" }, "401": { description: "Unauthorized" } },
        },
      },
    },
    "x-oauth": { scopes_supported: [...OAUTH_SCOPES] },
  };
}

app.get('/openapi.json', (c) => {
  const origin = new URL(c.req.url).origin;
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Cache-Control', 'public, max-age=3600');
  return c.json(generateOpenApiSpec(origin));
});

app.get('/privacy', (c) => {
  c.header('Content-Type', 'text/html; charset=utf-8');
  c.header('Access-Control-Allow-Origin', '*');
  return c.html(`<!DOCTYPE html>
<html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Kebijakan Privasi — Reedrich</title><style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0d1117;color:#c9d1d9;line-height:1.6;margin:0;padding:40px 20px}.container{max-width:800px;margin:0 auto;background:#161b22;border:1px solid #30363d;border-radius:12px;padding:40px}</style></head><body><div class="container"><h1>Kebijakan Privasi Reedrich</h1><p><em>Terakhir diperbarui: 23 Agustus 2026</em></p><p>Selamat datang di <strong>Reedrich</strong> — Mathematical Intelligence &amp; Financial Planning Engine. Kami menghormati dan berkomitmen untuk melindungi privasi data keuangan Anda.</p><h2>1. Data yang Kami Kumpulkan</h2><ul><li>Informasi Akun: Nama, email, WhatsApp</li><li>Hash SHA-256 dari API Key (plaintext tidak disimpan)</li><li>Data Finansial: dompet, transaksi, anggaran, hutang/piutang</li></ul><h2>2. Penggunaan Data</h2><p>Data digunakan secara eksklusif untuk layanan perencanaan keuangan.</p><h2>3. Keamanan</h2><p>Semua token ditandatangani HMAC-SHA256, stateless, tanpa penyimpanan OAuth di D1.</p><p><a href="/">Kembali ke Reedrich MCP</a></p></div></body></html>`);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isValidRedirectUri(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.protocol === 'https:') return true;
    if (u.protocol === 'http:') {
      const host = u.hostname;
      if (host === 'localhost' || host === '127.0.0.1') return true;
    }
    return false;
  } catch {
    return false;
  }
}

function parseBasicAuth(header: string | undefined | null): { clientId: string; clientSecret: string } | null {
  if (!header || !header.startsWith('Basic ')) return null;
  try {
    const b64 = header.slice(6).trim();
    const decoded = atob(b64);
    const idx = decoded.indexOf(':');
    if (idx === -1) return null;
    return { clientId: decoded.slice(0, idx), clientSecret: decoded.slice(idx + 1) };
  } catch {
    return null;
  }
}

function getAuthorizationServerMetadata(origin: string): Record<string, unknown> {
  return {
    issuer: origin,
    authorization_endpoint: origin + '/oauth/authorize',
    token_endpoint: origin + '/oauth/token',
    registration_endpoint: origin + '/oauth/register',
    scopes_supported: [...OAUTH_SCOPES],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_basic', 'client_secret_post'],
    revocation_endpoint: origin + '/oauth/revoke',
  };
}

function getProtectedResourceMetadata(origin: string): Record<string, unknown> {
  return {
    resource: origin + '/mcp',
    authorization_servers: [origin],
    scopes_supported: [...OAUTH_SCOPES],
    bearer_methods_supported: ['header'],
    resource_name: 'Reedrich MCP',
  };
}

// Auth helper: Resolves User ID from Bearer API Key (rd_live_... / fp_live_...), Bearer JWT, X-API-Key, or query params
// Now also supports stateless OAuth access tokens (15m HS256 JWT)
async function extractAuthenticatedUserId(
  c: Context<{ Bindings: Bindings }>,
  db: DrizzleD1Database<typeof schema>
): Promise<string | null> {
  let candidate: string | null = null;

  // 1. Check Authorization Header (Bearer <key_or_jwt>)
  const authHeader = c.req.header('Authorization');
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match) {
      candidate = match[1].trim();
    }
  }

  // 2. Check X-API-Key or mcp-api-key headers
  if (!candidate) {
    candidate = c.req.header('X-API-Key') || c.req.header('x-api-key') || c.req.header('mcp-api-key') || null;
    if (candidate) candidate = candidate.trim();
  }

  // 3. Check Query Parameter (?apiKey=... or ?token=...)
  if (!candidate) {
    candidate = c.req.query('apiKey') || c.req.query('token') || null;
    if (candidate) candidate = candidate.trim();
  }

  if (!candidate) return null;

  // Case A: Persistent API Key (starts with rd_live_, fp_live_, or matches API key pattern)
  if (candidate.startsWith('rd_live_') || candidate.startsWith('fp_live_')) {
    try {
      const keyHash = await hashApiKey(candidate);
      const user = await db.select({ userId: schema.users.userId }).from(schema.users).where(eq(schema.users.userApiKeyHash, keyHash)).get();
      return user ? user.userId : null;
    } catch {
      return null;
    }
  }

  // Case B: Self-Contained JWT Token — try OAuth access token first, then legacy Reedrich JWT
  const secret = c.env?.JWT_SECRET;
  if (!secret) {
    console.error('Configuration Error: JWT_SECRET binding is missing');
    return null;
  }

  // Try OAuth access token (stateless, no D1)
  try {
    const oauth = await verifyOAuthAccessToken(candidate, secret);
    if (oauth) return oauth.sub;
  } catch {
    // ignore
  }

  const user = await verifyUserToken(candidate, secret);
  if (user) return user.userId;

  // Case C: Fallback check if a raw non-prefixed key was provided
  try {
    const keyHash = await hashApiKey(candidate);
    const usr = await db.select({ userId: schema.users.userId }).from(schema.users).where(eq(schema.users.userApiKeyHash, keyHash)).get();
    return usr ? usr.userId : null;
  } catch {
    return null;
  }
}

// In-memory registry for stateless DCR redirect_uri validation (zero D1, per-isolate)
// Stores client_id -> redirect_uris to enable strict redirect_uri matching in authorize step
const registeredClients = new Map<string, string[]>();
function isPublicMcpBody(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const obj = body as Record<string, unknown>;
  // JSON-RPC single
  if (obj.method === 'tools/call' && obj.params && typeof obj.params === 'object') {
    const params = obj.params as Record<string, unknown>;
    if (params.name === 'register_user' || params.name === 'login_user') return true;
    const args = params.arguments as Record<string, unknown> | undefined;
    if (args && (typeof args.apiKey === 'string' || typeof args.token === 'string')) {
      // Has in-tool apiKey fallback — allow to reach MCP handler for tool-level auth
      // But we still want to gate other tools that use apiKey fallback? For backward compat, allow if apiKey present
      // Check if tool is not strictly public but has apiKey — we allow through to preserve in-tool auth
      // However for spec's 401, we want to block unauthenticated tools/list, not those with apiKey
      // So we allow if apiKey present in args
      return true;
    }
  }
  // Batch array case not needed
  return false;
}

// ---------------------------------------------------------------------------
// Discovery Endpoints (RFC 8414, RFC 9728, OpenID alias) — public, no auth
// ---------------------------------------------------------------------------

app.get('/.well-known/oauth-authorization-server', (c) => {
  const origin = buildIssuerOrigin(c);
  const meta = getAuthorizationServerMetadata(origin);
  c.header('Content-Type', 'application/json; charset=utf-8');
  c.header('Cache-Control', 'public, max-age=3600');
  c.header('Access-Control-Allow-Origin', '*');
  return c.json(meta);
});

app.get('/.well-known/oauth-protected-resource', (c) => {
  const origin = buildIssuerOrigin(c);
  const meta = getProtectedResourceMetadata(origin);
  c.header('Content-Type', 'application/json; charset=utf-8');
  c.header('Cache-Control', 'public, max-age=3600');
  c.header('Access-Control-Allow-Origin', '*');
  return c.json(meta);
});

app.get('/.well-known/openid-configuration', (c) => {
  const origin = buildIssuerOrigin(c);
  const meta = getAuthorizationServerMetadata(origin);
  c.header('Content-Type', 'application/json; charset=utf-8');
  c.header('Cache-Control', 'public, max-age=3600');
  c.header('Access-Control-Allow-Origin', '*');
  return c.json(meta);
});

// Unknown well-known fallback — 404 JSON, not 401, not 500
app.get('/.well-known/*', (c) => {
  c.header('Content-Type', 'application/json; charset=utf-8');
  c.header('Cache-Control', 'no-store');
  return c.json({ error: 'not_found' }, 404);
});

// Method not allowed for discovery — POST etc. should be 405
app.on(['POST', 'PUT', 'DELETE', 'PATCH'], '/.well-known/*', (c) => {
  c.header('Allow', 'GET, OPTIONS');
  return c.json({ error: 'method_not_allowed' }, 405);
});

// ---------------------------------------------------------------------------
// Dynamic Client Registration — POST /oauth/register (RFC 7591, stateless)
// ---------------------------------------------------------------------------

app.post('/oauth/register', async (c) => {
  const secret = c.env?.JWT_SECRET;
  if (!secret) {
    return c.json({ error: 'server_error', error_description: 'JWT_SECRET missing' }, 500);
  }

  let body: Record<string, unknown>;
  try {
    const raw = await c.req.text();
    if (!raw || raw.trim() === '') {
      body = {};
    } else {
      body = JSON.parse(raw) as Record<string, unknown>;
    }
  } catch {
    c.header('Cache-Control', 'no-store');
    c.header('Pragma', 'no-cache');
    return c.json({ error: 'invalid_client_metadata', error_description: 'Malformed JSON body' }, 400);
  }

  // Extract fields with defaults
  const redirectUrisRaw = body.redirect_uris as unknown;
  const grantTypesRaw = body.grant_types as unknown;
  const responseTypesRaw = body.response_types as unknown;
  const tokenAuthMethodRaw = body.token_endpoint_auth_method as unknown;
  const scopeRaw = body.scope as unknown;
  const clientNameRaw = body.client_name as unknown;

  // Validate redirect_uris — REQUIRED, at least one, each https or loopback http
  if (!Array.isArray(redirectUrisRaw) || redirectUrisRaw.length === 0) {
    c.header('Cache-Control', 'no-store');
    c.header('Pragma', 'no-cache');
    return c.json({ error: 'invalid_redirect_uri', error_description: 'redirect_uris is required and must contain at least one URI' }, 400);
  }
  for (const uri of redirectUrisRaw) {
    if (typeof uri !== 'string' || !isValidRedirectUri(uri)) {
      c.header('Cache-Control', 'no-store');
      c.header('Pragma', 'no-cache');
      return c.json({ error: 'invalid_redirect_uri', error_description: 'Each redirect_uri must be absolute https URI or http://localhost/127.0.0.1 (got ' + String(uri) + ')' }, 400);
    }
  }
  const redirectUris = redirectUrisRaw as string[];

  // Validate grant_types subset of ["authorization_code","refresh_token"]
  const allowedGrants = ['authorization_code', 'refresh_token'];
  let grantTypes: string[];
  if (grantTypesRaw === undefined || grantTypesRaw === null) {
    grantTypes = ['authorization_code', 'refresh_token'];
  } else if (!Array.isArray(grantTypesRaw)) {
    c.header('Cache-Control', 'no-store');
    c.header('Pragma', 'no-cache');
    return c.json({ error: 'invalid_client_metadata', error_description: 'grant_types must be an array' }, 400);
  } else {
    for (const g of grantTypesRaw as unknown[]) {
      if (typeof g !== 'string' || !allowedGrants.includes(g)) {
        c.header('Cache-Control', 'no-store');
        c.header('Pragma', 'no-cache');
        return c.json({ error: 'invalid_grant_type', error_description: 'Unsupported grant_types, allowed: authorization_code, refresh_token' }, 400);
      }
    }
    grantTypes = grantTypesRaw as string[];
    if (grantTypes.length === 0) grantTypes = ['authorization_code', 'refresh_token'];
  }

  // Validate response_types subset of ["code"]
  const allowedResponses = ['code'];
  let responseTypes: string[];
  if (responseTypesRaw === undefined || responseTypesRaw === null) {
    responseTypes = ['code'];
  } else if (!Array.isArray(responseTypesRaw)) {
    c.header('Cache-Control', 'no-store');
    c.header('Pragma', 'no-cache');
    return c.json({ error: 'invalid_client_metadata', error_description: 'response_types must be an array' }, 400);
  } else {
    for (const r of responseTypesRaw as unknown[]) {
      if (typeof r !== 'string' || !allowedResponses.includes(r)) {
        c.header('Cache-Control', 'no-store');
        c.header('Pragma', 'no-cache');
        return c.json({ error: 'invalid_response_type', error_description: 'Unsupported response_types, allowed: code' }, 400);
      }
    }
    responseTypes = responseTypesRaw as string[];
    if (responseTypes.length === 0) responseTypes = ['code'];
  }

  // Validate token_endpoint_auth_method
  const allowedAuthMethods = ['none', 'client_secret_basic', 'client_secret_post'];
  let tokenEndpointAuthMethod: string;
  if (tokenAuthMethodRaw === undefined || tokenAuthMethodRaw === null) {
    tokenEndpointAuthMethod = 'none';
  } else if (typeof tokenAuthMethodRaw !== 'string' || !allowedAuthMethods.includes(tokenAuthMethodRaw)) {
    c.header('Cache-Control', 'no-store');
    c.header('Pragma', 'no-cache');
    return c.json({ error: 'invalid_client_metadata', error_description: 'token_endpoint_auth_method must be one of none, client_secret_basic, client_secret_post' }, 400);
  } else {
    tokenEndpointAuthMethod = tokenAuthMethodRaw;
  }

  // Validate scope — defaults to mcp, if provided ensure it's space-separated subset of OAUTH_SCOPES
  let scope: string;
  if (scopeRaw === undefined || scopeRaw === null) {
    scope = 'mcp';
  } else if (typeof scopeRaw !== 'string' || scopeRaw.trim() === '') {
    scope = 'mcp';
  } else {
    scope = scopeRaw.trim();
    const parts = scope.split(/\s+/);
    for (const p of parts) {
      // Allow only mcp for now; if other scopes, treat as invalid
      if (! (OAUTH_SCOPES as readonly string[]).includes(p)) {
        // For leniency, keep as is if contains mcp? But spec says reject invalid scope at authorize, not register
        // We'll allow but not error; keep scope as provided
      }
    }
  }

  const clientId = deriveClientId();
  const clientIdIssuedAt = Math.floor(Date.now() / 1000);
  // Store for authorize strict redirect_uri matching (zero D1, per-isolate memory)
  registeredClients.set(clientId, redirectUris);
  const response: Record<string, unknown> = {
    client_id: clientId,
    client_id_issued_at: clientIdIssuedAt,
    redirect_uris: redirectUris,
    grant_types: grantTypes,
    response_types: responseTypes,
    scope,
    token_endpoint_auth_method: tokenEndpointAuthMethod,
  };
  if (typeof clientNameRaw === 'string' && clientNameRaw.trim() !== '') {
    response.client_name = clientNameRaw;
  }

  if (tokenEndpointAuthMethod === 'client_secret_basic' || tokenEndpointAuthMethod === 'client_secret_post') {
    const clientSecret = await deriveClientSecret(clientId, secret);
    response.client_secret = clientSecret;
    response.client_secret_expires_at = 0;
  }

  c.header('Cache-Control', 'no-store');
  c.header('Pragma', 'no-cache');
  c.header('Content-Type', 'application/json; charset=utf-8');
  return c.json(response, 201);
});

// ---------------------------------------------------------------------------
// Authorization Endpoint — GET /oauth/authorize (PKCE S256, 5m JWT code)
// ---------------------------------------------------------------------------

app.get('/oauth/authorize', async (c) => {
  const secret = c.env?.JWT_SECRET;
  if (!secret) {
    return c.json({ error: 'server_error', error_description: 'JWT_SECRET missing' }, 500);
  }

  const responseType = c.req.query('response_type');
  const clientId = c.req.query('client_id');
  const redirectUri = c.req.query('redirect_uri');
  const scopeRaw = c.req.query('scope');
  const state = c.req.query('state');
  const codeChallenge = c.req.query('code_challenge');
  const codeChallengeMethod = c.req.query('code_challenge_method');

  const origin = buildIssuerOrigin(c);
  const noStoreHeaders = { 'Cache-Control': 'no-store', Pragma: 'no-cache' } as const;

  // Helper to build error redirect when redirect_uri is valid, else JSON 400
  const errorRedirectOrJson = (error: string, description: string, httpStatus: number = 302): Response | null => {
    if (redirectUri && isValidRedirectUri(redirectUri)) {
      const url = new URL(redirectUri);
      url.searchParams.set('error', error);
      url.searchParams.set('error_description', description);
      if (state) url.searchParams.set('state', state);
      const headers: Record<string, string> = { Location: url.toString(), 'Cache-Control': 'no-store', Pragma: 'no-cache' };
      return new Response(null, { status: 302, headers });
    }
    // Return null to indicate caller should do JSON 400
    return null;
  };

  // Validate response_type
  if (responseType !== 'code') {
    const redirect = errorRedirectOrJson('unsupported_response_type', 'response_type must be code');
    if (redirect) return redirect;
    c.header('Cache-Control', 'no-store');
    c.header('Pragma', 'no-cache');
    if (responseType === 'token') {
      return c.json({ error: 'unsupported_response_type', error_description: 'response_type must be code, token is not supported' }, 400);
    }
    return c.json({ error: 'unsupported_response_type', error_description: 'response_type must be code' }, 400);
  }

  // Validate client_id
  if (!clientId || typeof clientId !== 'string' || clientId.trim() === '') {
    c.header('Cache-Control', 'no-store');
    c.header('Pragma', 'no-cache');
    return c.json({ error: 'invalid_request', error_description: 'client_id is required' }, 400);
  }

  // Validate redirect_uri
  if (!redirectUri || typeof redirectUri !== 'string' || !isValidRedirectUri(redirectUri)) {
    c.header('Cache-Control', 'no-store');
    c.header('Pragma', 'no-cache');
    return c.json({ error: 'invalid_request', error_description: 'redirect_uri is required and must be absolute https or http://localhost/127.0.0.1' }, 400);
  }

  // Strict redirect_uri matching against registered client (if known) — return 400 not redirect to attacker
  if (registeredClients.has(clientId)) {
    const allowed = registeredClients.get(clientId) as string[];
    if (!allowed.includes(redirectUri)) {
      c.header('Cache-Control', 'no-store');
      c.header('Pragma', 'no-cache');
      return c.json({ error: 'invalid_request', error_description: 'redirect_uri is not registered for this client' }, 400);
    }
  }

  // Validate scope
  const scope = scopeRaw && scopeRaw.trim() !== '' ? scopeRaw.trim() : 'mcp';
  const scopeParts = scope.split(/\s+/);
  for (const p of scopeParts) {
    if (! (OAUTH_SCOPES as readonly string[]).includes(p)) {
      const redirect = errorRedirectOrJson('invalid_scope', 'Requested scope is not supported: ' + p);
      if (redirect) return redirect;
      c.header('Cache-Control', 'no-store');
      c.header('Pragma', 'no-cache');
      return c.json({ error: 'invalid_scope', error_description: 'Requested scope is not supported: ' + p }, 400);
    }
  }

  // Validate code_challenge presence
  if (!codeChallenge || typeof codeChallenge !== 'string' || codeChallenge.trim() === '') {
    const redirect = errorRedirectOrJson('invalid_request', 'code_challenge is required');
    if (redirect) return redirect;
    c.header('Cache-Control', 'no-store');
    c.header('Pragma', 'no-cache');
    return c.json({ error: 'invalid_request', error_description: 'code_challenge is required' }, 400);
  }

  // Validate code_challenge_method == S256
  if (codeChallengeMethod !== 'S256') {
    const methodDesc = codeChallengeMethod === 'plain' ? 'plain is not supported, use S256' : 'code_challenge_method must be S256';
    const redirect = errorRedirectOrJson('invalid_request', methodDesc);
    if (redirect) return redirect;
    c.header('Cache-Control', 'no-store');
    c.header('Pragma', 'no-cache');
    return c.json({ error: 'invalid_request', error_description: methodDesc }, 400);
  }

  // Authenticate resource owner via existing Reedrich auth (Bearer rd_live_/JWT or ?token=)
  if (!c.env?.DB) {
    return c.json({ error: 'server_error', error_description: 'DB missing' }, 500);
  }
  const db = drizzle(c.env.DB, { schema });
  const userId = await extractAuthenticatedUserId(c, db);
  if (!userId) {
    c.header('Cache-Control', 'no-store');
    c.header('Pragma', 'no-cache');
    // Return 401 login_required (not redirect to avoid open redirect)
    return c.json({ error: 'login_required', error_description: 'User authentication required. Provide Authorization: Bearer <rd_live_... or JWT> or ?token=' }, 401);
  }

  // Issue authorization code JWT (5m, bind challenge)
  const code = await generateAuthorizationCode(
    {
      sub: userId,
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    },
    secret,
    origin
  );

  // 302 redirect to redirect_uri?code=...&state=...
  const redirectUrl = new URL(redirectUri);
  redirectUrl.searchParams.set('code', code);
  if (state) redirectUrl.searchParams.set('state', state);

  const headers: Record<string, string> = {
    Location: redirectUrl.toString(),
    'Cache-Control': 'no-store',
    Pragma: 'no-cache',
  };
  return new Response(null, { status: 302, headers });
});

// Also support POST /oauth/authorize for form-based flows (same logic, reading body)
app.post('/oauth/authorize', async (c) => {
  // For POST, accept x-www-form-urlencoded or json; delegate to GET logic by merging query + body
  // Try to parse body to extract same params if not in query
  let bodyParams: Record<string, string> = {};
  const ct = c.req.header('content-type') || '';
  try {
    if (ct.includes('application/json')) {
      const json = (await c.req.json()) as Record<string, unknown>;
      for (const [k, v] of Object.entries(json)) if (typeof v === 'string') bodyParams[k] = v;
    } else if (ct.includes('application/x-www-form-urlencoded')) {
      const form = await c.req.parseBody();
      for (const [k, v] of Object.entries(form)) if (typeof v === 'string') bodyParams[k] = v;
    } else {
      // Try json leniently
      try {
        const txt = await c.req.text();
        if (txt) {
          const j = JSON.parse(txt) as Record<string, unknown>;
          for (const [k, v] of Object.entries(j)) if (typeof v === 'string') bodyParams[k] = v;
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }

  // Merge query + body (query takes precedence? Body overrides)
  const getParam = (key: string): string | undefined => {
    const q = c.req.query(key);
    if (q !== undefined) return q;
    return bodyParams[key];
  };

  // Reuse GET logic by constructing a surrogate c with query?
  // Instead, duplicate validation quickly by forwarding to GET handler via manual call
  // Simpler: set query via URL manipulation? We'll just run same logic inline
  const secret = c.env?.JWT_SECRET;
  if (!secret) {
    return c.json({ error: 'server_error', error_description: 'JWT_SECRET missing' }, 500);
  }
  const responseType = getParam('response_type');
  const clientId = getParam('client_id');
  const redirectUri = getParam('redirect_uri');
  const scopeRaw = getParam('scope');
  const state = getParam('state');
  const codeChallenge = getParam('code_challenge');
  const codeChallengeMethod = getParam('code_challenge_method');
  const origin = buildIssuerOrigin(c);

  const errorRedirectOrJson = (error: string, description: string): Response | null => {
    if (redirectUri && isValidRedirectUri(redirectUri)) {
      const url = new URL(redirectUri);
      url.searchParams.set('error', error);
      url.searchParams.set('error_description', description);
      if (state) url.searchParams.set('state', state);
      return new Response(null, { status: 302, headers: { Location: url.toString(), 'Cache-Control': 'no-store', Pragma: 'no-cache' } });
    }
    return null;
  };

  if (responseType !== 'code') {
    const redirect = errorRedirectOrJson('unsupported_response_type', 'response_type must be code');
    if (redirect) return redirect;
    c.header('Cache-Control', 'no-store');
    c.header('Pragma', 'no-cache');
    return c.json({ error: 'unsupported_response_type', error_description: 'response_type must be code' }, 400);
  }
  if (!clientId || clientId.trim() === '') {
    c.header('Cache-Control', 'no-store');
    c.header('Pragma', 'no-cache');
    return c.json({ error: 'invalid_request', error_description: 'client_id is required' }, 400);
  }
  if (!redirectUri || !isValidRedirectUri(redirectUri)) {
    c.header('Cache-Control', 'no-store');
    c.header('Pragma', 'no-cache');
    return c.json({ error: 'invalid_request', error_description: 'redirect_uri is required and must be absolute https or http://localhost/127.0.0.1' }, 400);
  }
  if (registeredClients.has(clientId)) {
    const allowed = registeredClients.get(clientId) as string[];
    if (!allowed.includes(redirectUri)) {
      c.header('Cache-Control', 'no-store');
      c.header('Pragma', 'no-cache');
      return c.json({ error: 'invalid_request', error_description: 'redirect_uri is not registered for this client' }, 400);
    }
  }
  const scope = scopeRaw && scopeRaw.trim() !== '' ? scopeRaw.trim() : 'mcp';
  const scopeParts = scope.split(/\s+/);
  for (const p of scopeParts) {
    if (!(OAUTH_SCOPES as readonly string[]).includes(p)) {
      const redirect = errorRedirectOrJson('invalid_scope', 'Requested scope is not supported: ' + p);
      if (redirect) return redirect;
      c.header('Cache-Control', 'no-store');
      c.header('Pragma', 'no-cache');
      return c.json({ error: 'invalid_scope', error_description: 'Requested scope is not supported: ' + p }, 400);
    }
  }
  if (!codeChallenge || codeChallenge.trim() === '') {
    const redirect = errorRedirectOrJson('invalid_request', 'code_challenge is required');
    if (redirect) return redirect;
    c.header('Cache-Control', 'no-store');
    c.header('Pragma', 'no-cache');
    return c.json({ error: 'invalid_request', error_description: 'code_challenge is required' }, 400);
  }
  if (codeChallengeMethod !== 'S256') {
    const desc = codeChallengeMethod === 'plain' ? 'plain is not supported, use S256' : 'code_challenge_method must be S256';
    const redirect = errorRedirectOrJson('invalid_request', desc);
    if (redirect) return redirect;
    c.header('Cache-Control', 'no-store');
    c.header('Pragma', 'no-cache');
    return c.json({ error: 'invalid_request', error_description: desc }, 400);
  }
  if (!c.env?.DB) return c.json({ error: 'server_error', error_description: 'DB missing' }, 500);
  const db = drizzle(c.env.DB, { schema });
  const userId = await extractAuthenticatedUserId(c, db);
  if (!userId) {
    c.header('Cache-Control', 'no-store');
    c.header('Pragma', 'no-cache');
    return c.json({ error: 'login_required', error_description: 'User authentication required' }, 401);
  }
  const code = await generateAuthorizationCode(
    { sub: userId, client_id: clientId, redirect_uri: redirectUri, scope, code_challenge: codeChallenge, code_challenge_method: 'S256' },
    secret,
    origin
  );
  const redirectUrl = new URL(redirectUri);
  redirectUrl.searchParams.set('code', code);
  if (state) redirectUrl.searchParams.set('state', state);
  return new Response(null, { status: 302, headers: { Location: redirectUrl.toString(), 'Cache-Control': 'no-store', Pragma: 'no-cache' } });
});

// ---------------------------------------------------------------------------
// Token Endpoint — POST /oauth/token (authorization_code & refresh_token)
// ---------------------------------------------------------------------------

app.post('/oauth/token', async (c) => {
  const secret = c.env?.JWT_SECRET;
  if (!secret) {
    return c.json({ error: 'server_error', error_description: 'JWT_SECRET missing' }, 500);
  }
  const origin = buildIssuerOrigin(c);

  // Parse body leniently (form or json)
  let body: Record<string, string> = {};
  const ct = c.req.header('content-type') || '';
  try {
    if (ct.includes('application/json')) {
      const json = (await c.req.json()) as Record<string, unknown>;
      for (const [k, v] of Object.entries(json)) {
        if (typeof v === 'string') body[k] = v;
        else if (typeof v === 'number') body[k] = String(v);
        else if (v !== null && v !== undefined) body[k] = String(v);
      }
    } else if (ct.includes('application/x-www-form-urlencoded')) {
      const form = await c.req.parseBody();
      for (const [k, v] of Object.entries(form)) {
        if (typeof v === 'string') body[k] = v;
        else if (v instanceof File) body[k] = await v.text();
        else body[k] = String(v);
      }
    } else {
      // Lenient: try json first, then form
      const text = await c.req.text();
      if (text) {
        try {
          const j = JSON.parse(text) as Record<string, unknown>;
          for (const [k, v] of Object.entries(j)) {
            if (typeof v === 'string') body[k] = v;
            else if (typeof v === 'number') body[k] = String(v);
            else if (v !== null && v !== undefined) body[k] = String(v);
          }
        } catch {
          const params = new URLSearchParams(text);
          for (const [k, v] of params.entries()) body[k] = v;
        }
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // If JSON parsing failed and content-type was json, return invalid_request
    if (ct.includes('application/json')) {
      c.header('Cache-Control', 'no-store');
      c.header('Pragma', 'no-cache');
      return c.json({ error: 'invalid_request', error_description: 'Malformed JSON: ' + msg }, 400);
    }
    // else ignore
  }

  // Also merge query params if any (some clients send grant_type in query)
  const qGrant = c.req.query('grant_type');
  if (qGrant && !body.grant_type) body.grant_type = qGrant;
  const qCode = c.req.query('code');
  if (qCode && !body.code) body.code = qCode;

  const grantType = body.grant_type;

  // Client authentication: Check Basic auth and body client_secret
  const basic = parseBasicAuth(c.req.header('Authorization'));
  let clientIdFromAuth: string | undefined = undefined;
  let clientSecretFromAuth: string | undefined = undefined;
  if (basic) {
    clientIdFromAuth = basic.clientId;
    clientSecretFromAuth = basic.clientSecret;
  }
  const clientId = body.client_id || clientIdFromAuth;
  const clientSecret = body.client_secret || clientSecretFromAuth;

  // Helper to return error with no-store
  const errJson = (status: number, error: string, description: string, extraHeaders?: Record<string, string>) => {
    c.header('Cache-Control', 'no-store');
    c.header('Pragma', 'no-cache');
    if (extraHeaders) for (const [k, v] of Object.entries(extraHeaders)) c.header(k, v);
    return c.json({ error, error_description: description }, status as 200);
  };

  if (!grantType || typeof grantType !== 'string' || grantType.trim() === '') {
    return errJson(400, 'invalid_request', 'grant_type is required');
  }

  if (grantType !== 'authorization_code' && grantType !== 'refresh_token') {
    return errJson(400, 'unsupported_grant_type', 'grant_type must be authorization_code or refresh_token');
  }

  // Verify client_secret if presented via Basic or body
  // If clientSecret present, we must verify it statelessly; failure => 401 invalid_client
  if (clientSecret && clientId) {
    const ok = await verifyClientSecret(clientId, clientSecret, secret);
    if (!ok) {
      // For Basic auth, include WWW-Authenticate per spec
      const headers: Record<string, string> = {};
      if (basic) headers['WWW-Authenticate'] = 'Basic realm="oauth"';
      return errJson(401, 'invalid_client', 'Invalid client_secret', headers);
    }
  }

  if (grantType === 'authorization_code') {
    const code = body.code;
    const redirectUri = body.redirect_uri;
    const codeVerifier = body.code_verifier;

    if (!code || typeof code !== 'string' || code.trim() === '') {
      return errJson(400, 'invalid_request', 'code is required');
    }
    if (!redirectUri || typeof redirectUri !== 'string' || redirectUri.trim() === '') {
      return errJson(400, 'invalid_request', 'redirect_uri is required');
    }

    // Verify authorization code JWT
    const payload = await verifyAuthorizationCode(code.trim(), secret);
    if (!payload) {
      return errJson(400, 'invalid_grant', 'Authorization code is invalid or expired');
    }

    // Validate client_id matches code
    if (!clientId || clientId !== payload.client_id) {
      return errJson(400, 'invalid_grant', 'client_id mismatch');
    }

    // Validate redirect_uri matches code (string equality)
    if (redirectUri !== payload.redirect_uri) {
      return errJson(400, 'invalid_grant', 'redirect_uri mismatch');
    }

    // Validate code_verifier presence (required when S256)
    if (!codeVerifier || typeof codeVerifier !== 'string' || codeVerifier.trim() === '') {
      return errJson(400, 'invalid_request', 'code_verifier is required for S256');
    }

    // Validate verifier syntax
    if (!isValidVerifier(codeVerifier)) {
      return errJson(400, 'invalid_request', 'code_verifier must be 43..128 chars of A-Za-z0-9-._~');
    }

    // Verify S256 challenge constant-time
    const ok = await verifyS256Challenge(codeVerifier, payload.code_challenge);
    if (!ok) {
      return errJson(400, 'invalid_grant', 'PKCE verification failed: code_challenge mismatch');
    }

    // Issue tokens
    const accessToken = await generateOAuthAccessToken({ sub: payload.sub, client_id: payload.client_id, scope: payload.scope, origin }, secret);
    const refreshToken = await generateRefreshToken({ sub: payload.sub, client_id: payload.client_id, scope: payload.scope, origin }, secret);

    c.header('Cache-Control', 'no-store');
    c.header('Pragma', 'no-cache');
    return c.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 900,
      refresh_token: refreshToken,
      scope: payload.scope,
    });
  }

  // grant_type === refresh_token
  const refreshTokenRaw = body.refresh_token;
  if (!refreshTokenRaw || typeof refreshTokenRaw !== 'string' || refreshTokenRaw.trim() === '') {
    return errJson(400, 'invalid_request', 'refresh_token is required');
  }

  const refreshPayload = await verifyRefreshToken(refreshTokenRaw.trim(), secret);
  if (!refreshPayload) {
    // Also check if an access token was mistakenly presented as refresh
    const maybeAccess = await verifyOAuthAccessToken(refreshTokenRaw.trim(), secret);
    if (maybeAccess) {
      return errJson(400, 'invalid_grant', 'Access token cannot be used as refresh token');
    }
    return errJson(400, 'invalid_grant', 'Refresh token is invalid or expired');
  }

  // Validate client_id matches refresh token (if provided)
  if (clientId && clientId !== refreshPayload.client_id) {
    return errJson(400, 'invalid_grant', 'client_id mismatch for refresh token');
  }
  const effectiveClientId = refreshPayload.client_id;

  // If clientSecret was presented via Basic but clientId mismatch already handled, verify again with effectiveClientId
  if (clientSecretFromAuth && basic && basic.clientId !== effectiveClientId) {
    return errJson(400, 'invalid_grant', 'client_id mismatch');
  }

  // Validate scope narrowing
  let requestedScope: string | undefined = body.scope;
  let finalScope = refreshPayload.scope;
  if (requestedScope !== undefined && requestedScope !== null && typeof requestedScope === 'string' && requestedScope.trim() !== '') {
    requestedScope = requestedScope.trim();
    const originalParts = refreshPayload.scope.split(/\s+/).filter((s) => s.length > 0);
    const requestedParts = requestedScope.split(/\s+/).filter((s) => s.length > 0);
    for (const rp of requestedParts) {
      if (!originalParts.includes(rp)) {
        return errJson(400, 'invalid_scope', 'Requested scope exceeds original: ' + rp);
      }
    }
    finalScope = requestedParts.join(' ');
    if (finalScope === '') finalScope = refreshPayload.scope;
  }

  // Issue rotated tokens
  const newAccessToken = await generateOAuthAccessToken({ sub: refreshPayload.sub, client_id: effectiveClientId, scope: finalScope, origin }, secret);
  const newRefreshToken = await generateRefreshToken({ sub: refreshPayload.sub, client_id: effectiveClientId, scope: finalScope, origin }, secret);

  c.header('Cache-Control', 'no-store');
  c.header('Pragma', 'no-cache');
  return c.json({
    access_token: newAccessToken,
    token_type: 'Bearer',
    expires_in: 900,
    refresh_token: newRefreshToken,
    scope: finalScope,
  });
});

// ---------------------------------------------------------------------------
// Revocation Endpoint — POST /oauth/revoke (stateless best-effort)
// ---------------------------------------------------------------------------

app.post('/oauth/revoke', async (c) => {
  const secret = c.env?.JWT_SECRET;
  // Parse token param (form or json)
  let token: string | undefined;
  const ct = c.req.header('content-type') || '';
  try {
    if (ct.includes('application/json')) {
      const json = (await c.req.json()) as Record<string, unknown>;
      if (typeof json.token === 'string') token = json.token;
    } else if (ct.includes('application/x-www-form-urlencoded')) {
      const form = await c.req.parseBody();
      if (typeof form.token === 'string') token = form.token as string;
    } else {
      const text = await c.req.text();
      if (text) {
        try {
          const j = JSON.parse(text) as Record<string, unknown>;
          if (typeof j.token === 'string') token = j.token;
        } catch {
          const params = new URLSearchParams(text);
          const t = params.get('token');
          if (t) token = t;
        }
      }
    }
  } catch {
    // ignore
  }

  // Also check query param
  if (!token) token = c.req.query('token') || undefined;

  // If token looks JWT-like, verify signature best-effort (no revocation list)
  if (token && token.includes('.') && secret) {
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        // Try both verifications, but always succeed regardless
        await verifyOAuthAccessToken(token, secret);
        await verifyRefreshToken(token, secret);
      }
    } catch {
      // ignore
    }
  }

  c.header('Cache-Control', 'no-store');
  c.header('Pragma', 'no-cache');
  // Always 200 per RFC 7009
  return c.json({}, 200);
});

// ---------------------------------------------------------------------------
// Handler for MCP requests (Stateless Streamable HTTP & SSE) with 401 gate
// ---------------------------------------------------------------------------

async function handleMcpRequest(c: Context<{ Bindings: Bindings }>) {
  const secret = c.env?.JWT_SECRET;
  if (!secret) {
    return c.json({ error: 'Server Misconfiguration: JWT_SECRET environment variable is missing' }, 500);
  }
  if (!c.env?.DB) {
    return c.json({ error: 'Server Misconfiguration: Database (DB) binding is missing' }, 500);
  }

  // Friendly tip for plain GET without SSE Accept header — public, no auth required
  const rawAccept = c.req.header('accept') || '';
  if (c.req.method === 'GET' && !rawAccept.includes('text/event-stream') && !rawAccept.includes('*/*')) {
    return c.json({
      name: 'reedrich-mcp',
      status: 'ok',
      transport: 'streamable-http',
      endpoint: c.req.url,
      tip: 'Connect via an MCP client with Streamable HTTP or SSE transport.',
    });
  }

  // For POST, parse body early to detect public tools (register_user / login_user)
  let parsedBody: unknown = undefined;
  let earlyBodyText: string | undefined = undefined;
  if (c.req.method === 'POST') {
    try {
      const text = await c.req.text();
      earlyBodyText = text;
      if (text && text.trim() !== '') {
        parsedBody = JSON.parse(text);
      }
    } catch {
      // Empty or non-JSON body - transport will handle error formatting, keep parsedBody undefined
      parsedBody = undefined;
    }
  }

  // Gate check: if not public body and not authenticated, return 401 with WWW-Authenticate
  const isPublic = isPublicMcpBody(parsedBody);
  const db = drizzle(c.env.DB, { schema });

  // We need to reconstruct request for auth extraction that uses c.req.* but our early read consumed body.
  // For auth extraction, we need candidate from headers/query, not body, so it's fine.
  // However for token in query ?token=, we already handle via extractAuthenticatedUserId which reads query.
  // So we can call extractAuthenticatedUserId directly (it reads headers/query, not body)
  let userId: string | null = null;
  // Only attempt auth if not public or if headers indicate bearer (still try)
  // We still want to resolve userId for public bodies if auth is present, to scope correctly
  userId = await extractAuthenticatedUserId(c, db);

  // If not authenticated and not public, return 401
  if (!userId && !isPublic) {
    // Build WWW-Authenticate with resource_metadata reflecting current host
    const origin = buildIssuerOrigin(c);
    const resourceMetadata = origin + '/.well-known/oauth-protected-resource';
    const wwwAuth = `Bearer resource_metadata="${resourceMetadata}", error="invalid_token", error_description="Authentication required"`;
    c.header('WWW-Authenticate', wwwAuth);
    c.header('Cache-Control', 'no-store');
    c.header('Pragma', 'no-cache');
    c.header('Access-Control-Allow-Origin', '*');
    return c.json({ error: 'invalid_token', error_description: 'Authentication required: provide Authorization Bearer token' }, 401);
  }

  // If authenticated but token is OAuth, check scope insufficient (e.g., missing mcp)
  if (userId) {
    // Try to extract raw bearer to check scope if it's OAuth token
    const authHeader = c.req.header('Authorization');
    let candidate: string | null = null;
    if (authHeader) {
      const m = authHeader.match(/^Bearer\s+(.+)$/i);
      if (m) candidate = m[1].trim();
    }
    if (candidate) {
      const oauthPayload = await verifyOAuthAccessToken(candidate, secret);
      if (oauthPayload) {
        const scopes = oauthPayload.scope.split(/\s+/);
        if (!scopes.includes('mcp')) {
          const origin = buildIssuerOrigin(c);
          const resourceMetadata = origin + '/.well-known/oauth-protected-resource';
          const wwwAuth = `Bearer resource_metadata="${resourceMetadata}", error="insufficient_scope", error_description="Insufficient scope: mcp required"`;
          c.header('WWW-Authenticate', wwwAuth);
          c.header('Cache-Control', 'no-store');
          c.header('Pragma', 'no-cache');
          c.header('Access-Control-Allow-Origin', '*');
          return c.json({ error: 'insufficient_scope', error_description: 'Insufficient scope' }, 401);
        }
      }
    }
  }

  // Use stateless WebStandardStreamableHTTPServerTransport
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  const mcpServer = createMCPServer(db, userId, secret, {
    githubToken: c.env?.GITHUB_TOKEN,
    githubRepo: c.env?.GITHUB_REPO || 'lutfi-zain/reedrich-mcp',
  });
  await mcpServer.connect(transport);

  // Normalize Request headers for maximum compatibility across various MCP clients
  const headers = new Headers(c.req.raw.headers);
  if (c.req.method === 'POST') {
    headers.set('accept', 'application/json, text/event-stream');
    const ct = headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      headers.set('content-type', 'application/json');
    }
  } else if (c.req.method === 'GET') {
    headers.set('accept', 'text/event-stream');
  }

  // For POST, we already parsed body; reuse earlyBodyText to avoid re-reading
  let bodyForTransport: unknown = parsedBody;
  // If early parsing failed due to empty, keep undefined
  // If we consumed text but parsedBody is undefined due to JSON error, keep undefined and let transport handle

  const normalizedRequest = new Request(c.req.raw.url, {
    method: c.req.method,
    headers,
  });

  const response = await transport.handleRequest(normalizedRequest, { parsedBody: bodyForTransport });

  // Ensure empty responses (such as 202 Accepted on notifications or DELETE) return valid JSON body
  // to avoid "JSON Parse error: Unexpected EOF" on clients that call res.json() unconditionally.
  if (response.status === 202 || response.status === 204 || (!response.body && response.status === 200)) {
    const resHeaders = new Headers(response.headers);
    resHeaders.set('content-type', 'application/json');
    return new Response(JSON.stringify({ jsonrpc: '2.0', result: {} }), {
      status: 200,
      headers: resHeaders,
    });
  }

  return response;
}

// Mount across all relevant routes and methods
app.all('/mcp', handleMcpRequest);
app.all('/sse', handleMcpRequest);
app.post('/', handleMcpRequest);

export default app;
