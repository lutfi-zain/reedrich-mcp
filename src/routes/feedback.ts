import { Hono } from "hono";
import { getDb } from "../db";
import { submitFeedback } from "../services/feedback";
import type { AppEnv } from "../index";

const feedback = new Hono<AppEnv>();

feedback.post("/", async (c) => {
  const userId = c.get("userId") || null;
  const db = getDb(c.env);
  const body = (await c.req.json()) as Record<string, unknown>;

  const result = await submitFeedback(db, userId, body as any);
  return c.json(result, 201);
});

export default feedback;
