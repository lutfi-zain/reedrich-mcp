import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from '../src/db/schema';
import app from '../src/index';
import { hashApiKey } from '../src/utils/token';
import { currentIsoTimestamp } from '../src/utils/date';

const TEST_JWT_SECRET = 'super-secure-test-jwt-secret-1234567890';

// -----------------------------------------------------------------------------
// D1 Mock Implementation
// -----------------------------------------------------------------------------
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
  private params: any[] = [];

  constructor(db: DatabaseSync, query: string, params: any[] = []) {
    this.db = db;
    this.query = query;
    this.params = params;
  }

  bind(...params: any[]) {
    return new MockD1PreparedStatement(this.db, this.query, params);
  }

  async all() {
    const stmt = this.db.prepare(this.query);
    const results = stmt.all(...this.params);
    return { results, success: true, meta: {} };
  }

  async get() {
    const stmt = this.db.prepare(this.query);
    const result = stmt.get(...this.params);
    return result || null;
  }

  async run() {
    const stmt = this.db.prepare(this.query);
    const info = stmt.run(...this.params);
    return { success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid } };
  }

  async raw() {
    const stmt = this.db.prepare(this.query);
    return stmt.all(...this.params).map((r: any) => Object.values(r));
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
      if (statement.trim()) sqlite.exec(statement);
    }
  }
  const mockD1 = new MockD1Database(sqlite);
  const db = drizzle(mockD1 as any, { schema });
  return { db, mockD1, sqlite };
}

describe('Reedrich OAuth 2.0 Provider Tests', () => {
  it('1. GET /oauth/authorize Form Rendering & Validation', async () => {
    const { mockD1 } = createTestDB();
    const env = { DB: mockD1 as any, JWT_SECRET: TEST_JWT_SECRET };

    // Missing redirect_uri -> 400
    const noRedirectRes = await app.fetch(new Request('http://localhost/oauth/authorize?client_id=chatgpt'), env);
    assert.equal(noRedirectRes.status, 400);

    // Valid authorize request -> 200 HTML with forms
    const authUiRes = await app.fetch(
      new Request('http://localhost/oauth/authorize?client_id=chatgpt&redirect_uri=https://chatgpt.com/aip/callback&state=test_state_123'),
      env
    );
    assert.equal(authUiRes.status, 200);
    assert.ok(authUiRes.headers.get('content-type')?.includes('text/html'));
    const htmlBody = await authUiRes.text();
    assert.ok(htmlBody.includes('Hubungkan ke Reedrich'));
    assert.ok(htmlBody.includes('Masuk dengan API Key'));
    assert.ok(htmlBody.includes('Daftar Akun Baru'));
    assert.ok(htmlBody.includes('test_state_123'));
  });

  it('2. POST /oauth/authorize Login Flow with Existing API Key', async () => {
    const { db, mockD1 } = createTestDB();
    const env = { DB: mockD1 as any, JWT_SECRET: TEST_JWT_SECRET };

    // Seed user
    const rawApiKey = 'rd_live_oauthuserkey1234567890';
    const keyHash = await hashApiKey(rawApiKey);
    const userId = 'usr_oauth_seed_1';
    await db.insert(schema.users).values({
      userId,
      userFirstName: 'Rudi',
      userLastName: 'Hartono',
      userEmail: 'rudi@example.com',
      userWhatsappNumber: '+6281299887766',
      userApiKeyHash: keyHash,
      userCreatedAt: currentIsoTimestamp(),
    });

    const formParams = new URLSearchParams({
      auth_method: 'login',
      api_key: rawApiKey,
      client_id: 'chatgpt_app',
      redirect_uri: 'https://chatgpt.com/aip/callback',
      state: 'oauth_state_xyz',
    });

    const authRes = await app.fetch(
      new Request('http://localhost/oauth/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formParams.toString(),
      }),
      env
    );

    assert.equal(authRes.status, 302);
    const location = authRes.headers.get('location') || '';
    assert.ok(location.startsWith('https://chatgpt.com/aip/callback'));
    assert.ok(location.includes('code='));
    assert.ok(location.includes('state=oauth_state_xyz'));

    // Extract authorization code
    const url = new URL(location);
    const code = url.searchParams.get('code')!;
    assert.ok(code);

    // Exchange Code for Access Token via POST /oauth/token
    const tokenRes = await app.fetch(
      new Request('http://localhost/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code,
          client_id: 'chatgpt_app',
          redirect_uri: 'https://chatgpt.com/aip/callback',
        }),
      }),
      env
    );

    assert.equal(tokenRes.status, 200);
    const tokenData = await tokenRes.json() as any;
    assert.ok(tokenData.access_token);
    assert.equal(tokenData.token_type, 'Bearer');
    assert.equal(tokenData.expires_in, 2592000); // 30 days

    // Verify access token can access /api/v1/wallets
    const testApiRes = await app.fetch(
      new Request('http://localhost/api/v1/wallets', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      }),
      env
    );
    assert.equal(testApiRes.status, 200);
  });

  it('3. POST /oauth/authorize Registration Flow for New User', async () => {
    const { db, mockD1 } = createTestDB();
    const env = { DB: mockD1 as any, JWT_SECRET: TEST_JWT_SECRET };

    const formParams = new URLSearchParams({
      auth_method: 'signup',
      first_name: 'Dewi',
      last_name: 'Sartika',
      email: 'dewi@example.com',
      whatsapp_number: '+6281355443322',
      client_id: 'chatgpt_app',
      redirect_uri: 'https://chatgpt.com/aip/callback',
      state: 'state_dewi_123',
    });

    const authRes = await app.fetch(
      new Request('http://localhost/oauth/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formParams.toString(),
      }),
      env
    );

    assert.equal(authRes.status, 302);
    const location = authRes.headers.get('location') || '';
    assert.ok(location.includes('code='));
    assert.ok(location.includes('state=state_dewi_123'));

    // Check that user was inserted in D1 database
    const userInDb = await db.select().from(schema.users).where(eq(schema.users.userEmail, 'dewi@example.com')).get();
    assert.ok(userInDb);
    assert.equal(userInDb.userFirstName, 'Dewi');

    // Exchange token
    const url = new URL(location);
    const code = url.searchParams.get('code')!;

    const tokenRes = await app.fetch(
      new Request('http://localhost/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code,
        }),
      }),
      env
    );

    assert.equal(tokenRes.status, 200);
    const tokenData = await tokenRes.json() as any;
    assert.ok(tokenData.access_token);
  });

  it('4. Negative Validations on /oauth/token', async () => {
    const { mockD1 } = createTestDB();
    const env = { DB: mockD1 as any, JWT_SECRET: TEST_JWT_SECRET };

    // Invalid grant_type
    const invalidGrantRes = await app.fetch(
      new Request('http://localhost/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grant_type: 'client_credentials' }),
      }),
      env
    );
    assert.equal(invalidGrantRes.status, 400);

    // Invalid code
    const invalidCodeRes = await app.fetch(
      new Request('http://localhost/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code: 'invalid_code_12345',
        }),
      }),
      env
    );
    assert.equal(invalidCodeRes.status, 400);
    const errData = await invalidCodeRes.json() as any;
    assert.equal(errData.error, 'invalid_grant');
  });
});
