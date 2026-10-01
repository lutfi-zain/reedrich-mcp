import { Hono } from "hono";
import { getDb } from "../db";
import { budgetStatus, getBudgetById, createBudget, updateBudget, deleteBudget } from "../services/budget";
import type { AppEnv } from "../index";

const budgets = new Hono<AppEnv>();

budgets.get("/", async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env);
  const result = await budgetStatus(db, userId!);
  return c.json(result, 200);
});

budgets.get("/:budgetId", async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env);
  const budgetId = c.req.param("budgetId");
  const result = await getBudgetById(db, userId!, budgetId);
  return c.json(result, 200);
});

budgets.post("/", async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env);
  const body = (await c.req.json()) as Record<string, unknown>;
  const result = await createBudget(db, userId!, body as any);
  return c.json(result, 201);
});

budgets.patch("/:budgetId", async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env);
  const budgetId = c.req.param("budgetId");
  const body = (await c.req.json()) as Record<string, unknown>;
  const result = await updateBudget(db, userId!, budgetId, body as any);
  return c.json(result, 200);
});

budgets.delete("/:budgetId", async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env);
  const budgetId = c.req.param("budgetId");
  const result = await deleteBudget(db, userId!, budgetId);
  return c.json(result, 200);
});

export default budgets;
