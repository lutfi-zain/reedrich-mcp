import { Hono, type Context } from 'hono';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from './db/schema';
import { createMCPServer } from './mcp';
import { verifyUserToken, hashApiKey, isValidEmail, isValidWhatsApp, generateApiKey, generateUserId } from './utils/token';
import { isValidVerifier, computeS256Challenge, verifyS256Challenge } from './utils/pkce';
import { currentIsoTimestamp } from './utils/date';
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
  DEFAULT_GOOGLE_CLIENT_ID,
  DEFAULT_GOOGLE_CLIENT_SECRET,
  generateGoogleOAuthState,
  verifyGoogleOAuthState,
} from './utils/oauth';

type Bindings = {
  DB: D1Database;
  JWT_SECRET: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
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
        FeedbackRequest: {
          type: "object",
          properties: {
            title: { type: "string", description: "Short summary of feedback or issue (5-200 characters)" },
            content: { type: "string", description: "Detailed feedback description (10-4000 characters)" },
            feedback: { type: "string", description: "Alias for content (10-4000 characters)" },
            type: { type: "string", enum: ["feedback", "bug", "feature_request", "question"], default: "feedback" },
            name: { type: "string", description: "Submitter name (auto-resolved if authenticated)" },
            email: { type: "string", description: "Submitter email (auto-resolved if authenticated)" },
          },
          required: ["title"]
        },
        FeedbackResponse: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            message: { type: "string" },
            feedbackId: { type: "string" },
            type: { type: "string" },
            status: { type: "string" },
            submitter: {
              type: "object",
              properties: {
                name: { type: "string" },
                email: { type: "string" },
                userId: { type: "string", nullable: true }
              }
            },
            submittedAt: { type: "string" }
          }
        }
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
      "/api/v1/feedback": {
        post: {
          summary: "Submit User Feedback, Bug Report, or Feature Request",
          operationId: "submitFeedback",
          security: [{ bearerAuth: [] }, {}],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { "$ref": "#/components/schemas/FeedbackRequest" }
              }
            }
          },
          responses: {
            "201": {
              description: "Feedback recorded successfully",
              content: {
                "application/json": {
                  schema: { "$ref": "#/components/schemas/FeedbackResponse" }
                }
              }
            },
            "400": {
              description: "Validation Error",
              content: {
                "application/json": {
                  schema: { "$ref": "#/components/schemas/ErrorResponse" }
                }
              }
            }
          }
        }
      }
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

