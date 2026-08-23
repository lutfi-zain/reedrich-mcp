import { Hono, type Context } from 'hono';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from './db/schema';
import { createMCPServer } from './mcp';
import { verifyUserToken, hashApiKey } from './utils/token';
import api from './routes/api';
import oauth from './routes/oauth';
import privacy from './routes/privacy';
import { generateOpenApiSpec } from './routes/openapi';

type Bindings = {
  DB: D1Database;
  JWT_SECRET: string;
  GITHUB_TOKEN?: string;
  GITHUB_REPO?: string;
  OAUTH_CLIENT_ID?: string;
  OAUTH_CLIENT_SECRET?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// Global Security & CORS Headers
app.use('*', async (c, next) => {
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, mcp-api-key, mcp-session-id, MCP-Protocol-Version');
  c.header('Access-Control-Max-Age', '86400');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');

  if (c.req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }
  await next();
});

// Centralized Unhandled Error Handler
app.onError((err, c) => {
  console.error('[Reedrich Error]', err);
  return c.json({ error: 'Internal Server Error', message: err.message }, 500);
});

// Health check & Server info endpoint
app.get('/', (c) => {
  const origin = new URL(c.req.url).origin;
  return c.json({
    name: 'reedrich-mcp',
    status: 'ok',
    version: '1.0.0',
    description: 'Dual-Protocol Server for Reedrich — Mathematical Intelligence & Financial Planning Engine (MCP & ChatGPT Actions)',
    protocols: {
      mcp: {
        streamableHttp: '/mcp',
        sse: '/sse',
        transport: 'JSON-RPC 2.0',
      },
      chatgptActions: {
        restApiBase: '/api/v1',
        openapiSchema: '/openapi.json',
        privacyPolicy: '/privacy',
      },
      oauth: {
        authorizeUrl: `${origin}/oauth/authorize`,
        tokenUrl: `${origin}/oauth/token`,
      },
    },
    authMethods: [
      'Authorization: Bearer <rd_live_apiKey | fp_live_apiKey>',
      'Authorization: Bearer <jwt_token>',
      'X-API-Key: <rd_live_apiKey | fp_live_apiKey>',
      'OAuth 2.0 Authorization Code Flow',
      'In-tool apiKey argument',
    ],
  });
});

app.get('/health', (c) => c.text('OK'));

// Public OpenAPI 3.0 specification endpoint
app.get('/openapi.json', (c) => {
  const origin = new URL(c.req.url).origin;
  return c.json(generateOpenApiSpec(origin));
});

// Mount Routes
app.route('/api/v1', api);
app.route('/oauth', oauth);
app.route('/privacy', privacy);

// Auth helper for MCP JSON-RPC requests
async function extractAuthenticatedUserId(
  c: Context<{ Bindings: Bindings }>,
  db: DrizzleD1Database<typeof schema>
): Promise<string | null> {
  const authHeader = c.req.header('Authorization') || c.req.header('authorization');
  const apiKeyHeader =
    c.req.header('X-API-Key') ||
    c.req.header('x-api-key') ||
    c.req.header('mcp-api-key');
  const queryApiKey = c.req.query('apiKey') || c.req.query('token');

  let tokenCandidate = '';
  if (authHeader && (authHeader.startsWith('Bearer ') || authHeader.startsWith('bearer '))) {
    tokenCandidate = authHeader.slice(7).trim();
  } else if (apiKeyHeader) {
    tokenCandidate = apiKeyHeader.trim();
  } else if (queryApiKey) {
    tokenCandidate = queryApiKey.trim();
  }

  if (!tokenCandidate) return null;

  // Case A: Persistent API Key
  if (tokenCandidate.startsWith('rd_live_') || tokenCandidate.startsWith('fp_live_')) {
    try {
      const hash = await hashApiKey(tokenCandidate);
      const user = await db
        .select({ userId: schema.users.userId })
        .from(schema.users)
        .where(eq(schema.users.userApiKeyHash, hash))
        .get();
      return user ? user.userId : null;
    } catch {
      return null;
    }
  }

  // Case B: Self-Contained Signed JWT
  try {
    const jwtUser = await verifyUserToken(tokenCandidate, c.env.JWT_SECRET);
    if (jwtUser && jwtUser.userId) {
      return jwtUser.userId;
    }
  } catch {
    // Continue to fallback
  }

  // Case C: Fallback Hash
  try {
    const hash = await hashApiKey(tokenCandidate);
    const user = await db
      .select({ userId: schema.users.userId })
      .from(schema.users)
      .where(eq(schema.users.userApiKeyHash, hash))
      .get();
    return user ? user.userId : null;
  } catch {
    return null;
  }
}

// Handler for MCP requests (Stateless Streamable HTTP & SSE)
async function handleMcpRequest(c: Context<{ Bindings: Bindings }>) {
  const secret = c.env?.JWT_SECRET;
  if (!secret) {
    return c.json({ error: 'Server Misconfiguration: JWT_SECRET environment variable is missing' }, 500);
  }
  if (!c.env?.DB) {
    return c.json({ error: 'Server Misconfiguration: Database (DB) binding is missing' }, 500);
  }

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

  const db = drizzle(c.env.DB, { schema });
  const userId = await extractAuthenticatedUserId(c, db);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  const mcpServer = createMCPServer(db, userId, secret, {
    githubToken: c.env?.GITHUB_TOKEN,
    githubRepo: c.env?.GITHUB_REPO || 'lutfi-zain/reedrich-mcp',
  });
  await mcpServer.connect(transport);

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

  let parsedBody: unknown = undefined;
  if (c.req.method === 'POST') {
    try {
      parsedBody = await c.req.json();
    } catch {
      // Empty or non-JSON body
    }
  }

  const normalizedRequest = new Request(c.req.raw.url, {
    method: c.req.method,
    headers,
  });

  const response = await transport.handleRequest(normalizedRequest, { parsedBody });

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

app.all('/mcp', handleMcpRequest);
app.all('/sse', handleMcpRequest);
app.post('/', handleMcpRequest);

export default app;
