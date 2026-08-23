import { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { eq, and, sql } from "drizzle-orm";
import { currentIsoTimestamp } from "../utils/date";

export const ALLOWED_WALLET_TYPES = ["bank", "cash", "e-wallet", "credit", "crypto", "investment"] as const;
export type WalletType = typeof ALLOWED_WALLET_TYPES[number];

export type CreateWalletInput = {
  name: string;
  institution?: string;
  type?: string;
  balance?: number;
  currency?: string;
};

export type UpdateWalletInput = {
  walletId: string;
  name?: string;
  institution?: string;
  type?: string;
  balance?: number;
  currency?: string;
};

export async function listWallets(
  db: DrizzleD1Database<typeof schema>,
  userId: string
) {
  return await db.select().from(schema.wallets).where(eq(schema.wallets.walletUserId, userId));
}

export async function getWalletById(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  walletId: string
) {
  const cleanId = walletId.trim();
  return await db
    .select()
    .from(schema.wallets)
    .where(and(eq(schema.wallets.walletId, cleanId), eq(schema.wallets.walletUserId, userId)))
    .get();
}

export async function createWallet(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  input: CreateWalletInput
) {
  const { name: walletName, institution, type, balance, currency } = input;

  if (!walletName || typeof walletName !== "string" || walletName.trim().length === 0 || walletName.trim().length > 100) {
    throw new Error("Validation Error: Wallet 'name' is required (1-100 characters)");
  }

  const cleanType = type && ALLOWED_WALLET_TYPES.includes(type as WalletType) ? type : "bank";
  const cleanBalance = typeof balance === "number" && Number.isFinite(balance) ? balance : 0;
  const cleanCurrency = currency && typeof currency === "string" && currency.trim().length > 0 && currency.trim().length <= 10
    ? currency.trim().toUpperCase()
    : "IDR";
  const cleanInstitution = institution && typeof institution === "string" && institution.trim().length > 0
    ? institution.trim()
    : "General";

  const newWalletId = crypto.randomUUID();
  const nowIso = currentIsoTimestamp();

  const result = await db.insert(schema.wallets).values({
    walletId: newWalletId,
    walletUserId: userId,
    walletName: walletName.trim(),
    walletInstitution: cleanInstitution,
    walletType: cleanType,
    walletBalance: cleanBalance,
    walletCurrency: cleanCurrency,
    walletCreatedAt: nowIso,
  }).returning();

  return result[0];
}

export async function updateWallet(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  input: UpdateWalletInput
) {
  const { walletId, name: walletName, institution, type, balance, currency } = input;

  if (!walletId || typeof walletId !== "string" || walletId.trim().length === 0) {
    throw new Error("Validation Error: Valid string 'walletId' (UUID) is required for update action");
  }

  const cleanWalletId = walletId.trim();
  const existing = await getWalletById(db, userId, cleanWalletId);
  if (!existing) {
    throw new Error(`Wallet ID ${cleanWalletId} not found or unauthorized`);
  }

  const updates: Partial<typeof schema.wallets.$inferInsert> = {};
  if (walletName && typeof walletName === "string" && walletName.trim().length > 0 && walletName.trim().length <= 100) {
    updates.walletName = walletName.trim();
  }
  if (institution && typeof institution === "string" && institution.trim().length > 0) {
    updates.walletInstitution = institution.trim();
  }
  if (balance !== undefined) {
    if (typeof balance !== "number" || !Number.isFinite(balance)) {
      throw new Error("Validation Error: 'balance' must be a valid finite number");
    }
    updates.walletBalance = balance;
  }
  if (type && ALLOWED_WALLET_TYPES.includes(type as WalletType)) {
    updates.walletType = type;
  }
  if (currency && typeof currency === "string" && currency.trim().length > 0 && currency.trim().length <= 10) {
    updates.walletCurrency = currency.trim().toUpperCase();
  }

  if (Object.keys(updates).length === 0) {
    return existing;
  }

  const updated = await db
    .update(schema.wallets)
    .set(updates)
    .where(and(eq(schema.wallets.walletId, cleanWalletId), eq(schema.wallets.walletUserId, userId)))
    .returning();

  return updated[0];
}

export async function applyWalletBalanceDelta(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  txType: string,
  walletId: string,
  targetWalletId: string | null,
  amount: number,
  adminFee: number,
  multiplier: 1 | -1
) {
  if (txType === "expense") {
    const delta = -(amount + adminFee) * multiplier;
    await db.update(schema.wallets)
      .set({ walletBalance: sql`wallet_balance + ${delta}` })
      .where(and(eq(schema.wallets.walletId, walletId), eq(schema.wallets.walletUserId, userId)));
  } else if (txType === "income") {
    const delta = (amount - adminFee) * multiplier;
    await db.update(schema.wallets)
      .set({ walletBalance: sql`wallet_balance + ${delta}` })
      .where(and(eq(schema.wallets.walletId, walletId), eq(schema.wallets.walletUserId, userId)));
  } else if (txType === "transfer" && targetWalletId) {
    const sourceDelta = -(amount + adminFee) * multiplier;
    const targetDelta = amount * multiplier;
    await db.update(schema.wallets)
      .set({ walletBalance: sql`wallet_balance + ${sourceDelta}` })
      .where(and(eq(schema.wallets.walletId, walletId), eq(schema.wallets.walletUserId, userId)));
    await db.update(schema.wallets)
      .set({ walletBalance: sql`wallet_balance + ${targetDelta}` })
      .where(and(eq(schema.wallets.walletId, targetWalletId), eq(schema.wallets.walletUserId, userId)));
  }
}
