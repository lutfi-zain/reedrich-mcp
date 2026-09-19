import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { listCategories } from "../services/category";
import type { AppEnv } from "../index";

const categories = new Hono<AppEnv>();

categories.get("/", async (c) => {
  const userId = c.get("userId");
  const db = drizzle(c.env.DB, { schema });
  const result = await listCategories(db, userId!);
  return c.json(result, 200);
});

export default categories;
