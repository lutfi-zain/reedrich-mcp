import { Hono } from "hono";
import { getDb } from "../db";
import { getAccountDetail } from "../services/account-snapshot";
import type { AppEnv } from "../index";

const accountDetail = new Hono<AppEnv>();

accountDetail.get("/", async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env);
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
