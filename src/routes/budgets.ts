import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { budgetStatus, getBudgetById, createBudget, updateBudget, deleteBudget } from "../services/budget";
import type { AppEnv } from "../index";

const budgets = new Hono<AppEnv>();

budgets.get("/", async (c) => {
  const userId = c.get("userId");
  const db = drizzle(c.env.DB, { schema });
  const result = await budgetStatus(db, userId!);
  return c.json(result, 200);
});

budgets.get("/:budgetId", async (c) => {
  const userId = c.get("userId");
  const db = drizzle(c.env.DB, { schema });
  const budgetId = c.req.param("budgetId");
  const result = await getBudgetById(db, userId!, budgetId);
  return c.json(result, 200);
});

budgets.post("/", async (c) => {
  const userId = c.get("userId");
  const db = drizzle(c.env.DB, { schema });
  const body = (await c.req.json()) as Record<string, unknown>;
  const result = await createBudget(db, userId!, body as any);
  return c.json(result, 201);
});

budgets.patch("/:budgetId", async (c) => {
  const userId = c.get("userId");
  const db = drizzle(c.env.DB, { schema });
  const budgetId = c.req.param("budgetId");
  const body = (await c.req.json()) as Record<string, unknown>;
  const result = await updateBudget(db, userId!, budgetId, body as any);
  return c.json(result, 200);
});

budgets.delete("/:budgetId", async (c) => {
  const userId = c.get("userId");
  const db = drizzle(c.env.DB, { schema });
  const budgetId = c.req.param("budgetId");
  const result = await deleteBudget(db, userId!, budgetId);
  return c.json(result, 200);
});

export default budgets;
