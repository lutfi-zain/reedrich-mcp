import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { listWallets, createWallet, updateWallet } from "../services/wallet";
import type { AppEnv } from "../index";

const wallets = new Hono<AppEnv>();

wallets.get("/", async (c) => {
  const userId = c.get("userId");
  const db = drizzle(c.env.DB, { schema });
  const result = await listWallets(db, userId!);
  return c.json(result, 200);
});

wallets.post("/", async (c) => {
  const userId = c.get("userId");
  const db = drizzle(c.env.DB, { schema });
  const body = (await c.req.json()) as Record<string, unknown>;
  const result = await createWallet(db, userId!, body as any);
  return c.json(result, 201);
});

wallets.patch("/:walletId", async (c) => {
  const userId = c.get("userId");
  const db = drizzle(c.env.DB, { schema });
  const walletId = c.req.param("walletId");
  const body = (await c.req.json()) as Record<string, unknown>;
  const result = await updateWallet(db, userId!, walletId, body as any);
  return c.json(result, 200);
});

export default wallets;
