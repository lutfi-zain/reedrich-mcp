import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { listTransactions, recordTransaction, updateTransaction, deleteTransaction } from "../services/transaction";
import type { AppEnv } from "../index";

const transactions = new Hono<AppEnv>();

transactions.get("/", async (c) => {
  const userId = c.get("userId");
  const db = drizzle(c.env.DB, { schema });
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
    isPlanned: isPlannedParam,
    startDate: q.startDate,
    endDate: q.endDate,
    limit: q.limit !== undefined ? Number(q.limit) : undefined,
    offset: q.offset !== undefined ? Number(q.offset) : undefined,
  });

  return c.json(result, 200);
});

transactions.post("/", async (c) => {
  const userId = c.get("userId");
  const db = drizzle(c.env.DB, { schema });
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
  const db = drizzle(c.env.DB, { schema });
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
  const db = drizzle(c.env.DB, { schema });
  const transactionId = c.req.param("transactionId");
  const result = await deleteTransaction(db, userId!, transactionId);
  return c.json(result, 200);
});

export default transactions;
