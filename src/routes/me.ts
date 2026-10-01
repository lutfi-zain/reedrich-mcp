import { Hono } from "hono";
import { getDb } from "../db";
import { getUserProfile, updateUserProfile } from "../services/user";
import type { AppEnv } from "../index";

const me = new Hono<AppEnv>();

me.get("/", async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env);
  const result = await getUserProfile(db, userId!);
  return c.json(result, 200);
});

me.patch("/", async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env);
  const body = (await c.req.json()) as Record<string, unknown>;
  const result = await updateUserProfile(db, userId!, body as any);
  return c.json(result, 200);
});

export default me;
