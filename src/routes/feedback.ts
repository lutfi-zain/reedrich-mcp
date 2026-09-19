import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { submitFeedback } from "../services/feedback";
import type { AppEnv } from "../index";

const feedback = new Hono<AppEnv>();

feedback.post("/", async (c) => {
  const userId = c.get("userId") || null;
  const db = drizzle(c.env.DB, { schema });
  const body = (await c.req.json()) as Record<string, unknown>;

  const result = await submitFeedback(db, userId, body as any);
  return c.json(result, 201);
});

export default feedback;
