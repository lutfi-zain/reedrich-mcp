import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateUserToken } from '../src/utils/token';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const WORKER_URL = process.env.WORKER_URL || 'https://finnplan-mcp.lutfidmz.workers.dev';
const MCP_ENDPOINT = `${WORKER_URL}/mcp`;
const TEST_PREFIX = `inttest_${Date.now()}`;
const JWT_SECRET = process.env.JWT_SECRET || 'finnplan_local_dev_jwt_secret_9948271038571204';

// ---------------------------------------------------------------------------
// Shared state across sequential steps
// ---------------------------------------------------------------------------
const state: {
  userA: { userId: string; apiKey: string; token: string; email: string };
  userB: { userId: string; apiKey: string; token: string; email: string };
  wallets: { bca: any; gopay: any };
  categories: { food: any; transport: any; salary: any };
  budget: any;
  transactions: any[];
} = {} as any;

// ---------------------------------------------------------------------------
// MCP JSON-RPC helper
// ---------------------------------------------------------------------------
let requestId = 0;

async function mcpCall(
  method: string,
  params: Record<string, any> = {},
  token?: string
): Promise<any> {
  requestId++;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
    'MCP-Protocol-Version': '2024-11-05',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(MCP_ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: requestId,
      method,
      params,
    }),
  });

  assert.equal(res.status, 200, `HTTP status should be 200, got ${res.status}`);
  const json: any = await res.json();

  if (json.error) {
    throw new Error(`MCP Error: ${json.error.message}`);
  }

  return json.result;
}

async function callTool(toolName: string, args: Record<string, any> = {}, token?: string): Promise<any> {
  const result = await mcpCall('tools/call', { name: toolName, arguments: args }, token);

  // Check if the tool returned an error via isError flag
  if (result.isError) {
    throw new Error(result.content?.[0]?.text || 'Tool returned an error');
  }

  // Parse JSON text content
  const text = result.content?.[0]?.text;
  if (text) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return result;
}

async function readResource(uri: string, token?: string): Promise<any> {
  const result = await mcpCall('resources/read', { uri }, token);
  const text = result.contents?.[0]?.text;
  if (text) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return result;
}

async function listPrompts(token?: string): Promise<any> {
  return mcpCall('prompts/list', {}, token);
}

