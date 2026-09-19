import { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';
import { hashApiKey, verifyUserToken } from '../utils/token';
import { verifyOAuthAccessToken } from '../utils/oauth';

export interface ResolveUserOptions {
  bearerToken?: string | null;
  headerKey?: string | null;
  queryToken?: string | null;
  toolArgs?: { apiKey?: unknown; token?: unknown } | null;
}

export function extractBearerToken(authHeader?: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

async function tryResolveCandidate(
  db: DrizzleD1Database<typeof schema>,
  secret: string,
  candidate: string
): Promise<string | null> {
  const clean = candidate.trim();
  if (!clean) return null;

  // Case A: Persistent API Key (starts with rd_live_ or fp_live_)
  if (clean.startsWith('rd_live_') || clean.startsWith('fp_live_')) {
    try {
      const keyHash = await hashApiKey(clean);
      const user = await db
        .select({ userId: schema.users.userId })
        .from(schema.users)
        .where(eq(schema.users.userApiKeyHash, keyHash))
        .get();
      return user ? user.userId : null;
    } catch {
      return null;
    }
  }

  // Case B: OAuth Access Token (stateless HS256 JWT, zero D1)
  if (secret) {
    try {
      const oauth = await verifyOAuthAccessToken(clean, secret);
      if (oauth?.sub) return oauth.sub;
    } catch {
      // Continue to next verification
    }

    // Case C: Legacy Reedrich JWT Token
    try {
      const jwt = await verifyUserToken(clean, secret);
      if (jwt?.userId) return jwt.userId;
    } catch {
      // Continue to fallback
    }
  }

  // Case D: Fallback raw hash lookup (in case raw non-prefixed key was provided)
  try {
    const keyHash = await hashApiKey(clean);
    const user = await db
      .select({ userId: schema.users.userId })
      .from(schema.users)
      .where(eq(schema.users.userApiKeyHash, keyHash))
      .get();
    return user ? user.userId : null;
  } catch {
    return null;
  }
}

export async function resolveUserId(
  db: DrizzleD1Database<typeof schema>,
  secret: string,
  opts: ResolveUserOptions
): Promise<string | null> {
  const candidates: string[] = [];

  // Priority 1: Bearer token from Authorization header
  if (opts.bearerToken && typeof opts.bearerToken === 'string') {
    candidates.push(opts.bearerToken);
  }

  // Priority 2: API key from X-API-Key or mcp-api-key header
  if (opts.headerKey && typeof opts.headerKey === 'string') {
    candidates.push(opts.headerKey);
  }

  // Priority 3: Query parameter (?apiKey= or ?token=)
  if (opts.queryToken && typeof opts.queryToken === 'string') {
    candidates.push(opts.queryToken);
  }

  // Priority 4: Tool arguments fallback (args.apiKey or args.token)
  if (opts.toolArgs) {
    if (typeof opts.toolArgs.apiKey === 'string') {
      candidates.push(opts.toolArgs.apiKey);
    }
    if (typeof opts.toolArgs.token === 'string') {
      candidates.push(opts.toolArgs.token);
    }
  }

  for (const candidate of candidates) {
    const resolved = await tryResolveCandidate(db, secret, candidate);
    if (resolved) return resolved;
  }

  return null;
}
