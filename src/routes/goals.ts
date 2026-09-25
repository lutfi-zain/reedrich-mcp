import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import {
  listGoals,
  createGoal,
  updateGoal,
  deleteGoal,
  contributeGoal,
  linkGoalWallet,
  unlinkGoalWallet,
} from "../services/goal";
import type { AppEnv } from "../index";

const goals = new Hono<AppEnv>();

goals.get("/", async (c) => {
  const userId = c.get("userId");
  const db = drizzle(c.env.DB, { schema });
  const status = c.req.query("status");

  const result = await listGoals(db, userId!, status);
  return c.json(result, 200);
});

goals.post("/", async (c) => {
  const userId = c.get("userId");
  const db = drizzle(c.env.DB, { schema });
  const body = (await c.req.json()) as Record<string, unknown>;

  const result = await createGoal(db, userId!, body as any);
  return c.json(result, 201);
});

goals.patch("/:goalId", async (c) => {
  const userId = c.get("userId");
  const db = drizzle(c.env.DB, { schema });
  const goalId = c.req.param("goalId");
  const body = (await c.req.json()) as Record<string, unknown>;
  const result = await updateGoal(db, userId!, goalId, body as any);
  return c.json(result, 200);
});

goals.delete("/:goalId", async (c) => {
  const userId = c.get("userId");
  const db = drizzle(c.env.DB, { schema });
  const goalId = c.req.param("goalId");
  const result = await deleteGoal(db, userId!, goalId);
  return c.json(result, 200);
});

goals.post("/:goalId/contribute", async (c) => {
  const userId = c.get("userId");
  const db = drizzle(c.env.DB, { schema });
  const goalId = c.req.param("goalId");
  const body = (await c.req.json()) as Record<string, unknown>;
  const result = await contributeGoal(db, userId!, goalId, body as any);
  return c.json(result, 200);
});

goals.post("/:goalId/wallets", async (c) => {
  const userId = c.get("userId");
  const db = drizzle(c.env.DB, { schema });
  const goalId = c.req.param("goalId");
  const body = (await c.req.json()) as Record<string, unknown>;
  const walletId = body?.walletId;
  const result = await linkGoalWallet(db, userId!, goalId, walletId);
  return c.json(result, 200);
});

goals.delete("/:goalId/wallets/:walletId", async (c) => {
  const userId = c.get("userId");
  const db = drizzle(c.env.DB, { schema });
  const goalId = c.req.param("goalId");
  const walletId = c.req.param("walletId");
  const result = await unlinkGoalWallet(db, userId!, goalId, walletId);
  return c.json(result, 200);
});

export default goals;
