import { Hono } from "hono";
import { getDb } from "../db";
import { listWallets, getWalletById, createWallet, updateWallet, deleteWallet } from "../services/wallet";
import type { AppEnv } from "../index";

const wallets = new Hono<AppEnv>();

wallets.get("/", async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env);
  const result = await listWallets(db, userId!);
  return c.json(result, 200);
});

wallets.get("/:walletId", async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env);
  const walletId = c.req.param("walletId");
  const result = await getWalletById(db, userId!, walletId);
  return c.json(result, 200);
});

wallets.post("/", async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env);
  const body = (await c.req.json()) as Record<string, unknown>;
  const result = await createWallet(db, userId!, body as any);
  return c.json(result, 201);
});

wallets.patch("/:walletId", async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env);
  const walletId = c.req.param("walletId");
  const body = (await c.req.json()) as Record<string, unknown>;
  const result = await updateWallet(db, userId!, walletId, body as any);
  return c.json(result, 200);
});

wallets.delete("/:walletId", async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env);
  const walletId = c.req.param("walletId");
  const result = await deleteWallet(db, userId!, walletId);
  return c.json(result, 200);
});

export default wallets;
