import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { listDebtsLoans } from "../services/debt-loan";
import type { AppEnv } from "../index";

const debtsLoans = new Hono<AppEnv>();

debtsLoans.get("/", async (c) => {
  const userId = c.get("userId");
  const db = drizzle(c.env.DB, { schema });
  const status = c.req.query("status");
  const type = c.req.query("type");

  const result = await listDebtsLoans(db, userId!, { status, type });
  return c.json(result, 200);
});

export default debtsLoans;
