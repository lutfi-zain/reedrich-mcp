import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { budgetStatus } from "../services/budget";
import type { AppEnv } from "../index";

const budgets = new Hono<AppEnv>();

budgets.get("/", async (c) => {
  const userId = c.get("userId");
  const db = drizzle(c.env.DB, { schema });
  const result = await budgetStatus(db, userId!);
  return c.json(result, 200);
});

export default budgets;