// REST API: POST /api/v1/feedback
app.post('/api/v1/feedback', async (c) => {
  const secret = c.env?.JWT_SECRET;
  const db = drizzle(c.env.DB, { schema });

  let body: Record<string, unknown> = {};
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return c.json({ error: 'invalid_request', message: 'Malformed JSON payload' }, 400);
  }

  const title = typeof body.title === 'string' ? body.title : undefined;
  const feedback = typeof body.feedback === 'string' ? body.feedback : undefined;
  const content = typeof body.content === 'string' ? body.content : undefined;
  const type = typeof body.type === 'string' ? body.type : 'feedback';
  const submitterName = typeof body.name === 'string' ? body.name : undefined;
  const submitterEmail = typeof body.email === 'string' ? body.email : undefined;
  const feedbackContent = content || feedback;

  if (!title || title.trim().length < 5 || title.trim().length > 200) {
    return c.json({ error: 'validation_error', message: "Validation Error: 'title' is required (5-200 characters)" }, 400);
  }
  if (!feedbackContent || feedbackContent.trim().length < 10 || feedbackContent.trim().length > 4000) {
    return c.json({ error: 'validation_error', message: "Validation Error: 'content' or 'feedback' is required (10-4000 characters)" }, 400);
  }

  const validTypes = ['feedback', 'bug', 'feature_request', 'question'];
  if (!validTypes.includes(type)) {
    return c.json({ error: 'validation_error', message: `Validation Error: 'type' must be one of: ${validTypes.join(', ')}` }, 400);
  }

  // Resolve authentication if token / API key is present
  let foundUserId: string | null = null;
  let userName = submitterName && submitterName.trim().length > 0 ? submitterName.trim() : null;
  let userEmail = submitterEmail && submitterEmail.trim().length > 0 ? submitterEmail.trim().toLowerCase() : null;

  const authHeader = c.req.header('Authorization') || c.req.header('X-API-Key') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : authHeader.trim();

  if (token) {
    if (token.startsWith('rd_live_') || token.startsWith('fp_live_')) {
      try {
        const hash = await hashApiKey(token);
        const user = await db.select().from(schema.users).where(eq(schema.users.userApiKeyHash, hash)).get();
        if (user) {
          foundUserId = user.userId;
          if (!userName) userName = `${user.userFirstName} ${user.userLastName}`.trim();
          if (!userEmail) userEmail = user.userEmail;
        }
      } catch {
        // Continue to unauthenticated checks
      }
    } else if (secret) {
      try {
        const oauthPayload = await verifyOAuthAccessToken(token, secret);
        const jwtPayload = oauthPayload ? null : await verifyUserToken(token, secret);
        const resolvedId = oauthPayload?.sub || jwtPayload?.userId;
        if (resolvedId) {
          const user = await db.select().from(schema.users).where(eq(schema.users.userId, resolvedId)).get();
          if (user) {
            foundUserId = user.userId;
            if (!userName) userName = `${user.userFirstName} ${user.userLastName}`.trim();
            if (!userEmail) userEmail = user.userEmail;
          }
        }
      } catch {
        // Continue to unauthenticated checks
      }
    }
  }

  if (!userName) {
    return c.json({ error: 'validation_error', message: "Validation Error: Submitter 'name' is required when unauthenticated. Please provide 'name' in request body or authenticate with your API key / Bearer token." }, 400);
  }
  if (!userEmail || !isValidEmail(userEmail)) {
    return c.json({ error: 'validation_error', message: `Validation Error: A valid 'email' is required. Received: '${userEmail || ''}'. Please provide a valid email or authenticate with your API key / Bearer token.` }, 400);
  }

  const newFeedbackId = crypto.randomUUID();
  const now = currentIsoTimestamp();

  await db.insert(schema.feedbacks).values({
    feedbackId: newFeedbackId,
    feedbackUserId: foundUserId,
    feedbackTitle: title.trim(),
    feedbackContent: feedbackContent.trim(),
    feedbackType: type,
    feedbackSubmitterName: userName,
    feedbackSubmitterEmail: userEmail,
    feedbackStatus: 'new',
    feedbackCreatedAt: now,
  }).run();

  return c.json({
    success: true,
    message: 'Feedback submitted successfully and saved to internal database!',
    feedbackId: newFeedbackId,
    type,
    status: 'new',
    submitter: {
      name: userName,
      email: userEmail,
      userId: foundUserId,
    },
    submittedAt: now,
  }, 201);
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
// ---------------------------------------------------------------------------
// OAuth Consent Helpers — loginUser / registerUser + HTML rendering
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export async function loginUser(
  db: DrizzleD1Database<typeof schema>,
  secret: string,
  apiKey: string
): Promise<string> {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
    throw new Error('API Key diperlukan');
  }
  const clean = apiKey.trim();
  const keyHash = await hashApiKey(clean);
  const user = await db.select({ userId: schema.users.userId }).from(schema.users).where(eq(schema.users.userApiKeyHash, keyHash)).get();
  if (!user) {
    throw new Error('API Key tidak valid. Pastikan Anda menyalin rd_live_... dengan benar atau daftar akun baru.');
  }
  return user.userId;
}

export async function registerUser(
  db: DrizzleD1Database<typeof schema>,
  secret: string,
  params: { firstName: string; lastName: string; email: string; whatsappNumber: string }
): Promise<string> {
  const { firstName, lastName, email, whatsappNumber } = params;
  if (!firstName || typeof firstName !== 'string' || firstName.trim().length === 0 || firstName.trim().length > 100) {
    throw new Error('Nama depan wajib diisi (1-100 karakter)');
  }
  if (!lastName || typeof lastName !== 'string' || lastName.trim().length === 0 || lastName.trim().length > 100) {
    throw new Error('Nama belakang wajib diisi (1-100 karakter)');
  }
  if (!isValidEmail(email) || (typeof email === 'string' && email.length > 255)) {
    throw new Error('Format email tidak valid. Contoh: user@example.com');
  }
  if (!isValidWhatsApp(whatsappNumber)) {
    throw new Error('Format WhatsApp tidak valid. Harus diawali + kode negara, 6-14 digit (contoh: +6281234567890)');
  }
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await db.select().from(schema.users).where(eq(schema.users.userEmail, normalizedEmail)).get();
  if (existing) {
    throw new Error(`Email '${normalizedEmail}' sudah terdaftar. Silakan masuk dengan API Key.`);
  }
  const newUserId = generateUserId();
  const apiKey = generateApiKey();
  const apiKeyHash = await hashApiKey(apiKey);
  const nowIso = currentIsoTimestamp();
  await db.insert(schema.users).values({
    userId: newUserId,
    userFirstName: firstName.trim(),
    userLastName: lastName.trim(),
    userEmail: normalizedEmail,
    userWhatsappNumber: whatsappNumber.trim(),
    userApiKeyHash: apiKeyHash,
    userCreatedAt: nowIso,
  });
  return newUserId;
}

