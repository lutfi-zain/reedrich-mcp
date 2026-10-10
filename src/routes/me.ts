import { Hono } from "hono";
import { getDb } from "../db";
import { getUserProfile, rotateUserApiKey, updateUserProfile, type UpdateUserProfileParams } from "../services/user";
import type { AppEnv } from "../index";

const me = new Hono<AppEnv>();

me.get("/", async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env, c.get("tracer"));
  const result = await getUserProfile(db, userId!);
  return c.json(result, 200);
});

me.patch("/", async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env, c.get("tracer"));
  let body: Record<string, unknown> = {};
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    // Fallback to empty object if body cannot be parsed
  }
  const result = await updateUserProfile(db, userId!, body as UpdateUserProfileParams);
  return c.json(result, 200);
});

me.post("/api-key/rotate", async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env, c.get("tracer"));
  let body: Record<string, unknown> = {};
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    // Fallback to empty object if body is missing or non-JSON
  }
  const result = await rotateUserApiKey(db, userId!, body?.confirm);
  return c.json(result, 200);
});

me.post("/rotate-api-key", async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env, c.get("tracer"));
  let body: Record<string, unknown> = {};
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    // Fallback to empty object
  }
  const result = await rotateUserApiKey(db, userId!, body?.confirm);
  return c.json(result, 200);
});

export default me;