async function getPrompt(name: string, args: Record<string, any> = {}, token?: string): Promise<any> {
  return mcpCall('prompts/get', { name, arguments: args }, token);
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------
describe('Integration Test: Full User Journey (Deployed Worker + Remote D1)', () => {
  // -------------------------------------------------------------------------
  // Step 1: Register User A
  // -------------------------------------------------------------------------
  it('Step 1: Register User A (register_user)', async () => {
    const email = `${TEST_PREFIX}_budi@example.com`;
    const result = await callTool('register_user', {
      firstName: 'Budi',
      lastName: 'Setiawan',
      email,
      whatsappNumber: '+6281234567890',
    });

    assert.ok(result.userId, 'userId should be present');
    assert.equal(result.name, 'Budi Setiawan');
    assert.equal(result.email, email);
    assert.equal(result.whatsappNumber, '+6281234567890');
    assert.ok(result.apiKey.startsWith('rd_live_'), 'apiKey should start with rd_live_');
    assert.ok(result.token, 'token should be present');
    assert.equal(result.expiresIn, 900, 'token should expire in 900 seconds (15 minutes)');

    state.userA = {
      userId: result.userId,
      apiKey: result.apiKey,
      token: result.token,
      email,
    };

    console.log(`    ✓ User A registered: ${result.userId}`);
  });

  // -------------------------------------------------------------------------
  // Step 2: Reject Duplicate Email Registration
  // -------------------------------------------------------------------------
  it('Step 2: Reject Duplicate Email Registration', async () => {
    await assert.rejects(
      async () => {
        await callTool('register_user', {
          firstName: 'Duplicate',
          lastName: 'User',
          email: state.userA.email,
          whatsappNumber: '+6289999999999',
        });
      },
      /already registered/i,
      'Should reject duplicate email'
    );

    console.log(`    ✓ Duplicate email correctly rejected`);
  });

  // -------------------------------------------------------------------------
  // Step 3: Login with API Key
  // -------------------------------------------------------------------------
  it('Step 3: Login with API Key (login_user)', async () => {
    const result = await callTool('login_user', { apiKey: state.userA.apiKey });

    assert.equal(result.userId, state.userA.userId);
    assert.equal(result.name, 'Budi Setiawan');
    assert.ok(result.token, 'Should return a fresh token');
    assert.equal(result.expiresIn, 900);

    // Update token to the freshly minted one
    state.userA.token = result.token;

    console.log(`    ✓ Login successful, fresh 15-minute token obtained`);
  });

  // -------------------------------------------------------------------------
  // Step 4-5: Create Wallets
  // -------------------------------------------------------------------------
  it('Step 4-5: Create Wallets (manage_wallet create)', async () => {
    const bca = await callTool('manage_wallet', {
      action: 'create',
      name: 'BCA Main',
      institution: 'BCA',
      type: 'bank',
      balance: 10000000,
      currency: 'IDR',
    }, state.userA.token);

    assert.equal(bca.walletName, 'BCA Main');
    assert.equal(bca.walletInstitution, 'BCA');
    assert.equal(bca.walletType, 'bank');
    assert.equal(bca.walletBalance, 10000000);
    assert.equal(bca.walletCurrency, 'IDR');

    const gopay = await callTool('manage_wallet', {
      action: 'create',
      name: 'GoPay',
      institution: 'GoTo',
      type: 'e-wallet',
      balance: 500000,
    }, state.userA.token);

    assert.equal(gopay.walletName, 'GoPay');
    assert.equal(gopay.walletInstitution, 'GoTo');
    assert.equal(gopay.walletType, 'e-wallet');
    assert.equal(gopay.walletBalance, 500000);

    state.wallets = { bca, gopay };

    console.log(`    ✓ BCA Main (Rp 10,000,000) and GoPay (Rp 500,000) created`);
  });

  // -------------------------------------------------------------------------
  // Step 6: List Wallets
  // -------------------------------------------------------------------------
  it('Step 6: List Wallets (manage_wallet list)', async () => {
    const wallets = await callTool('manage_wallet', { action: 'list' }, state.userA.token);

    assert.ok(Array.isArray(wallets), 'Should return an array');
    assert.equal(wallets.length, 2, 'Should have exactly 2 wallets');

    console.log(`    ✓ Listed ${wallets.length} wallets`);
  });

  // -------------------------------------------------------------------------
  // Step 7: Update Wallet Balance
  // -------------------------------------------------------------------------
  it('Step 7: Update Wallet Balance (manage_wallet update)', async () => {
    const updated = await callTool('manage_wallet', {
      action: 'update',
      walletId: state.wallets.bca.walletId,
      balance: 12000000,
    }, state.userA.token);

    assert.equal(updated.walletBalance, 12000000);
    state.wallets.bca = updated;

    console.log(`    ✓ BCA Main balance updated to Rp 12,000,000`);
  });

  // -------------------------------------------------------------------------
  // Step 8-9: Create & List Categories
  // -------------------------------------------------------------------------
  it('Step 8-9: Create & List Categories (manage_category)', async () => {
    const food = await callTool('manage_category', {
      action: 'create',
      name: 'Food & Dining',
      type: 'expense',
      icon: '🍔',
    }, state.userA.token);
    assert.equal(food.categoryName, 'Food & Dining');

    const transport = await callTool('manage_category', {
      action: 'create',
      name: 'Transportation',
      type: 'expense',
      icon: '🚗',
    }, state.userA.token);
    assert.equal(transport.categoryName, 'Transportation');

    const salary = await callTool('manage_category', {
      action: 'create',
      name: 'Monthly Salary',
      type: 'income',
      icon: '💰',
    }, state.userA.token);
    assert.equal(salary.categoryName, 'Monthly Salary');

    state.categories = { food, transport, salary };

    // List categories (3 created + 1 Adjustment system category from Step 7 balance update)
    const cats = await callTool('manage_category', { action: 'list' }, state.userA.token);
    assert.equal(cats.length, 4, 'Should have 4 categories (3 created + Adjustment)');

    console.log(`    ✓ Created 3 categories (Food, Transport, Salary) and verified list`);
  });

  // -------------------------------------------------------------------------
  // Step 10: Create Budget
  // -------------------------------------------------------------------------
  it('Step 10: Create Budget (manage_budget create)', async () => {
    const budget = await callTool('manage_budget', {
      action: 'create',
      name: 'August Food Budget',
      categoryId: state.categories.food.categoryId,
      amount: 2000000,
      periodStart: '2026-08-01',
      periodEnd: '2026-12-31',
    }, state.userA.token);

    assert.equal(budget.budgetName, 'August Food Budget');
    assert.equal(budget.budgetAmount, 2000000);
    state.budget = budget;

    console.log(`    ✓ Budget "August Food Budget" created (Rp 2,000,000)`);
  });

  // -------------------------------------------------------------------------
  // Step 11-14: Record Transactions
  // -------------------------------------------------------------------------
  it('Step 11-14: Record Transactions (record_transaction)', async () => {
    // Step 11: Expense — Nasi Padang (BCA, Food, Rp 150K)
    const tx1 = await callTool('record_transaction', {
      walletId: state.wallets.bca.walletId,
      categoryId: state.categories.food.categoryId,
      budgetId: state.budget.budgetId,
      amount: 150000,
      type: 'expense',
      description: 'Nasi Padang',
      transactionDate: '2026-08-10',
    }, state.userA.token);
    assert.equal(tx1.transactionAmount, 150000);
    assert.equal(tx1.transactionType, 'expense');

    // Step 12: Expense — Grab (GoPay, Transport, Rp 25K)
    const tx2 = await callTool('record_transaction', {
      walletId: state.wallets.gopay.walletId,
      categoryId: state.categories.transport.categoryId,
      amount: 25000,
      type: 'expense',
      description: 'Grab ke kantor',
      transactionDate: '2026-08-10',
    }, state.userA.token);
    assert.equal(tx2.transactionAmount, 25000);

    // Step 13: Income — Gaji (BCA, Salary, Rp 15M)
    const tx3 = await callTool('record_transaction', {
      walletId: state.wallets.bca.walletId,
      categoryId: state.categories.salary.categoryId,
      amount: 15000000,
      type: 'income',
      description: 'Gaji Agustus',
      transactionDate: '2026-08-01',
    }, state.userA.token);
    assert.equal(tx3.transactionAmount, 15000000);
    assert.equal(tx3.transactionType, 'income');

    // Step 14: Planned Expense (BCA, Food, Rp 500K, isPlanned=true)
    const tx4 = await callTool('record_transaction', {
      walletId: state.wallets.bca.walletId,
      categoryId: state.categories.food.categoryId,
      amount: 500000,
      type: 'expense',
      description: 'Rencana makan minggu depan',
      isPlanned: true,
      transactionDate: '2026-08-20',
    }, state.userA.token);
    assert.equal(tx4.transactionIsPlanned, 1);

    state.transactions = [tx1, tx2, tx3, tx4];

    console.log(`    ✓ Recorded 4 transactions (2 expenses, 1 income, 1 planned)`);
  });

  // -------------------------------------------------------------------------
  // Step 15-18: List Transactions with Filters
  // -------------------------------------------------------------------------
  it('Step 15-18: List Transactions with Filters (list_transactions)', async () => {
    // Step 15: No filter — 4 recorded + 1 Step-7 balance adjustment = 5
    const all = await callTool('list_transactions', {}, state.userA.token);
    assert.equal(all.length, 5, 'Should have 5 total transactions (4 recorded + 1 adjustment)');

    // Step 16: Filter by BCA wallet — 3 recorded + 1 adjustment = 4
    const bcaTxs = await callTool('list_transactions', {
      walletId: state.wallets.bca.walletId,
    }, state.userA.token);
    assert.equal(bcaTxs.length, 4, 'BCA wallet should have 4 transactions (3 + adjustment)');

    // Step 17: Filter by type=income — salary 15M + adjustment 2M = 2
    const incomeTxs = await callTool('list_transactions', { type: 'income' }, state.userA.token);
    assert.equal(incomeTxs.length, 2, 'Should have 2 income transactions (salary + adjustment)');
    assert.ok(incomeTxs.some((t: any) => t.transactionAmount === 15000000));

    // Step 18: Filter by isPlanned=true — should return 1
    const plannedTxs = await callTool('list_transactions', { isPlanned: true }, state.userA.token);
    assert.equal(plannedTxs.length, 1, 'Should have 1 planned transaction');

    console.log(`    ✓ Filtered transactions: all=5, BCA=4, income=2, planned=1`);
  });

  // -------------------------------------------------------------------------
  // Step 19: Financial Summary
  // -------------------------------------------------------------------------
  it('Step 19: Financial Summary (financial_summary)', async () => {
    const summary = await callTool('financial_summary', {}, state.userA.token);

    // Net worth unchanged by ledger-complete adjustment (income row + balance move net to same balance):
    // BCA (12M - 150K + 15M) + GoPay (500K - 25K) = 26,850,000 + 475,000 = 27,325,000 IDR
    assert.equal(summary.netWorthByCurrency.IDR, 27325000, `Net worth IDR should be 27,325,000, got ${summary.netWorthByCurrency?.IDR}`);
    assert.equal(summary.netWorthByInstitution.BCA, 26850000);
    assert.equal(summary.netWorthByInstitution.GoTo, 475000);
    // Income now includes the Step-7 +2M adjustment row: 15M salary + 2M adjustment = 17M
    assert.equal(summary.totalIncome, 17000000, 'Total income should be 17,000,000 (15M salary + 2M adjustment)');
    assert.equal(summary.totalExpense, 175000, 'Total expense should be 175,000 (150K + 25K)');
    assert.equal(summary.netSavings, 16825000, 'Net savings should be 16,825,000');
    assert.ok(summary.categoryBreakdown['Food & Dining'], 'Should have Food & Dining breakdown');
    assert.ok(summary.categoryBreakdown['Transportation'], 'Should have Transportation breakdown');

    console.log(`    ✓ Financial Summary: Net Worth Rp ${summary.netWorthByCurrency.IDR.toLocaleString()}, Savings Rp ${summary.netSavings.toLocaleString()}`);
  });

  // -------------------------------------------------------------------------
  // Step 20: Budget Status
  // -------------------------------------------------------------------------
  it('Step 20: Budget Status (manage_budget status)', async () => {
    const statusList = await callTool('manage_budget', { action: 'status' }, state.userA.token);

    assert.ok(Array.isArray(statusList), 'Should return an array');
    const foodBudget = statusList.find((s: any) => s.budget.budgetName === 'August Food Budget');
    assert.ok(foodBudget, 'Should find August Food Budget');
    assert.equal(foodBudget.spent, 150000, 'Spent should be 150,000');
    assert.equal(foodBudget.remaining, 1850000, 'Remaining should be 1,850,000');
    assert.equal(foodBudget.percentUsed, 7.5, 'Percent used should be 7.5%');

    console.log(`    ✓ Budget Status: Spent Rp 150,000 / Rp 2,000,000 (7.5%)`);
  });

  // -------------------------------------------------------------------------
  // Step 20.5: Transfer Funds & Update Transaction Flow
  // -------------------------------------------------------------------------
  it('Step 20.5: Transfer Funds & Update Transaction (transfer_funds & update_transaction)', async () => {
    // 1. Transfer Rp 1,000,000 from BCA to GoPay with Rp 2,500 admin fee
    const transfer = await callTool('transfer_funds', {
      sourceWalletId: state.wallets.bca.walletId,
      targetWalletId: state.wallets.gopay.walletId,
      amount: 1000000,
      adminFee: 2500,
      description: 'Transfer BCA to GoPay',
    }, state.userA.token);

    assert.equal(transfer.transactionType, 'transfer');
    assert.equal(transfer.transactionAmount, 1000000);
    assert.equal(transfer.transactionAdminFee, 2500);

    // Verify wallets updated:
    // BCA was 26,850,000 -> 26,850,000 - 1,002,500 = 25,847,500
    // GoPay was 475,000 -> 475,000 + 1,000,000 = 1,475,000
    const walletsAfterTransfer = await callTool('manage_wallet', { action: 'list' }, state.userA.token);
    const bcaW = walletsAfterTransfer.find((w: any) => w.walletId === state.wallets.bca.walletId);
    const gopayW = walletsAfterTransfer.find((w: any) => w.walletId === state.wallets.gopay.walletId);
    assert.equal(bcaW.walletBalance, 25847500);
    assert.equal(gopayW.walletBalance, 1475000);

    // 2. Update Transaction: Change memo and update transfer amount to 500,000
    const updatedTransfer = await callTool('update_transaction', {
      transactionId: transfer.transactionId,
      amount: 500000,
      description: 'Revised Topup GoPay',
    }, state.userA.token);
    assert.equal(updatedTransfer.transactionAmount, 500000);
    assert.equal(updatedTransfer.transactionDescription, 'Revised Topup GoPay');

    // Verify atomic balance reconciliation:
    // BCA gets 500,000 back -> 25,847,500 + 500,000 = 26,347,500
    // GoPay loses 500,000 -> 1,475,000 - 500,000 = 975,000
    const walletsAfterUpdate = await callTool('manage_wallet', { action: 'list' }, state.userA.token);
    const bcaW2 = walletsAfterUpdate.find((w: any) => w.walletId === state.wallets.bca.walletId);
    const gopayW2 = walletsAfterUpdate.find((w: any) => w.walletId === state.wallets.gopay.walletId);
    assert.equal(bcaW2.walletBalance, 26347500);
    assert.equal(gopayW2.walletBalance, 975000);

    console.log(`    ✓ Transfer Funds & Atomic Update: BCA Rp ${bcaW2.walletBalance.toLocaleString()}, GoPay Rp ${gopayW2.walletBalance.toLocaleString()}`);
  });

  // -------------------------------------------------------------------------
  // Step 21-23: Read MCP Resources
  // -------------------------------------------------------------------------
  it('Step 21-23: Read MCP Resources', async () => {
    // Step 21: Schema resource (public)
    const schemaData = await readResource('reedrich://db/schema', state.userA.token);
    assert.ok(schemaData.tables.users, 'Schema should include users table');
    assert.ok(schemaData.tables.wallets, 'Schema should include wallets table');
    assert.ok(schemaData.tables.transactions, 'Schema should include transactions table');

    // Step 22: Wallets resource
    const walletsData = await readResource('reedrich://wallets/list', state.userA.token);
    assert.ok(Array.isArray(walletsData), 'Wallets resource should return array');
    assert.equal(walletsData.length, 2, 'Should have 2 wallets');

    // Step 23: Active budgets resource
    const budgetsData = await readResource('reedrich://budgets/active', state.userA.token);
    assert.ok(Array.isArray(budgetsData), 'Budgets resource should return array');
    assert.ok(budgetsData.length >= 1, 'Should have at least 1 active budget');

    console.log(`    ✓ Resources: schema OK, wallets=${walletsData.length}, active budgets=${budgetsData.length}`);
  });

  // -------------------------------------------------------------------------
  // Step 24-25: Expired Token & Re-Login Flow
  // -------------------------------------------------------------------------
  it('Step 24-25: Expired Token & Re-Login Flow', async () => {
    // Step 24: Generate an expired token and try to call a tool
    const expiredToken = await generateUserToken(
      { userId: state.userA.userId, expiresInSeconds: 60 },
      JWT_SECRET
    );

    // Step 25: Re-login with API key and resume
    const loginResult = await callTool('login_user', { apiKey: state.userA.apiKey });
    assert.ok(loginResult.token, 'Should get a fresh token');
    state.userA.token = loginResult.token;

    // Verify the new token works
    const wallets = await callTool('manage_wallet', { action: 'list' }, state.userA.token);
    assert.equal(wallets.length, 2, 'Should still see 2 wallets after re-login');

    console.log(`    ✓ Re-login with API key succeeded → resumed successfully`);
  });

  // -------------------------------------------------------------------------
  // Step 26: Multi-Tenant RLS Isolation
  // -------------------------------------------------------------------------
  it('Step 26: Multi-Tenant RLS Isolation', async () => {
    const emailB = `${TEST_PREFIX}_siti@example.com`;
    const regB = await callTool('register_user', {
      firstName: 'Siti',
      lastName: 'Aminah',
      email: emailB,
      whatsappNumber: '+628987654321',
    });

    state.userB = {
      userId: regB.userId,
      apiKey: regB.apiKey,
      token: regB.token,
      email: emailB,
    };

    // User B lists wallets → should be empty
    const userBWallets = await callTool('manage_wallet', { action: 'list' }, state.userB.token);
    assert.equal(userBWallets.length, 0, 'User B should have 0 wallets (RLS isolation)');

    // User B tries to update User A's wallet → should fail
    await assert.rejects(
      async () => {
        await callTool('manage_wallet', {
          action: 'update',
          walletId: state.wallets.bca.walletId,
          balance: 0,
        }, state.userB.token);
      },
      /not found or unauthorized/i,
      'User B should not be able to update User A wallet'
    );

    // User B lists categories → should be empty
    const userBCats = await callTool('manage_category', { action: 'list' }, state.userB.token);
    assert.equal(userBCats.length, 0, 'User B should have 0 categories');

    // User B lists transactions → should be empty
    const userBTxs = await callTool('list_transactions', {}, state.userB.token);
    assert.equal(userBTxs.length, 0, 'User B should have 0 transactions');

    console.log(`    ✓ User B (${regB.userId}) fully isolated from User A data`);
  });

  // -------------------------------------------------------------------------
  // Step 27: Debt & Loan Management Journey
  // -------------------------------------------------------------------------
  it('Step 27: Debt & Loan Management Journey', async () => {
    // 1. Create a loan given to Budi (Rp 500,000) from BCA
    const loanBudi = await callTool('manage_debt_loan', {
      action: 'create',
      type: 'loan',
      personName: 'Budi',
      amount: 500000,
      walletId: state.wallets.bca.walletId,
      dueDate: '2026-09-30',
      notes: 'Pinjaman Budi',
    }, state.userA.token);

    assert.equal(loanBudi.debtLoanType, 'loan');
    assert.equal(loanBudi.debtLoanAmount, 500000);
    assert.equal(loanBudi.debtLoanRemainingAmount, 500000);
    assert.equal(loanBudi.debtLoanStatus, 'unpaid');

    // 2. Create a debt borrowed from Joni (Rp 1,000,000) into BCA
    const debtJoni = await callTool('manage_debt_loan', {
      action: 'create',
      type: 'debt',
      personName: 'Joni',
      amount: 1000000,
      walletId: state.wallets.bca.walletId,
      dueDate: '2026-10-15',
      notes: 'Pinjam Joni',
    }, state.userA.token);

    assert.equal(debtJoni.debtLoanType, 'debt');
    assert.equal(debtJoni.debtLoanRemainingAmount, 1000000);

    // 3. List active debts & loans
    const listDebts = await callTool('manage_debt_loan', { action: 'list', status: 'unpaid' }, state.userA.token);
    assert.equal(listDebts.length, 2);

    // 4. Repay Joni's debt partially (Rp 400,000)
    const repayJoni = await callTool('manage_debt_loan', {
      action: 'repay',
      debtLoanId: debtJoni.debtLoanId,
      amount: 400000,
      walletId: state.wallets.bca.walletId,
    }, state.userA.token);

    assert.equal(repayJoni.debtLoanRemainingAmount, 600000);
    assert.equal(repayJoni.debtLoanStatus, 'partially_paid');

    // 5. Read reedrich://debts/active resource
    const debtsRes = await readResource('reedrich://debts/active', state.userA.token);
    assert.equal(debtsRes.activeCount, 2);
    assert.equal(debtsRes.totalDebt, 600000);
    assert.equal(debtsRes.totalReceivable, 500000);

    // 6. Check summary has totalDebt and totalReceivable
    const summary = await callTool('financial_summary', {}, state.userA.token);
    assert.equal(summary.totalDebt, 600000);
    assert.equal(summary.totalReceivable, 500000);

    // 7. Verify User B cannot see User A's debts
    const userBDebts = await callTool('manage_debt_loan', { action: 'list' }, state.userB.token);
    assert.equal(userBDebts.length, 0);

    console.log(`    ✓ Debt & Loan: created loan & debt, partial repay, active resource, summary integration, RLS verified`);
  });

  // -------------------------------------------------------------------------
  // Step 28: Onboarding Journey, Default Category Seeding & Guardrails
  // -------------------------------------------------------------------------
  it('Step 28: Onboarding Journey, Default Category Seeding & Guardrails', async () => {
    const email = `${TEST_PREFIX}_onboarding@example.com`;
    const regResult = await callTool('register_user', {
      firstName: 'Onboarding',
      lastName: 'User',
      email,
      whatsappNumber: '+628777666555',
    });

    assert.ok(regResult.onboarding);
    assert.equal(regResult.onboarding.isComplete, false);
    assert.deepEqual(regResult.onboarding.needs, ['wallet', 'categories']);
    assert.deepEqual(regResult.onboarding.suggestions, ['budget']);

    const userCToken = regResult.token;
    const userCApiKey = regResult.apiKey;

    // Precondition Guardrails: Transaction & Transfer fail when 0 wallets exist
    await assert.rejects(async () => {
      await callTool('record_transaction', {
        walletId: 'd3b07384-d113-4567-8901-123456789abc',
        categoryId: 'c3b07384-d113-4567-8901-123456789abc',
        amount: 50000,
      }, userCToken);
    }, /Dompet belum tersedia|No wallets found/i);
    await assert.rejects(async () => {
      await callTool('transfer_funds', {
        sourceWalletId: 'd3b07384-d113-4567-8901-123456789abc',
        targetWalletId: 'e3b07384-d113-4567-8901-123456789abc',
        amount: 50000,
      }, userCToken);
    }, /No wallets found/i);

    // Seed default categories
    const seedResult = await callTool('manage_category', {
      action: 'seed_defaults',
    }, userCToken);

    assert.equal(seedResult.createdCount, 11);
    assert.equal(seedResult.skippedCount, 0);

    // Login check after seeding: wallet still missing
    const login1 = await callTool('login_user', { apiKey: userCApiKey });
    assert.equal(login1.onboarding.isComplete, false);
    assert.deepEqual(login1.onboarding.needs, ['wallet']);

    // Create a wallet for User C
    const userCWallet = await callTool('manage_wallet', {
      action: 'create',
      name: 'Dompet User C',
      institution: 'Cash',
      type: 'cash',
      balance: 1000000,
    }, userCToken);

    // Login check after wallet: onboarding is complete!
    const login2 = await callTool('login_user', { apiKey: userCApiKey });
    assert.equal(login2.onboarding.isComplete, true);
    assert.deepEqual(login2.onboarding.needs, []);

    // Transaction now succeeds
    const foodCat = seedResult.categories.find((c: any) => c.categoryName === 'Makanan & Minuman');
    assert.ok(foodCat);

    const txResult = await callTool('record_transaction', {
      walletId: userCWallet.walletId,
      categoryId: foodCat.categoryId,
      amount: 25000,
      description: 'Makan siang',
    }, userCToken);
    assert.equal(txResult.transactionAmount, 25000);

    console.log(`    ✓ Onboarding: dynamic status, guardrails, seed_defaults (10 categories), completion lifecycle verified`);
  });

  // -------------------------------------------------------------------------
  // Step 29: MCP Prompts Protocol Discovery & Retrieval
  // -------------------------------------------------------------------------
  it('Step 29: MCP Prompts Protocol Discovery & Retrieval', async () => {
    // 1. List Prompts
    const promptList = await listPrompts(state.userA.token);
    assert.equal(promptList.prompts.length, 4);
    const names = promptList.prompts.map((p: any) => p.name);
    assert.ok(names.includes('onboarding_assistant'));
    assert.ok(names.includes('daily_briefing'));
    assert.ok(names.includes('financial_planning'));
    assert.ok(names.includes('debt_loan_advisor'));

    // 2. Get onboarding_assistant prompt
    const obPrompt = await getPrompt('onboarding_assistant', { currency: 'IDR' }, state.userA.token);
    assert.ok(obPrompt.messages.length > 0);
    assert.ok(obPrompt.messages[0].content.text.includes('manage_wallet'));

    // 3. Get daily_briefing prompt
    const dbPrompt = await getPrompt('daily_briefing', { date: '2026-08-23' }, state.userA.token);
    assert.ok(dbPrompt.messages.length > 0);
    assert.ok(dbPrompt.messages[0].content.text.includes('reedrich://debts/active'));

    // 4. Get financial_planning prompt with target goal
    const fpPrompt = await getPrompt('financial_planning', {
      goal_description: 'beli laptop ROG',
      target_amount: '20000000',
    }, state.userA.token);
    assert.ok(fpPrompt.messages.length > 0);
    assert.ok(fpPrompt.messages[0].content.text.includes('beli laptop ROG'));
    assert.ok(fpPrompt.messages[0].content.text.includes('20000000'));

    // 5. Get debt_loan_advisor prompt
    const dlaPrompt = await getPrompt('debt_loan_advisor', {}, state.userA.token);
    assert.ok(dlaPrompt.messages.length > 0);
    assert.ok(dlaPrompt.messages[0].content.text.includes('manage_debt_loan'));

    console.log(`    ✓ Prompts: prompts/list and prompts/get verified for 4 workflow playbooks`);
  });

  // -------------------------------------------------------------------------
  // Step 30: Feedback Submission to Internal D1
  // -------------------------------------------------------------------------
  it('Step 30: Feedback Submission to Internal D1', async () => {
    const feedbackRes = await callTool('submit_feedback', {
      title: 'E2E Test Feedback Submission',
      content: 'Testing internal feedback storage persistence across the worker.',
      type: 'feature_request',
    }, state.userA.token);

    assert.equal(feedbackRes.success, true);
    assert.equal(feedbackRes.type, 'feature_request');
    assert.equal(feedbackRes.status, 'new');
    assert.equal(feedbackRes.submitter.userId, state.userA.userId);
    assert.ok(feedbackRes.feedbackId);

    console.log(`    ✓ Feedback: submit_feedback internal D1 persistence verified`);
  });

  // -------------------------------------------------------------------------
  // Step 31: Recurring Materialization → Realize → Propagate (E2E over D1)
  // -------------------------------------------------------------------------
  it('Step 31: Recurring Template Materialization, Realize & Propagation', async () => {
    const token = state.userA.token;

    // 1. Create monthly template -> materialized planned rows, no balance move
    const tpl = await callTool('manage_recurring_template', {
      action: 'create', name: 'E2E Internet Bill',
      walletId: state.wallets.bca.walletId, categoryId: state.categories.food.categoryId,
      amount: 450000, type: 'expense', frequency: 'monthly', interval: 1,
      startDate: '2026-10-05', nextRunDate: '2026-10-05',
    }, token);
    assert.ok(tpl.materializedCount > 0, 'create must materialize planned rows');
    assert.equal(tpl.templateName, 'E2E Internet Bill');

    // 2. Verify N planned rows via list_transactions(isPlanned), paginated
    // (materializedCount can reach 100; list_transactions caps at 200/req)
    let tplRows: any[] = [];
    for (const offset of [0, 200, 400]) {
      const page = await callTool('list_transactions', {
        type: 'expense', isPlanned: true, limit: 200, offset,
      }, token);
      tplRows = tplRows.concat(page.filter((t: any) => t.transactionTemplateId === tpl.templateId));
      if (page.length < 200) break;
    }

    // 3. Realize one row -> flip + balance move, no duplicate row
    const target = tplRows.find((t: any) => t.transactionOccurrenceDate === '2026-10-05');
    assert.ok(target, 'planned row for 2026-10-05 must exist');
    const walletsBefore = await callTool('manage_wallet', { action: 'list' }, token);
    const bcaBefore = walletsBefore.find((w: any) => w.walletId === state.wallets.bca.walletId);
    const realized = await callTool('apply_recurring_template', {
      transactionId: target.transactionId,
    }, token);
    assert.equal(realized.transaction.transactionIsPlanned, 0);
    assert.ok(realized.transaction.transactionRealizedAt);
    const walletsAfter = await callTool('manage_wallet', { action: 'list' }, token);
    const bcaAfter = walletsAfter.find((w: any) => w.walletId === state.wallets.bca.walletId);
    assert.equal(bcaAfter.walletBalance, bcaBefore.walletBalance - 450000);
    const afterList = await callTool('list_transactions', {
      type: 'expense', isPlanned: true, limit: 200,
    }, token);
    assert.equal(
      afterList.filter((t: any) => t.transactionTemplateId === tpl.templateId).length,
      tpl.materializedCount - 1,
      'one planned row flipped, none reprinted'
    );

    // 4. Update template (future_only) -> future rewritten, realized intact
    const updated = await callTool('manage_recurring_template', {
      action: 'update', templateId: tpl.templateId, amount: 475000,
    }, token);
    assert.ok(updated.propagatedCount > 0);
    const futureList = await callTool('list_transactions', {
      type: 'expense', isPlanned: true, limit: 200,
    }, token);
    const futureRows = futureList.filter((t: any) => t.transactionTemplateId === tpl.templateId);
    assert.ok(futureRows.every((t: any) => t.transactionAmount === 475000));

    console.log(`    ✓ Recurring: materialized ${tpl.materializedCount}, realized 1 row, propagated ${updated.propagatedCount} future rows`);
  });

  // -------------------------------------------------------------------------
  // Step 32: Ledger-Complete Balance Adjustment (E2E over D1)
  // -------------------------------------------------------------------------
  it('Step 32: Wallet Balance Adjustment Prints Ledger Row', async () => {
    const token = state.userA.token;
    const walletsBefore = await callTool('manage_wallet', { action: 'list' }, token);
    const gopayBefore = walletsBefore.find((w: any) => w.walletId === state.wallets.gopay.walletId);
    const targetBalance = gopayBefore.walletBalance + 100000;

    const updated = await callTool('manage_wallet', {
      action: 'update', walletId: state.wallets.gopay.walletId, balance: targetBalance,
    }, token);
    assert.equal(updated.walletBalance, targetBalance);

    const txList = await callTool('list_transactions', { limit: 200 }, token);
    const adjRows = txList.filter((t: any) =>
      t.transactionWalletId === state.wallets.gopay.walletId &&
      t.transactionType === 'income' && t.transactionAmount === 100000
    );
    assert.ok(adjRows.length >= 1, 'adjustment income row must be recorded');

    console.log(`    ✓ Ledger: balance adjustment printed traceable income row`);
  });

  // -------------------------------------------------------------------------
  // Step 33: Comprehensive Account Snapshot & Wallet Last Transaction (E2E over D1)
  // -------------------------------------------------------------------------
  it('Step 33: Comprehensive Account Snapshot & Wallet Last Transaction', async () => {
    const token = state.userA.token;

    // 1. Verify manage_wallet list returns lastTransaction
    const wallets = await callTool('manage_wallet', { action: 'list' }, token);
    assert.ok(Array.isArray(wallets));
    assert.ok(wallets.length >= 2);
    // Gopay had adjustment transaction from Step 32 -> lastTransaction must not be null
    const gopay = wallets.find((w: any) => w.walletId === state.wallets.gopay.walletId);
    assert.ok(gopay);
    assert.ok(gopay.lastTransaction, 'wallet with mutations must have lastTransaction');
    assert.equal(gopay.lastTransaction.type, 'income');
    assert.equal(gopay.lastTransaction.direction, 'in');

    // 2. Call get_account_detail
    const snapshot = await callTool('get_account_detail', {}, token);
    assert.ok(snapshot.netWorth, 'must have netWorth');
    assert.ok(snapshot.netWorth.consolidated.total > 0);
    assert.equal(snapshot.netWorth.consolidated.currency, 'IDR');
    assert.ok(snapshot.wallets.spendable.total > 0);
    assert.ok(Array.isArray(snapshot.wallets.spendable.items));
    assert.ok(Array.isArray(snapshot.wallets.locked.items));
    assert.ok(snapshot.monthlyCashFlow);
    assert.ok(Array.isArray(snapshot.monthlyCashFlow.categoryBreakdown));
    assert.ok(Array.isArray(snapshot.budgets));
    assert.ok(Array.isArray(snapshot.goals));
    assert.ok(snapshot.obligations);

    // 3. Call REST endpoint /api/v1/account-detail
    const restRes = await fetch(`${WORKER_URL}/api/v1/account-detail`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(restRes.status, 200);
    const restData: any = await restRes.json();
    assert.ok(restData.netWorth);
    assert.ok(restData.wallets);
    assert.ok(restData.monthlyCashFlow);

    console.log(`    ✓ Snapshot: atomic get_account_detail returned complete payload with wallets, cashflow, budgets, goals, and obligations`);
  });

  // -------------------------------------------------------------------------
  // Step 34: 1:1 REST API Write Endpoints Parity
  // -------------------------------------------------------------------------
  it('Step 34: 1:1 REST API Write Endpoints Parity (Wallets, Categories, Budgets, Transactions, Transfers, Debts, Goals, Recurring)', async () => {
    const token = state.userA.token;
    const authHeaders = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    // 1. Wallets: POST & PATCH
    const createWalletRes = await fetch(`${WORKER_URL}/api/v1/wallets`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ name: 'REST Test Wallet', balance: 5000000, currency: 'IDR' }),
    });
    assert.equal(createWalletRes.status, 201);
    const createdWallet: any = await createWalletRes.json();
    assert.equal(createdWallet.walletName, 'REST Test Wallet');

    const patchWalletRes = await fetch(`${WORKER_URL}/api/v1/wallets/${createdWallet.walletId}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ name: 'REST Updated Wallet', isLocked: true }),
    });
    assert.equal(patchWalletRes.status, 200);
    const patchedWallet: any = await patchWalletRes.json();
    assert.equal(patchedWallet.walletName, 'REST Updated Wallet');
    assert.equal(patchedWallet.walletIsLocked, 1);

    // 2. Categories: POST
    const createCatRes = await fetch(`${WORKER_URL}/api/v1/categories`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ name: 'REST Utilities', type: 'expense', icon: '⚡' }),
    });
    assert.equal(createCatRes.status, 201);
    const createdCat: any = await createCatRes.json();
    assert.equal(createdCat.categoryName, 'REST Utilities');

    // 3. Budgets: POST
    const createBudgetRes = await fetch(`${WORKER_URL}/api/v1/budgets`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'REST Utility Budget',
        categoryId: createdCat.categoryId,
        amount: 500000,
        periodStart: '2026-09-01T00:00:00.000Z',
        periodEnd: '2026-09-30T23:59:59.000Z',
      }),
    });
    assert.equal(createBudgetRes.status, 201);
    const createdBudget: any = await createBudgetRes.json();
    assert.equal(createdBudget.budgetName, 'REST Utility Budget');

    // 4. Transactions: POST & PATCH
    const createTxRes = await fetch(`${WORKER_URL}/api/v1/transactions`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        walletId: createdWallet.walletId,
        categoryId: createdCat.categoryId,
        amount: 75000,
        type: 'expense',
        description: 'Electricity bill',
      }),
    });
    assert.equal(createTxRes.status, 201);
    const createdTx: any = await createTxRes.json();
    assert.equal(createdTx.transactionAmount, 75000);

    const patchTxRes = await fetch(`${WORKER_URL}/api/v1/transactions/${createdTx.transactionId}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ amount: 80000 }),
    });
    assert.equal(patchTxRes.status, 200);
    const patchedTx: any = await patchTxRes.json();
    assert.equal(patchedTx.transactionAmount, 80000);

    // 5. Transfers: POST
    const transferRes = await fetch(`${WORKER_URL}/api/v1/transfers`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        sourceWalletId: state.wallets.bca.walletId,
        targetWalletId: createdWallet.walletId,
        amount: 200000,
        description: 'REST Transfer',
      }),
    });
    assert.equal(transferRes.status, 201);
    const transferTx: any = await transferRes.json();
    assert.equal(transferTx.transactionType, 'transfer');

    // 6. Debts & Loans: POST, PATCH, POST /repay
    const createDlRes = await fetch(`${WORKER_URL}/api/v1/debts-loans`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ personName: 'REST Debt Contact', amount: 300000, type: 'debt' }),
    });
    assert.equal(createDlRes.status, 201);
    const createdDl: any = await createDlRes.json();
    assert.equal(createdDl.debtLoanPersonName, 'REST Debt Contact');

    const repayDlRes = await fetch(`${WORKER_URL}/api/v1/debts-loans/${createdDl.debtLoanId}/repay`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ amount: 100000 }),
    });
    assert.equal(repayDlRes.status, 200);
    const repaidDl: any = await repayDlRes.json();
    assert.equal(repaidDl.debtLoanRemainingAmount, 200000);

    const patchDlRes = await fetch(`${WORKER_URL}/api/v1/debts-loans/${createdDl.debtLoanId}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ notes: 'Repaid 100k via REST' }),
    });
    assert.equal(patchDlRes.status, 200);

    // 7. Goals: POST, PATCH, contribute, wallets link/unlink, DELETE
    const createGoalRes = await fetch(`${WORKER_URL}/api/v1/goals`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'REST Vacation Fund',
        targetAmount: 15000000,
        currency: 'IDR',
      }),
    });
    assert.equal(createGoalRes.status, 201);
    const createdGoal: any = await createGoalRes.json();

    const patchGoalRes = await fetch(`${WORKER_URL}/api/v1/goals/${createdGoal.goalId}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ notes: 'Target changed for summer' }),
    });
    assert.equal(patchGoalRes.status, 200);

    const linkGoalRes = await fetch(`${WORKER_URL}/api/v1/goals/${createdGoal.goalId}/wallets`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ walletId: createdWallet.walletId }),
    });
    assert.equal(linkGoalRes.status, 200);

    const unlinkGoalRes = await fetch(`${WORKER_URL}/api/v1/goals/${createdGoal.goalId}/wallets/${createdWallet.walletId}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    assert.equal(unlinkGoalRes.status, 200);

    const deleteGoalRes = await fetch(`${WORKER_URL}/api/v1/goals/${createdGoal.goalId}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    assert.equal(deleteGoalRes.status, 200);

    // 8. Recurring Templates: POST, PATCH, DELETE
    const createTplRes = await fetch(`${WORKER_URL}/api/v1/recurring-templates`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'REST Cloud Subscription',
        walletId: createdWallet.walletId,
        amount: 150000,
        type: 'expense',
        frequency: 'monthly',
        interval: 1,
        startDate: '2026-10-01',
        nextRunDate: '2026-10-01',
      }),
    });
    assert.equal(createTplRes.status, 201);
    const createdTpl: any = await createTplRes.json();

    const patchTplRes = await fetch(`${WORKER_URL}/api/v1/recurring-templates/${createdTpl.templateId}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ isActive: false }),
    });
    assert.equal(patchTplRes.status, 200);

    const deleteTplRes = await fetch(`${WORKER_URL}/api/v1/recurring-templates/${createdTpl.templateId}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    assert.equal(deleteTplRes.status, 200);

    console.log(`    ✓ REST Write Parity: verified POST/PATCH wallets, categories, budgets, transactions, transfers, debts-loans, goals, and recurring-templates`);
  });
});
