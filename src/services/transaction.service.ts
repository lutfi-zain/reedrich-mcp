import { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import {
  currentIsoTimestamp,
  isValidIsoDateOrTimestamp,
  normalizeToIsoTimestamp,
} from "../utils/date";
import { applyWalletBalanceDelta } from "./wallet.service";

export type RecordTransactionInput = {
  walletId: string;
  categoryId: string;
  budgetId?: string | null;
  amount: number;
  adminFee?: number;
  type?: "expense" | "income" | string;
  description?: string | null;
  isPlanned?: boolean;
  transactionDate?: string;
};

export type UpdateTransactionInput = {
  transactionId: string;
  amount?: number;
  adminFee?: number;
  walletId?: string;
  targetWalletId?: string | null;
  categoryId?: string | null;
  budgetId?: string | null;
  description?: string | null;
  transactionDate?: string;
  isPlanned?: boolean;
};

export type ListTransactionsFilter = {
  walletId?: string;
  targetWalletId?: string;
  categoryId?: string;
  budgetId?: string;
  type?: "expense" | "income" | "transfer";
  isPlanned?: boolean;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
};

export async function recordTransaction(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  input: RecordTransactionInput
) {
  const { walletId, categoryId, budgetId, amount, adminFee, type, description, isPlanned, transactionDate } = input;

  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    throw new Error("Validation Error: Transaction 'amount' must be a positive finite number greater than 0");
  }
  if (!walletId || typeof walletId !== "string" || walletId.trim().length === 0) {
    throw new Error("Validation Error: Valid string 'walletId' (UUID) is required");
  }
  if (!categoryId || typeof categoryId !== "string" || categoryId.trim().length === 0) {
    throw new Error("Validation Error: Valid string 'categoryId' (UUID) is required");
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

  const cleanWalletId = walletId.trim();
  const cleanCategoryId = categoryId.trim();
  const cleanAdminFee = typeof adminFee === "number" && Number.isFinite(adminFee) && adminFee >= 0 ? adminFee : 0;
  const txType = type === "income" ? "income" : "expense";

  const wallet = await db
    .select()
    .from(schema.wallets)
    .where(and(eq(schema.wallets.walletId, cleanWalletId), eq(schema.wallets.walletUserId, userId)))
    .get();
  if (!wallet) throw new Error(`Wallet ID ${cleanWalletId} not found or unauthorized`);

  const category = await db
    .select()
    .from(schema.categories)
    .where(and(eq(schema.categories.categoryId, cleanCategoryId), eq(schema.categories.categoryUserId, userId)))
    .get();
  if (!category) throw new Error(`Category ID ${cleanCategoryId} not found or unauthorized`);

  let cleanBudgetId: string | null = null;
  if (budgetId) {
    const targetBudgetId = budgetId.trim();
    if (targetBudgetId.length === 0) {
      throw new Error("Validation Error: 'budgetId' must be a valid string (UUID)");
    }
    const budget = await db
      .select()
      .from(schema.budgets)
      .where(and(eq(schema.budgets.budgetId, targetBudgetId), eq(schema.budgets.budgetUserId, userId)))
      .get();
    if (!budget) throw new Error(`Budget ID ${targetBudgetId} not found or unauthorized`);
    cleanBudgetId = targetBudgetId;
  }

  const dateStr = normalizeToIsoTimestamp(transactionDate);
  const isPlannedInt = isPlanned ? 1 : 0;
  const newTransactionId = crypto.randomUUID();
  const nowIso = currentIsoTimestamp();

  const tx = await db.insert(schema.transactions).values({
    transactionId: newTransactionId,
    transactionUserId: userId,
    transactionWalletId: cleanWalletId,
    transactionCategoryId: cleanCategoryId,
    transactionBudgetId: cleanBudgetId,
    transactionAmount: amount,
    transactionAdminFee: cleanAdminFee,
    transactionType: txType,
    transactionDescription: description ? description.trim() : null,
    transactionIsPlanned: isPlannedInt,
    transactionDate: dateStr,
    transactionCreatedAt: nowIso,
  }).returning();

  if (!isPlannedInt) {
    await applyWalletBalanceDelta(db, userId, txType, cleanWalletId, null, amount, cleanAdminFee, 1);
  }

  return tx[0];
}

export async function updateTransaction(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  input: UpdateTransactionInput
) {
  const { transactionId, amount, adminFee, walletId, targetWalletId, categoryId, budgetId, description, transactionDate, isPlanned } = input;

  if (!transactionId || typeof transactionId !== "string" || transactionId.trim().length === 0) {
    throw new Error("Validation Error: Valid string 'transactionId' (UUID) is required");
  }
  const cleanTxId = transactionId.trim();
  const existingTx = await db
    .select()
    .from(schema.transactions)
    .where(and(eq(schema.transactions.transactionId, cleanTxId), eq(schema.transactions.transactionUserId, userId)))
    .get();
  if (!existingTx) {
    throw new Error(`Transaction ID ${cleanTxId} not found or unauthorized`);
  }

  if (amount !== undefined && (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0)) {
    throw new Error("Validation Error: 'amount' must be a positive finite number greater than 0");
  }
  if (adminFee !== undefined && (typeof adminFee !== "number" || !Number.isFinite(adminFee) || adminFee < 0)) {
    throw new Error("Validation Error: 'adminFee' must be a non-negative finite number");
  }
  if (transactionDate !== undefined && !isValidIsoDateOrTimestamp(transactionDate)) {
    throw new Error("Validation Error: 'transactionDate' must be in valid ISO format (e.g. YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss+07:00)");
  }
  if (description !== undefined && (typeof description !== "string" || description.length > 500)) {
    throw new Error("Validation Error: 'description' cannot exceed 500 characters");
  }

  let newWalletId = existingTx.transactionWalletId;
  if (walletId !== undefined) {
    const cleanWId = walletId.trim();
    if (cleanWId.length === 0) throw new Error("Validation Error: 'walletId' must be a valid UUID");
    const w = await db.select().from(schema.wallets).where(and(eq(schema.wallets.walletId, cleanWId), eq(schema.wallets.walletUserId, userId))).get();
    if (!w) throw new Error(`Wallet ID ${cleanWId} not found or unauthorized`);
    newWalletId = cleanWId;
  }

  let newTargetWalletId = existingTx.transactionTargetWalletId;
  if (targetWalletId !== undefined) {
    if (targetWalletId === null || targetWalletId === "") {
      newTargetWalletId = null;
    } else {
      const cleanTWId = targetWalletId.trim();
      if (cleanTWId.length === 0) throw new Error("Validation Error: 'targetWalletId' must be a valid UUID");
      const tw = await db.select().from(schema.wallets).where(and(eq(schema.wallets.walletId, cleanTWId), eq(schema.wallets.walletUserId, userId))).get();
      if (!tw) throw new Error(`Target Wallet ID ${cleanTWId} not found or unauthorized`);
      newTargetWalletId = cleanTWId;
    }
  }

  let newCategoryId = existingTx.transactionCategoryId;
  if (categoryId !== undefined) {
    if (categoryId === null || categoryId === "") {
      newCategoryId = null;
    } else {
      const cleanCatId = categoryId.trim();
      if (cleanCatId.length === 0) throw new Error("Validation Error: 'categoryId' must be a valid UUID");
      const cat = await db.select().from(schema.categories).where(and(eq(schema.categories.categoryId, cleanCatId), eq(schema.categories.categoryUserId, userId))).get();
      if (!cat) throw new Error(`Category ID ${cleanCatId} not found or unauthorized`);
      newCategoryId = cleanCatId;
    }
  }

  let newBudgetId = existingTx.transactionBudgetId;
  if (budgetId !== undefined) {
    if (budgetId === null || budgetId === "") {
      newBudgetId = null;
    } else {
      const cleanBId = budgetId.trim();
      if (cleanBId.length === 0) throw new Error("Validation Error: 'budgetId' must be a valid UUID");
      const b = await db.select().from(schema.budgets).where(and(eq(schema.budgets.budgetId, cleanBId), eq(schema.budgets.budgetUserId, userId))).get();
      if (!b) throw new Error(`Budget ID ${cleanBId} not found or unauthorized`);
      newBudgetId = cleanBId;
    }
  }

  const newAmount = amount !== undefined ? amount : existingTx.transactionAmount;
  const newAdminFee = adminFee !== undefined ? adminFee : existingTx.transactionAdminFee;
  const newIsPlannedInt = isPlanned !== undefined ? (isPlanned ? 1 : 0) : existingTx.transactionIsPlanned;

  // Atomic Balance Reconciliation
  if (existingTx.transactionIsPlanned === 0) {
    await applyWalletBalanceDelta(db, userId, existingTx.transactionType, existingTx.transactionWalletId, existingTx.transactionTargetWalletId, existingTx.transactionAmount, existingTx.transactionAdminFee, -1);
  }

  if (newIsPlannedInt === 0) {
    await applyWalletBalanceDelta(db, userId, existingTx.transactionType, newWalletId, newTargetWalletId, newAmount, newAdminFee, 1);
  }

  const updates: Partial<typeof schema.transactions.$inferInsert> = {
    transactionAmount: newAmount,
    transactionAdminFee: newAdminFee,
    transactionWalletId: newWalletId,
    transactionTargetWalletId: newTargetWalletId,
    transactionCategoryId: newCategoryId,
    transactionBudgetId: newBudgetId,
    transactionIsPlanned: newIsPlannedInt,
  };

  if (description !== undefined) updates.transactionDescription = description ? description.trim() : null;
  if (transactionDate !== undefined) updates.transactionDate = normalizeToIsoTimestamp(transactionDate);

  const updated = await db
    .update(schema.transactions)
    .set(updates)
    .where(and(eq(schema.transactions.transactionId, cleanTxId), eq(schema.transactions.transactionUserId, userId)))
    .returning();

  return updated[0];
}

export async function listTransactions(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  filter: ListTransactionsFilter = {}
) {
  const { walletId, targetWalletId, categoryId, budgetId, type, isPlanned, startDate, endDate, limit = 50, offset = 0 } = filter;
  const conditions = [eq(schema.transactions.transactionUserId, userId)];

  if (walletId && walletId.trim() !== "") {
    conditions.push(eq(schema.transactions.transactionWalletId, walletId.trim()));
  }
  if (targetWalletId && targetWalletId.trim() !== "") {
    conditions.push(eq(schema.transactions.transactionTargetWalletId, targetWalletId.trim()));
  }
  if (categoryId && categoryId.trim() !== "") {
    conditions.push(eq(schema.transactions.transactionCategoryId, categoryId.trim()));
  }
  if (budgetId && budgetId.trim() !== "") {
    conditions.push(eq(schema.transactions.transactionBudgetId, budgetId.trim()));
  }
  if (type && (type === "expense" || type === "income" || type === "transfer")) {
    conditions.push(eq(schema.transactions.transactionType, type));
  }
  if (isPlanned !== undefined) {
    conditions.push(eq(schema.transactions.transactionIsPlanned, isPlanned ? 1 : 0));
  }
  if (startDate !== undefined) {
    if (!isValidIsoDateOrTimestamp(startDate)) throw new Error("Validation Error: 'startDate' must be a valid ISO date or timestamp");
    conditions.push(gte(schema.transactions.transactionDate, normalizeToIsoTimestamp(startDate)));
  }
  if (endDate !== undefined) {
    if (!isValidIsoDateOrTimestamp(endDate)) throw new Error("Validation Error: 'endDate' must be a valid ISO date or timestamp");
    const cleanEndDate = /^\d{4}-\d{2}-\d{2}$/.test(endDate.trim())
      ? `${endDate.trim()}T23:59:59.999Z`
      : normalizeToIsoTimestamp(endDate);
    conditions.push(lte(schema.transactions.transactionDate, cleanEndDate));
  }

  const safeLimit = Math.min(Math.max(1, Number(limit) || 50), 200);
  const safeOffset = Math.max(0, Number(offset) || 0);

  return await db
    .select()
    .from(schema.transactions)
    .where(and(...conditions))
    .orderBy(desc(schema.transactions.transactionDate), desc(schema.transactions.transactionCreatedAt))
    .limit(safeLimit)
    .offset(safeOffset);
}
