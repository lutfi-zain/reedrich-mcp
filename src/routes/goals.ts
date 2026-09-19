import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { listGoals, createGoal } from "../services/goal";
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

export default goals;
