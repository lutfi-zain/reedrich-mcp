import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import {
  resolveUserFromKeyOrToken,
  listWallets,
  createWallet,
  updateWallet,
  listCategories,
  createCategory,
  seedDefaultCategories,
  listBudgets,
  createBudget,
  getBudgetStatus,
  recordTransaction,
  updateTransaction,
  listTransactions,
  transferFunds,
  createDebtLoan,
  listDebtsLoans,
  repayDebtLoan,
  updateDebtLoan,
  getFinancialSummary,
  submitFeedback,
} from "../services";

export type ApiBindings = {
  DB: D1Database;
  JWT_SECRET: string;
  GITHUB_TOKEN?: string;
  GITHUB_REPO?: string;
};

export type ApiVariables = {
  userId: string;
  user?: typeof schema.users.$inferSelect;
};

const api = new Hono<{ Bindings: ApiBindings; Variables: ApiVariables }>();

// Auth Middleware for /api/v1/* (except /feedback which can be public)
api.use("*", async (c, next) => {
  const path = c.req.path;
  const isFeedback = path.endsWith("/feedback") && c.req.method === "POST";

  const authHeader = c.req.header("Authorization") || c.req.header("authorization") || "";
  const apiKeyHeader = c.req.header("X-API-Key") || c.req.header("x-api-key") || c.req.header("mcp-api-key") || "";

  let tokenCandidate = "";
  if (authHeader.startsWith("Bearer ") || authHeader.startsWith("bearer ")) {
    tokenCandidate = authHeader.slice(7).trim();
  } else if (apiKeyHeader) {
    tokenCandidate = apiKeyHeader.trim();
  }

  const db = drizzle(c.env.DB, { schema });
  const jwtSecret = c.env.JWT_SECRET || "default-secret";

  if (tokenCandidate) {
    const resolved = await resolveUserFromKeyOrToken(db, jwtSecret, tokenCandidate);
    if (resolved?.userId) {
      c.set("userId", resolved.userId);
      if (resolved.user) c.set("user", resolved.user);
    }
  }

  const userId = c.get("userId");
  if (!userId && !isFeedback) {
    return c.json({ error: "Unauthorized", message: "Valid Bearer token or API key is required" }, 401);
  }

  await next();
});

// -----------------------------------------------------------------------------
// 1. Financial Summary
// -----------------------------------------------------------------------------
api.get("/summary", async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const userId = c.get("userId");
  const startDate = c.req.query("startDate");
  const endDate = c.req.query("endDate");

  try {
    const summary = await getFinancialSummary(db, userId, { startDate, endDate });
    return c.json(summary, 200);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return c.json({ error: message }, 400);
  }
});

// -----------------------------------------------------------------------------
// 2. Wallets
// -----------------------------------------------------------------------------
api.get("/wallets", async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const userId = c.get("userId");
  const wallets = await listWallets(db, userId);
  return c.json(wallets, 200);
});

api.post("/wallets", async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const userId = c.get("userId");

  try {
    const body = await c.req.json();
    const created = await createWallet(db, userId, body);
    return c.json(created, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Invalid payload";
    return c.json({ error: message }, 400);
  }
});

api.put("/wallets/:id", async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const userId = c.get("userId");
  const walletId = c.req.param("id");

  try {
    const body = await c.req.json();
    const updated = await updateWallet(db, userId, { ...body, walletId });
    return c.json(updated, 200);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Invalid payload";
    return c.json({ error: message }, 400);
  }
});

// -----------------------------------------------------------------------------
// 3. Categories
// -----------------------------------------------------------------------------
api.get("/categories", async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const userId = c.get("userId");
  const categories = await listCategories(db, userId);
  return c.json(categories, 200);
});

api.post("/categories", async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const userId = c.get("userId");

  try {
    const body = await c.req.json();
    if (body?.action === "seed_defaults") {
      const result = await seedDefaultCategories(db, userId);
      return c.json(result, 200);
    }
    const created = await createCategory(db, userId, body);
    return c.json(created, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Invalid payload";
    return c.json({ error: message }, 400);
  }
});

// -----------------------------------------------------------------------------
// 4. Budgets
// -----------------------------------------------------------------------------
api.get("/budgets", async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const userId = c.get("userId");
  const statusParam = c.req.query("status");

  if (statusParam === "true" || statusParam === "1") {
    const status = await getBudgetStatus(db, userId);
    return c.json(status, 200);
  }

  const budgets = await listBudgets(db, userId);
  return c.json(budgets, 200);
});

