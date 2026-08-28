import { sign, verify } from 'hono/jwt';

export const OAUTH_CODE_EXPIRY = 300; // 5 minutes
export const OAUTH_ACCESS_EXPIRY = 900; // 15 minutes
export const OAUTH_REFRESH_EXPIRY = 2592000; // 30 days
export const CLOCK_SKEW = 60; // seconds
export const OAUTH_SCOPES = ['mcp'] as const;
export const GOOGLE_STATE_EXPIRY = 600; // 10 minutes
export const DEFAULT_GOOGLE_CLIENT_ID = 'mock-google-client-id.apps.googleusercontent.com';
export const DEFAULT_GOOGLE_CLIENT_SECRET = 'mock-google-client-secret';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function base64urlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

// ---------------------------------------------------------------------------
// Authorization Code JWT
// ---------------------------------------------------------------------------

export interface AuthorizationCodePayload {
  sub: string;
  client_id: string;
  redirect_uri: string;
  scope: string;
  code_challenge: string;
  code_challenge_method: 'S256';
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  jti: string;
}

export async function generateAuthorizationCode(
  params: {
    sub: string;
    client_id: string;
    redirect_uri: string;
    scope: string;
    code_challenge: string;
    code_challenge_method?: 'S256';
  },
  secret: string,
  origin: string
): Promise<string> {
  if (!secret || typeof secret !== 'string' || secret.trim() === '') throw new Error('JWT_SECRET required');
  const iat = nowSeconds();
  const payload: AuthorizationCodePayload = {
    sub: params.sub,
    client_id: params.client_id,
    redirect_uri: params.redirect_uri,
    scope: params.scope,
    code_challenge: params.code_challenge,
    code_challenge_method: 'S256',
    iss: origin,
    aud: origin,
    iat,
    exp: iat + OAUTH_CODE_EXPIRY,
    jti: crypto.randomUUID(),
  };
  return sign(payload as unknown as Record<string, unknown>, secret, 'HS256');
}

