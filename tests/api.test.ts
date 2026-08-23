import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../src/db/schema';
import app from '../src/index';
import { generateUserToken, hashApiKey } from '../src/utils/token';
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

describe('Reedrich REST API & OpenAPI Tests', () => {
  it('1. Public Info, Health, Privacy Policy, and OpenAPI Specification Endpoints', async () => {
    const { mockD1 } = createTestDB();
    const env = { DB: mockD1 as any, JWT_SECRET: TEST_JWT_SECRET };

    // Root Info
    const rootRes = await app.fetch(new Request('http://localhost/'), env);
    assert.equal(rootRes.status, 200);
    const rootData = await rootRes.json() as any;
    assert.equal(rootData.name, 'reedrich-mcp');
    assert.ok(rootData.protocols.chatgptActions);
    assert.equal(rootData.protocols.chatgptActions.restApiBase, '/api/v1');

    // Health
    const healthRes = await app.fetch(new Request('http://localhost/health'), env);
    assert.equal(healthRes.status, 200);
    assert.equal(await healthRes.text(), 'OK');

    // Privacy Policy HTML
    const privacyRes = await app.fetch(new Request('http://localhost/privacy'), env);
    assert.equal(privacyRes.status, 200);
    assert.ok(privacyRes.headers.get('content-type')?.includes('text/html'));
    const privacyHtml = await privacyRes.text();
    assert.ok(privacyHtml.includes('Kebijakan Privasi Reedrich'));

    // OpenAPI Specification
    const openapiRes = await app.fetch(new Request('http://localhost/openapi.json'), env);
    assert.equal(openapiRes.status, 200);
    const openapiData = await openapiRes.json() as any;
    assert.equal(openapiData.openapi, '3.0.0');
    assert.ok(openapiData.paths['/api/v1/summary']);
    assert.ok(openapiData.paths['/api/v1/wallets']);
    assert.ok(openapiData.paths['/api/v1/transactions']);
    assert.ok(openapiData.paths['/api/v1/transfers']);
    assert.ok(openapiData.paths['/api/v1/debts-loans']);
    assert.ok(openapiData.components.securitySchemes.bearerAuth);
  });

  it('2. Authentication Rejection & Multi-Tenancy on REST Routes', async () => {
    const { mockD1 } = createTestDB();
    const env = { DB: mockD1 as any, JWT_SECRET: TEST_JWT_SECRET };

    // Unauthenticated GET /api/v1/wallets -> 401
    const unauthRes = await app.fetch(new Request('http://localhost/api/v1/wallets'), env);
    assert.equal(unauthRes.status, 401);
    const unauthData = await unauthRes.json() as any;
    assert.equal(unauthData.error, 'Unauthorized');

    // Invalid Token -> 401
    const invalidTokenRes = await app.fetch(
      new Request('http://localhost/api/v1/wallets', {
        headers: { Authorization: 'Bearer invalid-token-12345' },
      }),
      env
    );
    assert.equal(invalidTokenRes.status, 401);
  });

  it('3. Complete REST Flow: Wallets, Categories, Budgets, Transactions, Debts, and Summary', async () => {
    const { db, mockD1 } = createTestDB();
    const env = { DB: mockD1 as any, JWT_SECRET: TEST_JWT_SECRET };

    // Seed test user
    const userId = 'usr_rest_tester_1';
    const rawApiKey = 'rd_live_resttestkey1234567890';
    const keyHash = await hashApiKey(rawApiKey);
    await db.insert(schema.users).values({
      userId,
      userFirstName: 'Alex',
      userLastName: 'Finance',
      userEmail: 'alex@example.com',
      userWhatsappNumber: '+6281233344455',
      userApiKeyHash: keyHash,
      userCreatedAt: currentIsoTimestamp(),
    });

    const jwtToken = await generateUserToken({ userId }, TEST_JWT_SECRET);
    const authHeaders = {
      'Authorization': `Bearer ${jwtToken}`,
      'Content-Type': 'application/json',
    };

    // 1. Create Wallets
    const createBcaRes = await app.fetch(
      new Request('http://localhost/api/v1/wallets', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          name: 'BCA Utama',
          institution: 'Bank BCA',
          type: 'bank',
          balance: 10000000,
          currency: 'IDR',
        }),
      }),
      env
    );
    assert.equal(createBcaRes.status, 201);
    const bcaWallet = await createBcaRes.json() as any;
    assert.equal(bcaWallet.walletName, 'BCA Utama');
    assert.equal(bcaWallet.walletBalance, 10000000);

    const createGopayRes = await app.fetch(
      new Request('http://localhost/api/v1/wallets', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          name: 'GoPay Jajan',
          institution: 'GoPay',
          type: 'e-wallet',
          balance: 500000,
        }),
      }),
      env
    );
    assert.equal(createGopayRes.status, 201);
    const gopayWallet = await createGopayRes.json() as any;

    // List Wallets
    const listWalletsRes = await app.fetch(new Request('http://localhost/api/v1/wallets', { headers: authHeaders }), env);
    assert.equal(listWalletsRes.status, 200);
    const walletsList = await listWalletsRes.json() as any[];
    assert.equal(walletsList.length, 2);

    // 2. Seed Default Categories
    const seedCatRes = await app.fetch(
      new Request('http://localhost/api/v1/categories', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ action: 'seed_defaults' }),
      }),
      env
    );
    assert.equal(seedCatRes.status, 200);
    const seedCatData = await seedCatRes.json() as any;
    assert.equal(seedCatData.createdCount, 10);

    const listCatRes = await app.fetch(new Request('http://localhost/api/v1/categories', { headers: authHeaders }), env);
    const catList = await listCatRes.json() as any[];
    const foodCat = catList.find((c) => c.categoryName.includes('Makanan'));
    assert.ok(foodCat);

    // 3. Create Budget
    const createBudgetRes = await app.fetch(
      new Request('http://localhost/api/v1/budgets', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          name: 'Makan Bulanan',
          categoryId: foodCat.categoryId,
          amount: 2000000,
          periodStart: '2026-08-01',
          periodEnd: '2026-08-31',
        }),
      }),
      env
    );
    assert.equal(createBudgetRes.status, 201);
    const budgetData = await createBudgetRes.json() as any;
    assert.equal(budgetData.budgetName, 'Makan Bulanan');

    // 4. Record Expense Transaction
    const createTxRes = await app.fetch(
      new Request('http://localhost/api/v1/transactions', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          walletId: bcaWallet.walletId,
          categoryId: foodCat.categoryId,
          budgetId: budgetData.budgetId,
          amount: 50000,
          adminFee: 2500,
          type: 'expense',
          description: 'Makan Siang Nasi Padang',
          transactionDate: '2026-08-23T12:00:00+07:00',
        }),
      }),
      env
    );
    assert.equal(createTxRes.status, 201);
    const txData = await createTxRes.json() as any;
    assert.equal(txData.transactionAmount, 50000);

    // 5. Transfer Funds from BCA to GoPay (100,000 + 1,000 fee)
    const transferRes = await app.fetch(
      new Request('http://localhost/api/v1/transfers', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          sourceWalletId: bcaWallet.walletId,
          targetWalletId: gopayWallet.walletId,
          amount: 100000,
          adminFee: 1000,
          description: 'Topup GoPay',
        }),
      }),
      env
    );
    assert.equal(transferRes.status, 201);

    // 6. Create Debt/Loan (Borrow 1,000,000 from Bank BCA to BCA wallet)
    const createDebtRes = await app.fetch(
      new Request('http://localhost/api/v1/debts-loans', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          personName: 'Bank BCA KTA',
          type: 'debt',
          amount: 1000000,
          walletId: bcaWallet.walletId,
          dueDate: '2026-12-31',
          notes: 'Pinjaman KTA',
        }),
      }),
      env
    );
    assert.equal(createDebtRes.status, 201);
    const debtData = await createDebtRes.json() as any;
    assert.equal(debtData.debtLoanAmount, 1000000);

    // Repay Debt Partially (200,000)
    const repayRes = await app.fetch(
      new Request('http://localhost/api/v1/debts-loans/repay', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          debtLoanId: debtData.debtLoanId,
          amount: 200000,
          walletId: bcaWallet.walletId,
          notes: 'Cicilan 1',
        }),
      }),
      env
    );
    assert.equal(repayRes.status, 200);
    const repayData = await repayRes.json() as any;
    assert.equal(repayData.debtLoanRemainingAmount, 800000);

    // 7. Check Financial Summary
    const summaryRes = await app.fetch(new Request('http://localhost/api/v1/summary', { headers: authHeaders }), env);
    assert.equal(summaryRes.status, 200);
    const summary = await summaryRes.json() as any;
    assert.equal(summary.totalDebt, 800000);
    assert.equal(summary.totalAdminFees, 3500); // 2500 (expense) + 1000 (transfer)
    assert.equal(summary.transfersCount, 1);
    assert.ok(summary.netWorthByCurrency.IDR > 0);
  });
});