function renderConsentHtml(
  params: {
    client_id: string;
    redirect_uri: string;
    response_type: string;
    state?: string;
    code_challenge: string;
    code_challenge_method: string;
    scope: string;
  },
  errorMsg?: string | null
): string {
  const e = escapeHtml;
  const googleStartParams = new URLSearchParams({
    client_id: params.client_id,
    redirect_uri: params.redirect_uri,
    response_type: params.response_type,
    state: params.state ?? '',
    code_challenge: params.code_challenge,
    code_challenge_method: params.code_challenge_method,
    scope: params.scope,
  });
  const googleStartUrl = `/oauth/google/start?${googleStartParams.toString()}`;

  const hiddenFields = `
    <input type="hidden" name="client_id" value="${e(params.client_id)}" />
    <input type="hidden" name="redirect_uri" value="${e(params.redirect_uri)}" />
    <input type="hidden" name="response_type" value="${e(params.response_type)}" />
    <input type="hidden" name="state" value="${e(params.state ?? '')}" />
    <input type="hidden" name="code_challenge" value="${e(params.code_challenge)}" />
    <input type="hidden" name="code_challenge_method" value="${e(params.code_challenge_method)}" />
    <input type="hidden" name="scope" value="${e(params.scope)}" />
  `;
  const errorBlock = errorMsg
    ? `<div class="error-banner"><span class="error-icon">⚠️</span><span>${e(errorMsg)}</span></div>`
    : '';
  const redirectDisplay = e(params.redirect_uri);
  const clientDisplay = e(params.client_id.slice(0, 12) + '…' + params.client_id.slice(-6));
  const scopeDisplay = e(params.scope);
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Otorisasi - Reedrich</title>
<meta name="color-scheme" content="dark" />
<style>
:root {
  --bg: #0d1117;
  --card: #161b22;
  --card-border: rgba(255, 255, 255, 0.08);
  --card-glass: rgba(22, 27, 34, 0.85);
  --text: #c9d1d9;
  --text-bright: #f0f6fc;
  --muted: #8b949e;
  --accent: #58a6ff;
  --accent-hover: #4493f8;
  --danger-bg: rgba(248, 81, 73, 0.12);
  --danger-border: rgba(248, 81, 73, 0.35);
  --danger-text: #ffa198;
  --input-bg: #0b0f14;
  --input-border: rgba(255, 255, 255, 0.12);
  --radius: 14px;
}
* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Geist", Helvetica, Arial, sans-serif;
  line-height: 1.5;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}
.container {
  width: 100%;
  max-width: 460px;
  margin: 32px auto;
  padding: 0 16px;
}
.card {
  background: var(--card);
  border: 1px solid var(--card-border);
  border-radius: var(--radius);
  overflow: hidden;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(12px);
}
.header {
  padding: 28px 24px 20px;
  text-align: center;
  border-bottom: 1px solid var(--card-border);
}
.logo-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(88, 166, 255, 0.2), rgba(31, 111, 235, 0.1));
  border: 1px solid rgba(88, 166, 255, 0.3);
  margin-bottom: 14px;
  font-size: 20px;
}
.header h1 {
  margin: 0 0 6px;
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-bright);
}
.header .subtitle {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
}
.header .client-meta {
  margin-top: 14px;
  display: flex;
  gap: 6px;
  justify-content: center;
  flex-wrap: wrap;
}
.pill {
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--card-border);
  background: rgba(13, 17, 23, 0.6);
  color: var(--muted);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pill strong { color: var(--text-bright); }
