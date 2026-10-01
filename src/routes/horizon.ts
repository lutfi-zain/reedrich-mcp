import { Hono } from "hono";
import { getDb } from "../db";
import { getHorizonProjections } from "../services/horizon";
import type { AppEnv } from "../index";

const horizon = new Hono<AppEnv>();

horizon.get("/", async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env);
  const q = c.req.query();

  const result = await getHorizonProjections(
    db,
    userId!,
    {
      months: q.months,
      periods: q.periods,
      filter: q.filter,
      baseCurrency: q.baseCurrency,
    },
    fetch
  );

  return c.json(result, 200);
});

horizon.post("/", async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env);
  const body = ((await c.req.json().catch(() => ({}))) || {}) as Record<string, unknown>;
  const q = c.req.query();

  const result = await getHorizonProjections(
    db,
    userId!,
    {
      months: body.months ?? q.months,
      periods: body.periods ?? q.periods,
      filter: body.filter ?? q.filter,
      baseCurrency: body.baseCurrency ?? q.baseCurrency,
    },
    fetch
  );

  return c.json(result, 200);
});

export default horizon;