api.post("/budgets", async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const userId = c.get("userId");

  try {
    const body = await c.req.json();
    const created = await createBudget(db, userId, body);
    return c.json(created, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Invalid payload";
    return c.json({ error: message }, 400);
  }
});

// -----------------------------------------------------------------------------
// 5. Transactions
// -----------------------------------------------------------------------------
api.get("/transactions", async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const userId = c.get("userId");

  const walletId = c.req.query("walletId");
  const targetWalletId = c.req.query("targetWalletId");
  const categoryId = c.req.query("categoryId");
  const budgetId = c.req.query("budgetId");
  const type = c.req.query("type") as "expense" | "income" | "transfer" | undefined;
  const isPlannedParam = c.req.query("isPlanned");
  const isPlanned = isPlannedParam !== undefined ? (isPlannedParam === "true" || isPlannedParam === "1") : undefined;
  const startDate = c.req.query("startDate");
  const endDate = c.req.query("endDate");
  const limitParam = c.req.query("limit");
  const offsetParam = c.req.query("offset");

  try {
    const txs = await listTransactions(db, userId, {
      walletId,
      targetWalletId,
      categoryId,
      budgetId,
      type,
      isPlanned,
      startDate,
      endDate,
      limit: limitParam ? Number(limitParam) : undefined,
      offset: offsetParam ? Number(offsetParam) : undefined,
    });
    return c.json(txs, 200);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Query Error";
    return c.json({ error: message }, 400);
  }
});

api.post("/transactions", async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const userId = c.get("userId");

  try {
    const body = await c.req.json();
    const created = await recordTransaction(db, userId, body);
    return c.json(created, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Transaction Error";
    return c.json({ error: message }, 400);
  }
});

api.put("/transactions/:id", async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const userId = c.get("userId");
  const transactionId = c.req.param("id");

  try {
    const body = await c.req.json();
    const updated = await updateTransaction(db, userId, { ...body, transactionId });
    return c.json(updated, 200);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Update Error";
    return c.json({ error: message }, 400);
  }
});

// -----------------------------------------------------------------------------
// 6. Transfers
// -----------------------------------------------------------------------------
api.post("/transfers", async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const userId = c.get("userId");

  try {
    const body = await c.req.json();
    const created = await transferFunds(db, userId, body);
    return c.json(created, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Transfer Error";
    return c.json({ error: message }, 400);
  }
});

// -----------------------------------------------------------------------------
// 7. Debts & Loans
// -----------------------------------------------------------------------------
api.get("/debts-loans", async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const userId = c.get("userId");
  const type = c.req.query("type") as "debt" | "loan" | undefined;
  const status = c.req.query("status") as "unpaid" | "partially_paid" | "paid" | undefined;

  const records = await listDebtsLoans(db, userId, { type, status });
  return c.json(records, 200);
});

api.post("/debts-loans", async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const userId = c.get("userId");

  try {
    const body = await c.req.json();
    const created = await createDebtLoan(db, userId, body);
    return c.json(created, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Debt/Loan Error";
    return c.json({ error: message }, 400);
  }
});

api.post("/debts-loans/repay", async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const userId = c.get("userId");

  try {
    const body = await c.req.json();
    const updated = await repayDebtLoan(db, userId, body);
    return c.json(updated, 200);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Repay Error";
    return c.json({ error: message }, 400);
  }
});

api.put("/debts-loans/:id", async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const userId = c.get("userId");
  const debtLoanId = c.req.param("id");

  try {
    const body = await c.req.json();
    const updated = await updateDebtLoan(db, userId, { ...body, debtLoanId });
    return c.json(updated, 200);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Update Error";
    return c.json({ error: message }, 400);
  }
});

// -----------------------------------------------------------------------------
// 8. Feedback
// -----------------------------------------------------------------------------
api.post("/feedback", async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const userId = c.get("userId") || null;

  try {
    const body = await c.req.json();
    const result = await submitFeedback(db, userId, body, {
      githubToken: c.env.GITHUB_TOKEN,
      githubRepo: c.env.GITHUB_REPO,
    });
    return c.json(result, 200);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Feedback Error";
    return c.json({ error: message }, 400);
  }
});

export default api;