.error-banner {
  margin: 16px 20px 0;
  padding: 12px 14px;
  border-radius: 8px;
  background: var(--danger-bg);
  border: 1px solid var(--danger-border);
  color: var(--danger-text);
  font-size: 13px;
  display: flex;
  gap: 10px;
  align-items: center;
}
.error-icon { flex-shrink: 0; font-size: 15px; }
.hero-section {
  padding: 24px 20px 16px;
  text-align: center;
}
.btn-google {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 100%;
  padding: 14px 18px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: #ffffff;
  color: #1a1a1a;
  font-size: 15px;
  font-weight: 600;
  text-decoration: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.1);
  transition: transform 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
  cursor: pointer;
}
.btn-google:hover {
  background: #f4f6f8;
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(66, 133, 244, 0.25), 0 0 0 1px rgba(66, 133, 244, 0.4);
}
.btn-google:active {
  transform: translateY(0);
}
.google-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}
.hero-caption {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.4;
}
.dev-section {
  padding: 0 20px 20px;
}
.dev-drawer {
  margin-top: 12px;
  border-top: 1px solid var(--card-border);
  padding-top: 14px;
}
.dev-drawer summary {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  cursor: pointer;
  user-select: none;
  padding: 6px 0;
  transition: color 0.15s ease;
  list-style-position: inside;
}
.dev-drawer summary:hover {
  color: var(--text-bright);
}
.dev-drawer-content {
  margin-top: 14px;
  padding: 14px;
  border-radius: 8px;
  background: rgba(13, 17, 23, 0.7);
  border: 1px solid var(--card-border);
}
.field { margin-bottom: 12px; }
.field label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 6px;
  color: var(--text);
}
.field input {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--input-border);
  background: var(--input-bg);
  color: var(--text-bright);
  font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.field input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.18);
}
.field input::placeholder { color: #484f58; }
.hint {
  font-size: 11px;
  color: var(--muted);
  margin-top: 4px;
  line-height: 1.4;
}
.hint code {
  font-family: ui-monospace, SFMono-Regular, monospace;
  color: var(--accent);
  background: rgba(88, 166, 255, 0.1);
  padding: 1px 4px;
  border-radius: 4px;
}
.btn-dev {
  width: 100%;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid rgba(88, 166, 255, 0.3);
  background: rgba(88, 166, 255, 0.15);
  color: var(--accent);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
.btn-dev:hover {
  background: var(--accent);
  color: #0d1117;
  border-color: var(--accent);
}
.footer {
  padding: 14px 20px;
  border-top: 1px solid var(--card-border);
  text-align: center;
  color: var(--muted);
  font-size: 11px;
  background: rgba(13, 17, 23, 0.3);
}
.footer a {
  color: var(--accent);
  text-decoration: none;
  transition: color 0.15s ease;
}
.footer a:hover { text-decoration: underline; color: var(--accent-hover); }
@media (max-width: 480px) {
  .container { margin: 16px auto; padding: 0 12px; }
  .header { padding: 22px 18px 16px; }
  .hero-section { padding: 20px 16px 14px; }
  .dev-section { padding: 0 16px 16px; }
}
</style>
</head>
<body>
<div class="container">
<div class="card">
  <div class="header">
    <div class="logo-badge">🔐</div>
    <h1>Otorisasi Akses Reedrich</h1>
    <p class="subtitle">Aplikasi ingin mengakses data keuangan Anda secara aman</p>
    <div class="client-meta">
      <span class="pill"><strong>Client:</strong> ${clientDisplay}</span>
      <span class="pill"><strong>Scope:</strong> ${scopeDisplay}</span>
    </div>
    <div class="pill" style="margin:10px auto 0; max-width:100%; word-break:break-all; white-space:normal; display:inline-block;">↳ ${redirectDisplay}</div>
  </div>
  ${errorBlock}
  <div class="hero-section">
    <a href="${e(googleStartUrl)}" class="btn-google">
      <svg class="google-icon" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
      </svg>
      <span>Lanjutkan dengan Akun Google</span>
    </a>
    <p class="hero-caption">Masuk atau daftar otomatis dalam 1 detik tanpa perlu API key</p>
  </div>
  <div class="dev-section">
    <details class="dev-drawer"${errorMsg ? ' open' : ''}>
      <summary>⚙️ Opsi Pengembang (Masuk dengan API Key)</summary>
      <div class="dev-drawer-content">
        <form method="POST" action="/oauth/authorize" autocomplete="off">
          ${hiddenFields}
          <input type="hidden" name="auth_method" value="login" />
          <div class="field">
            <label for="api_key">API Key</label>
            <input id="api_key" name="api_key" type="password" required placeholder="rd_live_..." autocomplete="off" />
            <div class="hint">Tempel API Key yang diawali <code>rd_live_</code> atau <code>fp_live_</code>.</div>
          </div>
          <button type="submit" class="btn-dev">Izinkan via API Key</button>
          <div class="hint" style="text-align:center; margin-top:8px;">Akan dialihkan ke <strong>${redirectDisplay}</strong></div>
        </form>
      </div>
    </details>
  </div>
  <div class="footer">
    Aman dengan PKCE S256 • Reedrich Financial Intelligence<br/>
    <a href="/privacy" target="_blank" rel="noopener">Kebijakan Privasi</a> • <a href="/" target="_blank" rel="noopener">Beranda</a>
  </div>
</div>
</div>
</body>
</html>`;
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
    // Browser flow: render interactive HTML Consent / Login UI (dark theme #0d1117)
    // This is required for Perplexity/ChatGPT which open /oauth/authorize in a browser without Bearer headers.
    // Check Accept header: if client explicitly expects JSON and not HTML, return 401 JSON for API compatibility.
    // Otherwise, return HTML. For live curl verification and browser, HTML is expected.
    const accept = c.req.header('Accept') || '';
    const wantsJson = accept.includes('application/json') && !accept.includes('text/html');
    if (wantsJson) {
      c.header('Cache-Control', 'no-store');
      c.header('Pragma', 'no-cache');
      return c.json({ error: 'login_required', error_description: 'User authentication required. Provide Authorization: Bearer <rd_live_... or JWT> or ?token=' }, 401);
    }
    const html = renderConsentHtml(
      {
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: responseType,
        state: state || '',
        code_challenge: codeChallenge,
        code_challenge_method: codeChallengeMethod,
        scope,
      }
    );
    c.header('Cache-Control', 'no-store');
    c.header('Pragma', 'no-cache');
    c.header('Content-Type', 'text/html; charset=utf-8');
    return c.html(html, 200);
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

// ---------------------------------------------------------------------------
// Google OAuth 2.0 Federation — GET /oauth/google/start & GET /oauth/google/callback
// ---------------------------------------------------------------------------

app.get('/oauth/google/start', async (c) => {
  const secret = c.env?.JWT_SECRET;
  if (!secret) {
    return c.json({ error: 'server_error', error_description: 'JWT_SECRET missing' }, 500);
  }

  const clientId = c.req.query('client_id');
  const redirectUri = c.req.query('redirect_uri');
  const state = c.req.query('state') || '';
  const codeChallenge = c.req.query('code_challenge');
  const codeChallengeMethod = c.req.query('code_challenge_method') || 'S256';
  const scope = c.req.query('scope') || 'mcp';

  if (!clientId || !redirectUri || !codeChallenge) {
    return c.json({ error: 'invalid_request', error_description: 'client_id, redirect_uri, and code_challenge are required' }, 400);
  }

  const origin = buildIssuerOrigin(c);
  const signedState = await generateGoogleOAuthState(
    {
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod,
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
});

app.get('/oauth/google/callback', async (c) => {
  const secret = c.env?.JWT_SECRET;
  if (!secret) {
    return c.json({ error: 'server_error', error_description: 'JWT_SECRET missing' }, 500);
  }
  if (!c.env?.DB) {
    return c.json({ error: 'server_error', error_description: 'DB missing' }, 500);
  }

  const code = c.req.query('code');
  const stateJwt = c.req.query('state');
  const errorParam = c.req.query('error');
  const errorDesc = c.req.query('error_description');

  if (!stateJwt) {
    return c.json({ error: 'invalid_request', error_description: 'state parameter is missing' }, 400);
  }

  const statePayload = await verifyGoogleOAuthState(stateJwt, secret);
  if (!statePayload) {
    return c.json({ error: 'invalid_request', error_description: 'state token is invalid or expired' }, 400);
  }

  const { client_id: downstreamClientId, redirect_uri: downstreamRedirectUri, state: downstreamState, code_challenge, code_challenge_method, scope } = statePayload;

  if (errorParam) {
    const redirectUrl = new URL(downstreamRedirectUri);
    redirectUrl.searchParams.set('error', errorParam);
    if (errorDesc) redirectUrl.searchParams.set('error_description', errorDesc);
    if (downstreamState) redirectUrl.searchParams.set('state', downstreamState);
    return new Response(null, {
      status: 302,
      headers: { Location: redirectUrl.toString(), 'Cache-Control': 'no-store', Pragma: 'no-cache' },
    });
  }

  if (!code) {
    const redirectUrl = new URL(downstreamRedirectUri);
    redirectUrl.searchParams.set('error', 'invalid_request');
    redirectUrl.searchParams.set('error_description', 'code parameter missing from Google callback');
    if (downstreamState) redirectUrl.searchParams.set('state', downstreamState);
    return new Response(null, {
      status: 302,
      headers: { Location: redirectUrl.toString(), 'Cache-Control': 'no-store', Pragma: 'no-cache' },
    });
  }

  const origin = buildIssuerOrigin(c);
  const googleClientId = c.env?.GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID;
  const googleClientSecret = c.env?.GOOGLE_CLIENT_SECRET || DEFAULT_GOOGLE_CLIENT_SECRET;
  const googleCallbackUrl = `${origin}/oauth/google/callback`;

  // Exchange code for tokens with Google
  let tokenData: { access_token?: string; id_token?: string; error_description?: string } = {};
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: googleClientId,
        client_secret: googleClientSecret,
        redirect_uri: googleCallbackUrl,
        grant_type: 'authorization_code',
      }).toString(),
    });
    tokenData = (await tokenRes.json()) as { access_token?: string; id_token?: string; error_description?: string };
    if (!tokenRes.ok || !tokenData.access_token) {
      const redirectUrl = new URL(downstreamRedirectUri);
      redirectUrl.searchParams.set('error', 'access_denied');
      redirectUrl.searchParams.set('error_description', tokenData.error_description || 'Failed to exchange Google code');
      if (downstreamState) redirectUrl.searchParams.set('state', downstreamState);
      return new Response(null, {
        status: 302,
        headers: { Location: redirectUrl.toString(), 'Cache-Control': 'no-store', Pragma: 'no-cache' },
      });
    }
  } catch (err: unknown) {
    const redirectUrl = new URL(downstreamRedirectUri);
    redirectUrl.searchParams.set('error', 'server_error');
    redirectUrl.searchParams.set('error_description', 'Network error contacting Google: ' + (err instanceof Error ? err.message : String(err)));
    if (downstreamState) redirectUrl.searchParams.set('state', downstreamState);
    return new Response(null, {
      status: 302,
      headers: { Location: redirectUrl.toString(), 'Cache-Control': 'no-store', Pragma: 'no-cache' },
    });
  }

  // Fetch Google User Profile
  let email = '';
  let givenName = '';
  let familyName = '';
  let name = '';

  try {
    const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (userinfoRes.ok) {
      const userinfo = (await userinfoRes.json()) as { email?: string; given_name?: string; family_name?: string; name?: string };
      email = userinfo.email || '';
      givenName = userinfo.given_name || '';
      familyName = userinfo.family_name || '';
      name = userinfo.name || '';
    } else if (tokenData.id_token) {
      // Fallback decode id_token payload
      const parts = tokenData.id_token.split('.');
      if (parts.length === 3) {
        const payloadStr = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
        const parsed = JSON.parse(payloadStr) as { email?: string; given_name?: string; family_name?: string; name?: string };
        email = parsed.email || '';
        givenName = parsed.given_name || '';
        familyName = parsed.family_name || '';
        name = parsed.name || '';
      }
    }
  } catch {
    // If profile fetch fails, attempt id_token parse
    if (tokenData.id_token) {
      try {
        const parts = tokenData.id_token.split('.');
        if (parts.length === 3) {
          const payloadStr = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
          const parsed = JSON.parse(payloadStr) as { email?: string; given_name?: string; family_name?: string; name?: string };
          email = parsed.email || '';
          givenName = parsed.given_name || '';
          familyName = parsed.family_name || '';
          name = parsed.name || '';
        }
      } catch {}
    }
  }

  if (!email || !isValidEmail(email)) {
    const redirectUrl = new URL(downstreamRedirectUri);
    redirectUrl.searchParams.set('error', 'server_error');
    redirectUrl.searchParams.set('error_description', 'Could not obtain a valid email from Google profile');
    if (downstreamState) redirectUrl.searchParams.set('state', downstreamState);
    return new Response(null, {
      status: 302,
      headers: { Location: redirectUrl.toString(), 'Cache-Control': 'no-store', Pragma: 'no-cache' },
    });
  }

  // Database Upsert in D1
  const db = drizzle(c.env.DB, { schema });
  const normalizedEmail = email.trim().toLowerCase();
  let userId: string;

  const existing = await db.select({ userId: schema.users.userId }).from(schema.users).where(eq(schema.users.userEmail, normalizedEmail)).get();
  if (existing) {
    userId = existing.userId;
  } else {
    userId = generateUserId();
    const autoApiKey = generateApiKey();
    const apiKeyHash = await hashApiKey(autoApiKey);
    const nowIso = currentIsoTimestamp();
    await db.insert(schema.users).values({
      userId,
      userFirstName: (givenName || name || 'Google').trim().slice(0, 100),
      userLastName: (familyName || (name ? '' : 'User') || 'User').trim().slice(0, 100) || 'User',
      userEmail: normalizedEmail,
      userWhatsappNumber: '+0',
      userApiKeyHash: apiKeyHash,
      userCreatedAt: nowIso,
    });
  }

  // Issue downstream Authorization Code JWT
  const authCode = await generateAuthorizationCode(
    {
      sub: userId,
      client_id: downstreamClientId,
      redirect_uri: downstreamRedirectUri,
      scope,
      code_challenge,
      code_challenge_method: (code_challenge_method as 'S256') || 'S256',
    },
    secret,
    origin
  );

  // 302 redirect back to downstream consumer
  const finalRedirectUrl = new URL(downstreamRedirectUri);
  finalRedirectUrl.searchParams.set('code', authCode);
  if (downstreamState) finalRedirectUrl.searchParams.set('state', downstreamState);

  return new Response(null, {
    status: 302,
    headers: {
      Location: finalRedirectUrl.toString(),
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
    },
  });
});

app.post('/oauth/authorize', async (c) => {
  const secret = c.env?.JWT_SECRET;
  if (!secret) {
    return c.json({ error: 'server_error', error_description: 'JWT_SECRET missing' }, 500);
  }
  const origin = buildIssuerOrigin(c);

  // Parse body leniently — support x-www-form-urlencoded, multipart/form-data, or JSON
  let bodyParams: Record<string, string> = {};
  const ct = c.req.header('content-type') || '';
  try {
    if (ct.includes('application/json')) {
      const json = (await c.req.json()) as Record<string, unknown>;
      for (const [k, v] of Object.entries(json)) {
        if (typeof v === 'string') bodyParams[k] = v;
        else if (typeof v === 'number') bodyParams[k] = String(v);
        else if (v !== null && v !== undefined) bodyParams[k] = String(v);
      }
    } else if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
      const form = await c.req.parseBody();
      for (const [k, v] of Object.entries(form)) {
        if (typeof v === 'string') bodyParams[k] = v;
        else if (v instanceof File) bodyParams[k] = await v.text();
        else bodyParams[k] = String(v);
      }
    } else {
      // Lenient: try parseBody first, then text -> json or URLSearchParams
      let hasForm = false;
      try {
        const form = await c.req.parseBody();
        for (const [k, v] of Object.entries(form)) {
          if (typeof v === 'string') { bodyParams[k] = v; hasForm = true; }
          else if (v instanceof File) { bodyParams[k] = await v.text(); hasForm = true; }
        }
      } catch {}
      if (!hasForm) {
        const txt = await c.req.text();
        if (txt) {
          try {
            const j = JSON.parse(txt) as Record<string, unknown>;
            for (const [k, v] of Object.entries(j)) {
              if (typeof v === 'string') bodyParams[k] = v;
              else if (typeof v === 'number') bodyParams[k] = String(v);
              else if (v !== null && v !== undefined) bodyParams[k] = String(v);
            }
          } catch {
            const params = new URLSearchParams(txt);
            for (const [k, v] of params.entries()) bodyParams[k] = v;
          }
        }
      }
    }
  } catch {
    // ignore parse errors
  }

  const getParam = (key: string): string | undefined => {
    const b = bodyParams[key];
    if (b !== undefined && b !== '') return b;
    const q = c.req.query(key);
    if (q !== undefined && q !== '') return q;
    // fallback to body even if empty string?
    if (b !== undefined) return b;
    return q;
  };

  const responseType = getParam('response_type');
  const clientId = getParam('client_id');
  const redirectUri = getParam('redirect_uri');
  const scopeRaw = getParam('scope');
  const state = getParam('state');
  const codeChallenge = getParam('code_challenge');
  const codeChallengeMethod = getParam('code_challenge_method');

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

  // Try to authenticate via Bearer/query token first (for already-logged-in users)
  let userId: string | null = null;
  let authError: string | null = null;
  try {
    const dbForBearer = drizzle(c.env.DB, { schema });
    const bearerUser = await extractAuthenticatedUserId(c, dbForBearer);
    if (bearerUser) userId = bearerUser;
  } catch {}

  // If not authenticated via Bearer, handle form-based auth_method
  if (!userId) {
    const authMethodRaw = (bodyParams.auth_method ?? bodyParams.authMethod ?? '').trim();
    const authMethod = authMethodRaw.toLowerCase();
    const db = drizzle(c.env.DB, { schema });

    if (authMethod === 'login') {
      const apiKey = (bodyParams.api_key ?? bodyParams.apiKey ?? bodyParams['apiKey'] ?? '').trim();
      if (!apiKey) {
        authError = 'API Key diperlukan. Masukkan rd_live_... Anda.';
      } else {
        try {
          userId = await loginUser(db, secret, apiKey);
        } catch (e) {
          authError = e instanceof Error ? e.message : String(e);
        }
        if (!userId && !authError) authError = 'API Key tidak valid';
      }
    } else if (authMethod === 'signup') {
      const firstName = (bodyParams.firstName ?? bodyParams.first_name ?? '').trim();
      const lastName = (bodyParams.lastName ?? bodyParams.last_name ?? '').trim();
      const email = (bodyParams.email ?? '').trim();
      const whatsappNumber = (bodyParams.whatsappNumber ?? bodyParams.whatsapp_number ?? bodyParams.whatsapp ?? '').trim();
      try {
        userId = await registerUser(db, secret, { firstName, lastName, email, whatsappNumber });
      } catch (e) {
        authError = e instanceof Error ? e.message : String(e);
      }
    } else if (authMethod === '' || authMethod === undefined) {
      // No explicit auth_method — try to infer from present fields for backward compatibility
      const maybeApiKey = (bodyParams.api_key ?? bodyParams.apiKey ?? '').trim();
      const hasSignupFields = (bodyParams.firstName ?? bodyParams.email ?? '') !== '';
      if (maybeApiKey && !hasSignupFields) {
        try {
          userId = await loginUser(db, secret, maybeApiKey);
        } catch (e) {
          authError = e instanceof Error ? e.message : String(e);
        }
        if (!userId && !authError) authError = 'API Key tidak valid';
      } else if (hasSignupFields) {
        const firstName = (bodyParams.firstName ?? bodyParams.first_name ?? '').trim();
        const lastName = (bodyParams.lastName ?? bodyParams.last_name ?? '').trim();
        const email = (bodyParams.email ?? '').trim();
        const whatsappNumber = (bodyParams.whatsappNumber ?? bodyParams.whatsapp_number ?? '').trim();
        try {
          userId = await registerUser(db, secret, { firstName, lastName, email, whatsappNumber });
        } catch (e) {
          authError = e instanceof Error ? e.message : String(e);
        }
      } else {
        authError = 'Silakan pilih metode login atau daftar';
      }
    } else {
      authError = 'Metode autentikasi tidak dikenal: ' + authMethodRaw;
    }
  }

  if (!userId) {
    const accept = c.req.header('Accept') || '';
    const isJsonRequest = ct.includes('application/json') || (accept.includes('application/json') && !accept.includes('text/html'));
    // If client explicitly expects JSON, return JSON error
    if (isJsonRequest) {
      c.header('Cache-Control', 'no-store');
      c.header('Pragma', 'no-cache');
      return c.json({ error: 'login_required', error_description: authError || 'User authentication required' }, 401);
    }
    // Otherwise re-render consent page with error (preserve OAuth params)
    const html = renderConsentHtml(
      {
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: responseType,
        state: state || '',
        code_challenge: codeChallenge,
        code_challenge_method: codeChallengeMethod,
        scope,
      },
      authError || 'Autentikasi gagal. Periksa kembali data Anda.'
    );
    c.header('Cache-Control', 'no-store');
    c.header('Pragma', 'no-cache');
    c.header('Content-Type', 'text/html; charset=utf-8');
    return c.html(html, 401);
  }

  // Issue 5-minute Authorization Code JWT
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

  const mcpServer = createMCPServer(db, userId, secret);
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