export async function verifyAuthorizationCode(
  code: string,
  secret: string,
  nowSec?: number
): Promise<AuthorizationCodePayload | null> {
  if (!code || typeof code !== 'string' || !secret || typeof secret !== 'string') return null;
  try {
    const payload = (await verify(code.trim(), secret, { alg: 'HS256', exp: false, iat: false, nbf: false })) as unknown as AuthorizationCodePayload;
    if (!payload || typeof payload.sub !== 'string' || typeof payload.client_id !== 'string' || typeof payload.redirect_uri !== 'string' || typeof payload.scope !== 'string' || typeof payload.code_challenge !== 'string' || payload.code_challenge_method !== 'S256' || typeof payload.iss !== 'string' || typeof payload.aud !== 'string' || typeof payload.iat !== 'number' || typeof payload.exp !== 'number' || typeof payload.jti !== 'string') {
      return null;
    }
    const now = nowSec !== undefined ? nowSec : nowSeconds();
    if (payload.exp + CLOCK_SKEW < now) return null;
    if (payload.iat - CLOCK_SKEW > now) return null;
    if (payload.exp - payload.iat !== OAUTH_CODE_EXPIRY) {
      // allow skew? strict check: exp - iat must be 300
      // but if clock skew, we still enforce 300 via generation; verify tolerance on verification only
      // Enforce exact 300 to catch tampering
      if (payload.exp !== payload.iat + OAUTH_CODE_EXPIRY) return null;
    }
    return payload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Access Token JWT (15m)
// ---------------------------------------------------------------------------

export interface OAuthAccessPayload {
  sub: string;
  client_id: string;
  scope: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  jti: string;
}

export async function generateOAuthAccessToken(
  params: { sub: string; client_id: string; scope: string; origin: string },
  secret: string
): Promise<string> {
  if (!secret || typeof secret !== 'string' || secret.trim() === '') throw new Error('JWT_SECRET required');
  const iat = nowSeconds();
  const payload: OAuthAccessPayload = {
    sub: params.sub,
    client_id: params.client_id,
    scope: params.scope,
    iss: params.origin,
    aud: params.origin,
    iat,
    exp: iat + OAUTH_ACCESS_EXPIRY,
    jti: crypto.randomUUID(),
  };
  return sign(payload as unknown as Record<string, unknown>, secret, 'HS256');
}

export async function verifyOAuthAccessToken(
  token: string,
  secret: string,
  nowSec?: number,
  _origin?: string
): Promise<OAuthAccessPayload | null> {
  if (!token || typeof token !== 'string' || !secret || typeof secret !== 'string') return null;
  try {
    const payload = (await verify(token.trim(), secret, { alg: 'HS256', exp: false, iat: false, nbf: false })) as unknown as OAuthAccessPayload & { token_type?: string };
    if (!payload || typeof payload.sub !== 'string' || typeof payload.client_id !== 'string' || typeof payload.scope !== 'string' || typeof payload.iss !== 'string' || typeof payload.aud !== 'string' || typeof payload.iat !== 'number' || typeof payload.exp !== 'number' || typeof payload.jti !== 'string') {
      return null;
    }
    if (payload.token_type === 'refresh') return null;
    const now = nowSec !== undefined ? nowSec : nowSeconds();
    if (payload.exp + CLOCK_SKEW < now) return null;
    if (payload.iat - CLOCK_SKEW > now) return null;
    if (payload.exp !== payload.iat + OAUTH_ACCESS_EXPIRY) return null;
    return payload as unknown as OAuthAccessPayload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Refresh Token JWT (30d)
// ---------------------------------------------------------------------------

export interface OAuthRefreshPayload {
  sub: string;
  client_id: string;
  scope: string;
  token_type: 'refresh';
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  jti: string;
}

export async function generateRefreshToken(
  params: { sub: string; client_id: string; scope: string; origin: string },
  secret: string
): Promise<string> {
  if (!secret || typeof secret !== 'string' || secret.trim() === '') throw new Error('JWT_SECRET required');
  const iat = nowSeconds();
  const payload: OAuthRefreshPayload = {
    sub: params.sub,
    client_id: params.client_id,
    scope: params.scope,
    token_type: 'refresh',
    iss: params.origin,
    aud: params.origin,
    iat,
    exp: iat + OAUTH_REFRESH_EXPIRY,
    jti: crypto.randomUUID(),
  };
  return sign(payload as unknown as Record<string, unknown>, secret, 'HS256');
}

export async function verifyRefreshToken(
  token: string,
  secret: string,
  nowSec?: number
): Promise<OAuthRefreshPayload | null> {
  if (!token || typeof token !== 'string' || !secret || typeof secret !== 'string') return null;
  try {
    const payload = (await verify(token.trim(), secret, { alg: 'HS256', exp: false, iat: false, nbf: false })) as unknown as OAuthRefreshPayload;
    if (!payload || typeof payload.sub !== 'string' || typeof payload.client_id !== 'string' || typeof payload.scope !== 'string' || payload.token_type !== 'refresh' || typeof payload.iss !== 'string' || typeof payload.aud !== 'string' || typeof payload.iat !== 'number' || typeof payload.exp !== 'number' || typeof payload.jti !== 'string') {
      return null;
    }
    const now = nowSec !== undefined ? nowSec : nowSeconds();
    if (payload.exp + CLOCK_SKEW < now) return null;
    if (payload.iat - CLOCK_SKEW > now) return null;
    if (payload.exp !== payload.iat + OAUTH_REFRESH_EXPIRY) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Stateless Client Credentials
// ---------------------------------------------------------------------------

/**
 * Derive an opaque client_id (crypto.randomUUID, 36 chars). Hyphens allowed per spec pattern ^[A-Za-z0-9_-]{16,128}$.
 */
export function deriveClientId(): string {
  return crypto.randomUUID();
}

/**
 * Derive client_secret deterministically via HMAC-SHA256(JWT_SECRET, "oauth:client-secret:"+clientId) + base64url.
 * Deterministic derivation trades rotation flexibility for zero-storage verification.
 * 32-byte HMAC → 43-char base64url (256-bit entropy).
 */
export async function deriveClientSecret(clientId: string, secret: string): Promise<string> {
  if (!clientId || typeof clientId !== 'string') throw new Error('clientId required');
  if (!secret || typeof secret !== 'string' || secret.trim() === '') throw new Error('JWT_SECRET required');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const data = new TextEncoder().encode('oauth:client-secret:' + clientId);
  const sig = await crypto.subtle.sign('HMAC', key, data);
  return base64urlEncode(sig);
}

/**
 * Verify presented client_secret via re-derivation and constant-time compare.
 */
export async function verifyClientSecret(clientId: string, presented: string, secret: string): Promise<boolean> {
  if (!clientId || !presented || !secret) return false;
  try {
    const expected = await deriveClientSecret(clientId, secret);
    return constantTimeEqual(expected, presented);
  } catch {
    return false;
  }
}

/**
 * Build issuer origin dynamically from request URL: https://<host> (includes port if non-standard)
 */
export function buildIssuerOrigin(c: { req: { url: string } }): string {
  try {
    return new URL(c.req.url).origin;
  } catch {
    return 'https://localhost';
  }
}

// ---------------------------------------------------------------------------
// Google OAuth Relay State JWT (10m)
// ---------------------------------------------------------------------------

export interface GoogleOAuthStatePayload {
  type: 'google_state';
  client_id: string;
  redirect_uri: string;
  state?: string;
  code_challenge: string;
  code_challenge_method: string;
  scope: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  jti: string;
}

export async function generateGoogleOAuthState(
  params: {
    client_id: string;
    redirect_uri: string;
    state?: string;
    code_challenge: string;
    code_challenge_method?: string;
    scope: string;
  },
  secret: string,
  origin: string
): Promise<string> {
  if (!secret || typeof secret !== 'string' || secret.trim() === '') throw new Error('JWT_SECRET required');
  const iat = nowSeconds();
  const payload: GoogleOAuthStatePayload = {
    type: 'google_state',
    client_id: params.client_id,
    redirect_uri: params.redirect_uri,
    state: params.state,
    code_challenge: params.code_challenge,
    code_challenge_method: params.code_challenge_method || 'S256',
    scope: params.scope,
    iss: origin,
    aud: origin,
    iat,
    exp: iat + GOOGLE_STATE_EXPIRY,
    jti: crypto.randomUUID(),
  };
  return sign(payload as unknown as Record<string, unknown>, secret, 'HS256');
}

export async function verifyGoogleOAuthState(
  stateToken: string,
  secret: string,
  nowSec?: number
): Promise<GoogleOAuthStatePayload | null> {
  if (!stateToken || typeof stateToken !== 'string' || !secret || typeof secret !== 'string') return null;
  try {
    const payload = (await verify(stateToken.trim(), secret, { alg: 'HS256', exp: false, iat: false, nbf: false })) as unknown as GoogleOAuthStatePayload;
    if (
      !payload ||
      payload.type !== 'google_state' ||
      typeof payload.client_id !== 'string' ||
      typeof payload.redirect_uri !== 'string' ||
      typeof payload.code_challenge !== 'string' ||
      typeof payload.scope !== 'string' ||
      typeof payload.iss !== 'string' ||
      typeof payload.aud !== 'string' ||
      typeof payload.iat !== 'number' ||
      typeof payload.exp !== 'number'
    ) {
      return null;
    }
    const now = nowSec !== undefined ? nowSec : nowSeconds();
    if (payload.exp + CLOCK_SKEW < now) return null;
    if (payload.iat - CLOCK_SKEW > now) return null;
    return payload;
  } catch {
    return null;
  }
}
