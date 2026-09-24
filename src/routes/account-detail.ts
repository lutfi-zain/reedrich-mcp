import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { getAccountDetail } from "../services/account-snapshot";
import type { AppEnv } from "../index";

const accountDetail = new Hono<AppEnv>();

accountDetail.get("/", async (c) => {
  const userId = c.get("userId");
  const db = drizzle(c.env.DB, { schema });
  const startDate = c.req.query("startDate");
  const endDate = c.req.query("endDate");
  const baseCurrency = c.req.query("baseCurrency");

  const result = await getAccountDetail(
    db,
    userId!,
    { startDate, endDate, baseCurrency },
    fetch
  );
  return c.json(result, 200);
});

export default accountDetail;
