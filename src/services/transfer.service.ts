import { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { eq, and } from "drizzle-orm";
import {
  currentIsoTimestamp,
  isValidIsoDateOrTimestamp,
  normalizeToIsoTimestamp,
} from "../utils/date";
import { applyWalletBalanceDelta } from "./wallet.service";

export type TransferFundsInput = {
  sourceWalletId: string;
  targetWalletId: string;
  amount: number;
  adminFee?: number;
  categoryId?: string | null;
  description?: string | null;
  isPlanned?: boolean;
  transactionDate?: string;
};

export async function transferFunds(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  input: TransferFundsInput
) {
  const { sourceWalletId, targetWalletId, amount, adminFee, categoryId, description, isPlanned, transactionDate } = input;

  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    throw new Error("Validation Error: Transfer 'amount' must be a positive finite number greater than 0");
  }
  if (!sourceWalletId || typeof sourceWalletId !== "string" || sourceWalletId.trim().length === 0) {
    throw new Error("Validation Error: Valid string 'sourceWalletId' (UUID) is required");
  }
  if (!targetWalletId || typeof targetWalletId !== "string" || targetWalletId.trim().length === 0) {
    throw new Error("Validation Error: Valid string 'targetWalletId' (UUID) is required");
  }
  if (adminFee !== undefined && (typeof adminFee !== "number" || !Number.isFinite(adminFee) || adminFee < 0)) {
    throw new Error("Validation Error: 'adminFee' must be a non-negative finite number");
  }
  if (transactionDate && !isValidIsoDateOrTimestamp(transactionDate)) {
    throw new Error("Validation Error: 'transactionDate' must be in valid ISO format (e.g. YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss+07:00)");
  }
  if (description && (typeof description !== "string" || description.length > 500)) {
    throw new Error("Validation Error: 'description' cannot exceed 500 characters");
  }

  const cleanSourceWalletId = sourceWalletId.trim();
  const cleanTargetWalletId = targetWalletId.trim();
  const cleanAdminFee = typeof adminFee === "number" && Number.isFinite(adminFee) && adminFee >= 0 ? adminFee : 0;

  if (cleanSourceWalletId === cleanTargetWalletId) {
    throw new Error("Validation Error: Source and target cannot be the same wallet");
  }

  const sourceWallet = await db
    .select()
    .from(schema.wallets)
    .where(and(eq(schema.wallets.walletId, cleanSourceWalletId), eq(schema.wallets.walletUserId, userId)))
    .get();
  if (!sourceWallet) throw new Error(`Source Wallet ID ${cleanSourceWalletId} not found or unauthorized`);

  const targetWallet = await db
    .select()
    .from(schema.wallets)
    .where(and(eq(schema.wallets.walletId, cleanTargetWalletId), eq(schema.wallets.walletUserId, userId)))
    .get();
  if (!targetWallet) throw new Error(`Target Wallet ID ${cleanTargetWalletId} not found or unauthorized`);

  let cleanCategoryId: string | null = null;
  if (categoryId && typeof categoryId === "string" && categoryId.trim().length > 0) {
    const targetCatId = categoryId.trim();
    const cat = await db.select().from(schema.categories).where(and(eq(schema.categories.categoryId, targetCatId), eq(schema.categories.categoryUserId, userId))).get();
    if (!cat) throw new Error(`Category ID ${targetCatId} not found or unauthorized`);
    cleanCategoryId = targetCatId;
  } else {
    let transferCat = await db.select().from(schema.categories).where(and(eq(schema.categories.categoryUserId, userId), eq(schema.categories.categoryName, "Transfer Antar Dompet"))).get();
    if (!transferCat) {
      const nowIso = currentIsoTimestamp();
      const created = await db.insert(schema.categories).values({
        categoryId: crypto.randomUUID(),
        categoryUserId: userId,
        categoryName: "Transfer Antar Dompet",
        categoryType: "expense",
        categoryIcon: "🔁",
        categoryCreatedAt: nowIso,
      }).returning();
      transferCat = created[0];
    }
    cleanCategoryId = transferCat.categoryId;
  }

  const dateStr = normalizeToIsoTimestamp(transactionDate);
  const isPlannedInt = isPlanned ? 1 : 0;
  const newTransactionId = crypto.randomUUID();
  const nowIso = currentIsoTimestamp();

  const tx = await db.insert(schema.transactions).values({
    transactionId: newTransactionId,
    transactionUserId: userId,
    transactionWalletId: cleanSourceWalletId,
    transactionTargetWalletId: cleanTargetWalletId,
    transactionCategoryId: cleanCategoryId,
    transactionAmount: amount,
    transactionAdminFee: cleanAdminFee,
    transactionType: "transfer",
    transactionDescription: description ? description.trim() : null,
    transactionIsPlanned: isPlannedInt,
    transactionDate: dateStr,
    transactionCreatedAt: nowIso,
  }).returning();

  if (!isPlannedInt) {
    await applyWalletBalanceDelta(db, userId, "transfer", cleanSourceWalletId, cleanTargetWalletId, amount, cleanAdminFee, 1);
  }

  return tx[0];
}
