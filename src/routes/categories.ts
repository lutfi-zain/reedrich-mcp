import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { listCategories, createCategory, seedDefaults } from "../services/category";
import type { AppEnv } from "../index";

const categories = new Hono<AppEnv>();

categories.get("/", async (c) => {
  const userId = c.get("userId");
  const db = drizzle(c.env.DB, { schema });
  const result = await listCategories(db, userId!);
  return c.json(result, 200);
});

categories.post("/", async (c) => {
  const userId = c.get("userId");
  const db = drizzle(c.env.DB, { schema });
  const body = (await c.req.json()) as Record<string, unknown>;
  const result = await createCategory(db, userId!, body as any);
  return c.json(result, 201);
});

categories.post("/seed", async (c) => {
  const userId = c.get("userId");
  const db = drizzle(c.env.DB, { schema });
  const result = await seedDefaults(db, userId!);
  return c.json(result, 200);
});

export default categories;
