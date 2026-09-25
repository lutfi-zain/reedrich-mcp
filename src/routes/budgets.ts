import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { budgetStatus, createBudget } from "../services/budget";
import type { AppEnv } from "../index";

const budgets = new Hono<AppEnv>();

budgets.get("/", async (c) => {
  const userId = c.get("userId");
  const db = drizzle(c.env.DB, { schema });
  const result = await budgetStatus(db, userId!);
  return c.json(result, 200);
});

budgets.post("/", async (c) => {
  const userId = c.get("userId");
  const db = drizzle(c.env.DB, { schema });
  const body = (await c.req.json()) as Record<string, unknown>;
  const result = await createBudget(db, userId!, body as any);
  return c.json(result, 201);
});

export default budgets;
