import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { transferFunds } from "../services/transfer";
import type { AppEnv } from "../index";

const transfers = new Hono<AppEnv>();

transfers.post("/", async (c) => {
  const userId = c.get("userId");
  const db = drizzle(c.env.DB, { schema });
  const body = (await c.req.json()) as Record<string, unknown>;
  const payload = {
    ...body,
    transactionDate: body.transactionDate ?? body.date,
  };
  const result = await transferFunds(db, userId!, payload as any);
  return c.json(result, 201);
});

export default transfers;
