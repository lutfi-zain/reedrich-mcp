import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { getHorizonProjections } from "../services/horizon";
import type { AppEnv } from "../index";

const horizon = new Hono<AppEnv>();

horizon.get("/", async (c) => {
  const userId = c.get("userId");
  const db = drizzle(c.env.DB, { schema });
  const months = c.req.query("months");
  const periods = c.req.query("periods");
  const baseCurrency = c.req.query("baseCurrency");

  const result = await getHorizonProjections(
    db,
    userId!,
    { months, periods, baseCurrency },
    fetch
  );

  return c.json(result, 200);
});

export default horizon;
