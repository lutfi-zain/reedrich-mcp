import { Hono } from "hono";
import { getDb } from "../db";
import { listTransactions, getTransactionById, recordTransaction, updateTransaction, deleteTransaction } from "../services/transaction";
import type { AppEnv } from "../index";

const transactions = new Hono<AppEnv>();

transactions.get("/", async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env);
  const q = c.req.query();

  const isPlannedParam =
    q.isPlanned !== undefined
      ? q.isPlanned === "true" || q.isPlanned === "1"
      : undefined;

  const result = await listTransactions(db, userId!, {
    walletId: q.walletId,
    targetWalletId: q.targetWalletId,
    categoryId: q.categoryId,
    budgetId: q.budgetId,
    type: q.type,
    status: q.status,
    q: q.q,
    search: q.search,
    isPlanned: isPlannedParam,
    startDate: q.startDate,
    endDate: q.endDate,
    orderBy: q.orderBy,
    direction: q.direction,
    limit: q.limit !== undefined ? Number(q.limit) : undefined,
    offset: q.offset !== undefined ? Number(q.offset) : undefined,
  });

  c.header("X-Total-Count", String(result.pagination.total));
  c.header("X-Limit", String(result.pagination.limit));
  c.header("X-Offset", String(result.pagination.offset));
  c.header("X-Has-Next-Page", result.pagination.hasNext ? "true" : "false");

  const wantsEnvelope = q.envelope === "true" || q.envelope === "1";
  return c.json(wantsEnvelope ? result : result.items, 200);
});
transactions.get("/:transactionId", async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env);
  const transactionId = c.req.param("transactionId");
  const result = await getTransactionById(db, userId!, transactionId);
  return c.json(result, 200);
});

transactions.post("/", async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env);
  const body = (await c.req.json()) as Record<string, unknown>;
  const payload = {
    ...body,
    transactionDate: body.transactionDate ?? body.date,
  };
  const result = await recordTransaction(db, userId!, payload as any);
  return c.json(result, 201);
});

transactions.patch("/:transactionId", async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env);
  const transactionId = c.req.param("transactionId");
  const body = (await c.req.json()) as Record<string, unknown>;
  const payload = {
    ...body,
    transactionDate: body.transactionDate ?? body.date,
  };
  const result = await updateTransaction(db, userId!, transactionId, payload as any);
  return c.json(result, 200);
});

transactions.delete("/:transactionId", async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env);
  const transactionId = c.req.param("transactionId");
  const result = await deleteTransaction(db, userId!, transactionId);
  return c.json(result, 200);
});

export default transactions;
