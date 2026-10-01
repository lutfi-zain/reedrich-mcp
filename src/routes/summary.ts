import { Hono } from "hono";
import { getDb } from "../db";
import { financialSummary } from "../services/summary";
import type { AppEnv } from "../index";

const summary = new Hono<AppEnv>();

summary.get("/", async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env);
  const startDate = c.req.query("startDate");
  const endDate = c.req.query("endDate");
  const baseCurrency = c.req.query("baseCurrency");

  const result = await financialSummary(
    db,
    userId!,
    { startDate, endDate, baseCurrency },
    fetch
  );
  return c.json(result, 200);
});

export default summary;
