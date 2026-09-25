import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { getUserProfile } from "../services/user";
import type { AppEnv } from "../index";

const me = new Hono<AppEnv>();

me.get("/", async (c) => {
  const userId = c.get("userId");
  const db = drizzle(c.env.DB, { schema });
  const result = await getUserProfile(db, userId!);
  return c.json(result, 200);
});

export default me;
