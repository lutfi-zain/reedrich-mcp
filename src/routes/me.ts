import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { getUserProfile, updateUserProfile } from "../services/user";
import type { AppEnv } from "../index";

const me = new Hono<AppEnv>();

me.get("/", async (c) => {
  const userId = c.get("userId");
  const db = drizzle(c.env.DB, { schema });
  const result = await getUserProfile(db, userId!);
  return c.json(result, 200);
});

me.patch("/", async (c) => {
  const userId = c.get("userId");
  const db = drizzle(c.env.DB, { schema });
  const body = (await c.req.json()) as Record<string, unknown>;
  const result = await updateUserProfile(db, userId!, body as any);
  return c.json(result, 200);
});

export default me;
