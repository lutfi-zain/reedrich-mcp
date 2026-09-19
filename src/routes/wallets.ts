import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { listWallets } from "../services/wallet";
import type { AppEnv } from "../index";

const wallets = new Hono<AppEnv>();

wallets.get("/", async (c) => {
  const userId = c.get("userId");
  const db = drizzle(c.env.DB, { schema });
  const result = await listWallets(db, userId!);
  return c.json(result, 200);
});

export default wallets;
