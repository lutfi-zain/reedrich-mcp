import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from '../src/db/schema';
import app from '../src/index';
import { computeS256Challenge } from '../src/utils/pkce';
import {
  generateGoogleOAuthState,
  verifyGoogleOAuthState,
  verifyAuthorizationCode,
  DEFAULT_GOOGLE_CLIENT_ID,
  DEFAULT_GOOGLE_CLIENT_SECRET,
} from '../src/utils/oauth';

const TEST_JWT_SECRET = 'super-secure-test-jwt-secret-1234567890';

class MockD1Database {
  private db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  prepare(query: string) {
    return new MockD1PreparedStatement(this.db, query);
  }

  async batch(statements: MockD1PreparedStatement[]) {
    return Promise.all(statements.map((s) => s.all()));
  }

  async exec(query: string) {
    this.db.exec(query);
    return { count: 0, duration: 0 };
  }
}

class MockD1PreparedStatement {
  private db: DatabaseSync;
  private query: string;
  private params: unknown[] = [];

  constructor(db: DatabaseSync, query: string, params: unknown[] = []) {
    this.db = db;
    this.query = query;
    this.params = params;
  }

  bind(...params: unknown[]) {
    return new MockD1PreparedStatement(this.db, this.query, params);
  }

  async all() {
    const stmt = this.db.prepare(this.query);
    const results = stmt.all(...(this.params as []));
    return { results, success: true, meta: {} };
  }

  async get() {
    const stmt = this.db.prepare(this.query);
    const result = stmt.get(...(this.params as []));
    return result || null;
  }

  async run() {
    const stmt = this.db.prepare(this.query);
    const info = stmt.run(...(this.params as []));
    return { success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid } };
  }

  async raw() {
    const stmt = this.db.prepare(this.query);
    return stmt.all(...(this.params as [])).map((r) => Object.values(r as Record<string, unknown>));
  }
}

function createTestDB() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  const migrationFiles = ['0002_table_prefixed_schema_and_tz.sql', '0003_add_debts_loans.sql'];
  for (const file of migrationFiles) {
    const ddlPath = join(__dirname, `../drizzle/${file}`);
    const ddl = readFileSync(ddlPath, 'utf-8');
    const statements = ddl.split('--> statement-breakpoint');
    for (const statement of statements) {
      const trimmed = statement.trim();
      if (trimmed) {
        sqlite.exec(trimmed);
      }
    }
  }

  const d1 = new MockD1Database(sqlite) as unknown as D1Database;
  const db = drizzle(d1, { schema });
  return { sqlite, d1, db };
}

describe('Google OAuth 2.0 Federation Tests', () => {
  it('1. Google OAuth state JWT creation and verification', async () => {
    const state = await generateGoogleOAuthState(
      {
        client_id: 'client_123',
        redirect_uri: 'https://downstream.example.com/callback',
        state: 'xyzState',
        code_challenge: 'challenge123',
        code_challenge_method: 'S256',
        scope: 'mcp',
      },
      TEST_JWT_SECRET,
      'https://reedrich-mcp.lutfidmz.workers.dev'
    );

    assert.ok(typeof state === 'string');
    const verified = await verifyGoogleOAuthState(state, TEST_JWT_SECRET);
    assert.ok(verified);
    assert.equal(verified?.client_id, 'client_123');
    assert.equal(verified?.redirect_uri, 'https://downstream.example.com/callback');
    assert.equal(verified?.state, 'xyzState');
    assert.equal(verified?.code_challenge, 'challenge123');
    assert.equal(verified?.code_challenge_method, 'S256');
    assert.equal(verified?.scope, 'mcp');

    // Invalid secret
    const badVerify = await verifyGoogleOAuthState(state, 'wrong-secret');
    assert.equal(badVerify, null);
  });

  it('2. GET /oauth/authorize renders HTML with Google Login button and Fallback API key tab', async () => {
    const { d1 } = createTestDB();
    const env = { DB: d1, JWT_SECRET: TEST_JWT_SECRET };

    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = await computeS256Challenge(verifier);

    const url = `https://reedrich-mcp.lutfidmz.workers.dev/oauth/authorize?response_type=code&client_id=client_test&redirect_uri=https://perplexity.ai/oauth/callback&scope=mcp&code_challenge=${challenge}&code_challenge_method=S256&state=state123`;
    const res = await app.request(url, { headers: { Accept: 'text/html' } }, env);

    assert.equal(res.status, 200);
    assert.ok(res.headers.get('Content-Type')?.toLowerCase().includes('text/html'));
    const html = await res.text();
    assert.ok(html.includes('Lanjutkan dengan Akun Google') || html.includes('Lanjutkan dengan Google'));
    assert.ok(html.includes('/oauth/google/start?'));
    assert.ok(html.includes('Masuk dengan API Key'));
    assert.ok(html.includes('dev-drawer'));
  });

  it('3. GET /oauth/google/start redirects (302) to Google OAuth auth endpoint with signed state', async () => {
    const { d1 } = createTestDB();
    const env = { DB: d1, JWT_SECRET: TEST_JWT_SECRET };

    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = await computeS256Challenge(verifier);

    const url = `https://reedrich-mcp.lutfidmz.workers.dev/oauth/google/start?client_id=downstream_app&redirect_uri=https://perplexity.ai/oauth/callback&state=client_state_789&code_challenge=${challenge}&code_challenge_method=S256&scope=mcp`;
    const res = await app.request(url, {}, env);

    assert.equal(res.status, 302);
    const location = res.headers.get('Location');
    assert.ok(location);
    const googleUrl = new URL(location!);
    assert.equal(googleUrl.origin, 'https://accounts.google.com');
    assert.equal(googleUrl.pathname, '/o/oauth2/v2/auth');
    assert.equal(googleUrl.searchParams.get('client_id'), DEFAULT_GOOGLE_CLIENT_ID);
    assert.equal(googleUrl.searchParams.get('redirect_uri'), 'https://reedrich-mcp.lutfidmz.workers.dev/oauth/google/callback');
    assert.equal(googleUrl.searchParams.get('response_type'), 'code');
    assert.equal(googleUrl.searchParams.get('scope'), 'openid email profile');
    assert.equal(googleUrl.searchParams.get('prompt'), 'select_account');

    const stateParam = googleUrl.searchParams.get('state');
    assert.ok(stateParam);
    const verifiedState = await verifyGoogleOAuthState(stateParam!, TEST_JWT_SECRET);
    assert.ok(verifiedState);
    assert.equal(verifiedState?.client_id, 'downstream_app');
    assert.equal(verifiedState?.redirect_uri, 'https://perplexity.ai/oauth/callback');
    assert.equal(verifiedState?.state, 'client_state_789');
    assert.equal(verifiedState?.code_challenge, challenge);
  });

  it('4. GET /oauth/google/callback upserts new user, issues auth code, and redirects downstream', async () => {
    const { d1, db } = createTestDB();
    const env = { DB: d1, JWT_SECRET: TEST_JWT_SECRET };

    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = await computeS256Challenge(verifier);

    const signedState = await generateGoogleOAuthState(
      {
        client_id: 'client_downstream',
        redirect_uri: 'https://perplexity.ai/oauth/callback',
        state: 'state_downstream_123',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        scope: 'mcp',
      },
      TEST_JWT_SECRET,
      'https://reedrich-mcp.lutfidmz.workers.dev'
    );

    // Mock global fetch for Google token and userinfo
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (urlStr.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({
          access_token: 'mock_google_access_token_123',
          token_type: 'Bearer',
          expires_in: 3600,
          id_token: 'mock_id_token',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (urlStr.includes('googleapis.com/oauth2/v3/userinfo')) {
        return new Response(JSON.stringify({
          sub: '1092837465',
          email: 'alice.google@example.com',
          email_verified: true,
          name: 'Alice Google',
          given_name: 'Alice',
          family_name: 'Google',
          picture: 'https://example.com/alice.jpg',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return originalFetch(input, init);
    };

    try {
      const callbackUrl = `https://reedrich-mcp.lutfidmz.workers.dev/oauth/google/callback?code=google_auth_code_xyz&state=${signedState}`;
      const res = await app.request(callbackUrl, {}, env);

      assert.equal(res.status, 302);
      const location = res.headers.get('Location');
      assert.ok(location);
      const redirectUrl = new URL(location!);
      assert.equal(redirectUrl.origin, 'https://perplexity.ai');
      assert.equal(redirectUrl.pathname, '/oauth/callback');
      assert.equal(redirectUrl.searchParams.get('state'), 'state_downstream_123');

      const issuedCode = redirectUrl.searchParams.get('code');
      assert.ok(issuedCode);

      // Verify code payload
      const codePayload = await verifyAuthorizationCode(issuedCode!, TEST_JWT_SECRET);
      assert.ok(codePayload);
      assert.equal(codePayload?.client_id, 'client_downstream');
      assert.equal(codePayload?.redirect_uri, 'https://perplexity.ai/oauth/callback');
      assert.equal(codePayload?.code_challenge, challenge);

      // Verify user created in D1
      const createdUser = await db.select().from(schema.users).where(eq(schema.users.userEmail, 'alice.google@example.com')).get();
      assert.ok(createdUser);
      assert.equal(createdUser?.userId, codePayload?.sub);
      assert.equal(createdUser?.userFirstName, 'Alice');
      assert.equal(createdUser?.userLastName, 'Google');
      assert.equal(createdUser?.userWhatsappNumber, '+0');

      // Now simulate a 2nd login with existing user
      const callbackUrl2 = `https://reedrich-mcp.lutfidmz.workers.dev/oauth/google/callback?code=google_auth_code_xyz2&state=${signedState}`;
      const res2 = await app.request(callbackUrl2, {}, env);
      assert.equal(res2.status, 302);
      const redirectUrl2 = new URL(res2.headers.get('Location')!);
      const code2 = redirectUrl2.searchParams.get('code');
      const payload2 = await verifyAuthorizationCode(code2!, TEST_JWT_SECRET);
      assert.equal(payload2?.sub, createdUser?.userId, 'Should resolve the same userId for existing user');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('5. GET /oauth/google/callback handles error query parameters and Google fetch errors gracefully', async () => {
    const { d1 } = createTestDB();
    const env = { DB: d1, JWT_SECRET: TEST_JWT_SECRET };

    const signedState = await generateGoogleOAuthState(
      {
        client_id: 'client_downstream',
        redirect_uri: 'https://perplexity.ai/oauth/callback',
        state: 'state_err_test',
        code_challenge: 'challenge',
        code_challenge_method: 'S256',
        scope: 'mcp',
      },
      TEST_JWT_SECRET,
      'https://reedrich-mcp.lutfidmz.workers.dev'
    );

    // 5.1 Google returns error parameter
    const errorCallbackUrl = `https://reedrich-mcp.lutfidmz.workers.dev/oauth/google/callback?error=access_denied&error_description=User+cancelled&state=${signedState}`;
    const resErr = await app.request(errorCallbackUrl, {}, env);
    assert.equal(resErr.status, 302);
    const errRedirect = new URL(resErr.headers.get('Location')!);
    assert.equal(errRedirect.searchParams.get('error'), 'access_denied');
    assert.equal(errRedirect.searchParams.get('error_description'), 'User cancelled');
    assert.equal(errRedirect.searchParams.get('state'), 'state_err_test');

    // 5.2 Invalid state
    const badStateRes = await app.request('https://reedrich-mcp.lutfidmz.workers.dev/oauth/google/callback?code=123&state=bad.jwt.token', {}, env);
    assert.equal(badStateRes.status, 400);

    // 5.3 Google token exchange failure
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (): Promise<Response> => {
      return new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Bad code' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    try {
      const failCallbackUrl = `https://reedrich-mcp.lutfidmz.workers.dev/oauth/google/callback?code=bad_code&state=${signedState}`;
      const resFail = await app.request(failCallbackUrl, {}, env);
      assert.equal(resFail.status, 302);
      const failRedirect = new URL(resFail.headers.get('Location')!);
      assert.equal(failRedirect.searchParams.get('error'), 'access_denied');
      assert.equal(failRedirect.searchParams.get('error_description'), 'Bad code');
      assert.equal(failRedirect.searchParams.get('state'), 'state_err_test');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
