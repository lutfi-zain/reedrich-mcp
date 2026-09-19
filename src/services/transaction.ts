import { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import {
  currentIsoTimestamp,
  normalizeToIsoTimestamp,
  isValidIsoDateOrTimestamp,
} from "../utils/date";
import {
  ServiceError,
  validationError,
  notFound,
  isValidPositiveNumber,
  isValidFiniteNumber,
  isValidUUID,
} from "./errors";

export class WalletRequiredError extends ServiceError {
  public readonly actionRequired = "auto_create_wallet";
  public readonly instruction =
    "Buat dompet terlebih dahulu dengan manage_wallet(action: 'create', name: '...') dan pasang kategori default dengan manage_category(action: 'seed_defaults'), lalu catat transaksi ini.";
  constructor() {
    super("VALIDATION", "Dompet belum tersedia.");
    this.name = "WalletRequiredError";
  }
}

export async function applyBalanceDelta(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  txType: string,
  wId: string,
  targetWId: string | null,
  amt: number,
  fee: number,
  multiplier: 1 | -1
) {
  if (txType === "expense") {
    const delta = -(amt + fee) * multiplier;
    await db
      .update(schema.wallets)
      .set({ walletBalance: sql`wallet_balance + ${delta}` })
      .where(
        and(
          eq(schema.wallets.walletId, wId),
          eq(schema.wallets.walletUserId, userId)
        )
      );
  } else if (txType === "income") {
    const delta = (amt - fee) * multiplier;
    await db
      .update(schema.wallets)
      .set({ walletBalance: sql`wallet_balance + ${delta}` })
      .where(
        and(
          eq(schema.wallets.walletId, wId),
          eq(schema.wallets.walletUserId, userId)
        )
      );
  } else if (txType === "transfer" && targetWId) {
    const sourceDelta = -(amt + fee) * multiplier;
    const targetDelta = amt * multiplier;
    await db
      .update(schema.wallets)
      .set({ walletBalance: sql`wallet_balance + ${sourceDelta}` })
      .where(
        and(
          eq(schema.wallets.walletId, wId),
          eq(schema.wallets.walletUserId, userId)
        )
      );
    await db
      .update(schema.wallets)
      .set({ walletBalance: sql`wallet_balance + ${targetDelta}` })
      .where(
        and(
          eq(schema.wallets.walletId, targetWId),
          eq(schema.wallets.walletUserId, userId)
        )
      );
  }
}

export interface ListTransactionsFilters {
  walletId?: unknown;
  targetWalletId?: unknown;
  categoryId?: unknown;
  budgetId?: unknown;
  type?: unknown;
  isPlanned?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  limit?: unknown;
  offset?: unknown;
}

export async function listTransactions(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  filters: ListTransactionsFilters = {}
) {
  const {
    walletId,
    targetWalletId,
    categoryId,
    budgetId,
    type,
    isPlanned,
    startDate,
    endDate,
    limit = 50,
    offset = 0,
  } = filters;

  const conditions = [eq(schema.transactions.transactionUserId, userId)];

  if (typeof walletId === "string" && walletId.trim() !== "") {
    conditions.push(eq(schema.transactions.transactionWalletId, walletId.trim()));
  }
  if (typeof targetWalletId === "string" && targetWalletId.trim() !== "") {
    conditions.push(
      eq(schema.transactions.transactionTargetWalletId, targetWalletId.trim())
    );
  }
  if (typeof categoryId === "string" && categoryId.trim() !== "") {
    conditions.push(
      eq(schema.transactions.transactionCategoryId, categoryId.trim())
    );
  }
  if (typeof budgetId === "string" && budgetId.trim() !== "") {
    conditions.push(
      eq(schema.transactions.transactionBudgetId, budgetId.trim())
    );
  }
  if (
    type !== undefined &&
    (type === "expense" || type === "income" || type === "transfer")
  ) {
    conditions.push(eq(schema.transactions.transactionType, type));
  }
  if (isPlanned !== undefined) {
    conditions.push(
      eq(schema.transactions.transactionIsPlanned, isPlanned ? 1 : 0)
    );
  }
  if (startDate !== undefined) {
    if (typeof startDate !== "string" || !isValidIsoDateOrTimestamp(startDate)) {
      validationError(
        "Validation Error: 'startDate' must be a valid ISO date or timestamp",
        "startDate"
      );
    }
    conditions.push(
      gte(schema.transactions.transactionDate, normalizeToIsoTimestamp(startDate))
    );
  }
  if (endDate !== undefined) {
    if (typeof endDate !== "string" || !isValidIsoDateOrTimestamp(endDate)) {
      validationError(
        "Validation Error: 'endDate' must be a valid ISO date or timestamp",
        "endDate"
      );
    }
    const cleanEndDate = /^\d{4}-\d{2}-\d{2}$/.test(endDate.trim())
      ? `${endDate.trim()}T23:59:59.999Z`
      : normalizeToIsoTimestamp(endDate);
    conditions.push(lte(schema.transactions.transactionDate, cleanEndDate));
  }

  const safeLimit = Math.min(Math.max(1, Number(limit) || 50), 200);
  const safeOffset = Math.max(0, Number(offset) || 0);

  return db
    .select()
    .from(schema.transactions)
    .where(and(...conditions))
    .orderBy(
      desc(schema.transactions.transactionDate),
      desc(schema.transactions.transactionCreatedAt)
    )
    .limit(safeLimit)
    .offset(safeOffset);
}

export interface RecordTransactionParams {
  walletId: unknown;
  categoryId: unknown;
  budgetId?: unknown;
  amount: unknown;
  adminFee?: unknown;
  type?: unknown;
  description?: unknown;
  isPlanned?: unknown;
  transactionDate?: unknown;
}

export async function recordTransaction(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  params: RecordTransactionParams
) {
  const [walletCheck] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.wallets)
    .where(eq(schema.wallets.walletUserId, userId));

  if (Number(walletCheck?.count || 0) === 0) {
    throw new WalletRequiredError();
  }

  const {
    walletId,
    categoryId,
    budgetId,
    amount,
    adminFee,
    type,
    description,
    isPlanned,
    transactionDate,
  } = params;

  if (!isValidPositiveNumber(amount)) {
    validationError(
      "Validation Error: Transaction 'amount' must be a positive finite number greater than 0",
      "amount"
    );
  }
  if (!isValidUUID(walletId)) {
    validationError("Validation Error: Valid string 'walletId' (UUID) is required", "walletId");
  }
  if (!isValidUUID(categoryId)) {
    validationError("Validation Error: Valid string 'categoryId' (UUID) is required", "categoryId");
  }
  if (adminFee !== undefined && (!isValidFiniteNumber(adminFee) || adminFee < 0)) {
    validationError("Validation Error: 'adminFee' must be a non-negative finite number", "adminFee");
  }
  if (
    transactionDate &&
    (typeof transactionDate !== "string" || !isValidIsoDateOrTimestamp(transactionDate))
  ) {
    validationError(
      "Validation Error: 'transactionDate' must be in valid ISO format (e.g. YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss+07:00)",
      "transactionDate"
    );
  }
  if (description && (typeof description !== "string" || description.length > 500)) {
    validationError("Validation Error: 'description' cannot exceed 500 characters", "description");
  }

  const cleanWalletId = walletId.trim();
  const cleanCategoryId = categoryId.trim();
  const cleanAdminFee = isValidFiniteNumber(adminFee) && adminFee >= 0 ? adminFee : 0;
  const txType = type === "income" ? "income" : "expense";

  const wallet = await db
    .select()
    .from(schema.wallets)
    .where(
      and(
        eq(schema.wallets.walletId, cleanWalletId),
        eq(schema.wallets.walletUserId, userId)
      )
    )
    .get();
  if (!wallet) notFound("Wallet", cleanWalletId);

  const category = await db
    .select()
    .from(schema.categories)
    .where(
      and(
        eq(schema.categories.categoryId, cleanCategoryId),
        eq(schema.categories.categoryUserId, userId)
      )
    )
    .get();
  if (!category) notFound("Category", cleanCategoryId);

  let cleanBudgetId: string | null = null;
  if (budgetId) {
    if (!isValidUUID(budgetId)) {
      validationError("Validation Error: 'budgetId' must be a valid string (UUID)", "budgetId");
    }
    const targetBudgetId = budgetId.trim();
    const budget = await db
      .select()
      .from(schema.budgets)
      .where(
        and(
          eq(schema.budgets.budgetId, targetBudgetId),
          eq(schema.budgets.budgetUserId, userId)
        )
      )
      .get();
    if (!budget) notFound("Budget", targetBudgetId);
    cleanBudgetId = targetBudgetId;
  }

  const dateStr = normalizeToIsoTimestamp(
    typeof transactionDate === "string" ? transactionDate : undefined
  );
  const isPlannedInt = isPlanned ? 1 : 0;
  const newTransactionId = crypto.randomUUID();
  const nowIso = currentIsoTimestamp();

  const tx = await db
    .insert(schema.transactions)
    .values({
      transactionId: newTransactionId,
      transactionUserId: userId,
      transactionWalletId: cleanWalletId,
      transactionCategoryId: cleanCategoryId,
      transactionBudgetId: cleanBudgetId,
      transactionAmount: amount,
      transactionAdminFee: cleanAdminFee,
      transactionType: txType,
      transactionDescription:
        typeof description === "string" ? description.trim() : null,
      transactionIsPlanned: isPlannedInt,
      transactionDate: dateStr,
      transactionCreatedAt: nowIso,
    })
    .returning();

  if (!isPlannedInt) {
    await applyBalanceDelta(
      db,
      userId,
      txType,
      cleanWalletId,
      null,
      amount,
      cleanAdminFee,
      1
    );
  }

  return tx[0];
}

export interface UpdateTransactionParams {
  amount?: unknown;
  adminFee?: unknown;
  walletId?: unknown;
  targetWalletId?: unknown;
  categoryId?: unknown;
  budgetId?: unknown;
  description?: unknown;
  transactionDate?: unknown;
  isPlanned?: unknown;
}

export async function updateTransaction(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  transactionId: unknown,
  params: UpdateTransactionParams
) {
  if (!isValidUUID(transactionId)) {
    validationError("Validation Error: Valid string 'transactionId' (UUID) is required", "transactionId");
  }
  const cleanTxId = transactionId.trim();
  const existingTx = await db
    .select()
    .from(schema.transactions)
    .where(
      and(
        eq(schema.transactions.transactionId, cleanTxId),
        eq(schema.transactions.transactionUserId, userId)
      )
    )
    .get();

  if (!existingTx) {
    notFound("Transaction", cleanTxId);
  }

  const {
    amount,
    adminFee,
    walletId,
    targetWalletId,
    categoryId,
    budgetId,
    description,
    transactionDate,
    isPlanned,
  } = params;

  if (amount !== undefined && !isValidPositiveNumber(amount)) {
    validationError("Validation Error: 'amount' must be a positive finite number greater than 0", "amount");
  }
  if (adminFee !== undefined && (!isValidFiniteNumber(adminFee) || adminFee < 0)) {
    validationError("Validation Error: 'adminFee' must be a non-negative finite number", "adminFee");
  }
  if (
    transactionDate !== undefined &&
    (typeof transactionDate !== "string" || !isValidIsoDateOrTimestamp(transactionDate))
  ) {
    validationError(
      "Validation Error: 'transactionDate' must be in valid ISO format (e.g. YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss+07:00)",
      "transactionDate"
    );
  }
  if (description !== undefined && (typeof description !== "string" || description.length > 500)) {
    validationError("Validation Error: 'description' cannot exceed 500 characters", "description");
  }

  let newWalletId = existingTx.transactionWalletId;
  if (walletId !== undefined) {
    if (!isValidUUID(walletId)) validationError("Validation Error: 'walletId' must be a valid UUID", "walletId");
    const cleanWId = walletId.trim();
    const w = await db
      .select()
      .from(schema.wallets)
      .where(
        and(
          eq(schema.wallets.walletId, cleanWId),
          eq(schema.wallets.walletUserId, userId)
        )
      )
      .get();
    if (!w) notFound("Wallet", cleanWId);
    newWalletId = cleanWId;
  }

  let newTargetWalletId = existingTx.transactionTargetWalletId;
  if (targetWalletId !== undefined) {
    if (targetWalletId === null || targetWalletId === "") {
      newTargetWalletId = null;
    } else {
      if (!isValidUUID(targetWalletId)) validationError("Validation Error: 'targetWalletId' must be a valid UUID", "targetWalletId");
      const cleanTWId = targetWalletId.trim();
      const tw = await db
        .select()
        .from(schema.wallets)
        .where(
          and(
            eq(schema.wallets.walletId, cleanTWId),
            eq(schema.wallets.walletUserId, userId)
          )
        )
        .get();
      if (!tw) notFound("Target Wallet", cleanTWId);
      newTargetWalletId = cleanTWId;
    }
  }

  let newCategoryId = existingTx.transactionCategoryId;
  if (categoryId !== undefined) {
    if (categoryId === null || categoryId === "") {
      newCategoryId = null;
    } else {
      if (!isValidUUID(categoryId)) validationError("Validation Error: 'categoryId' must be a valid UUID", "categoryId");
      const cleanCatId = categoryId.trim();
      const cat = await db
        .select()
        .from(schema.categories)
        .where(
          and(
            eq(schema.categories.categoryId, cleanCatId),
            eq(schema.categories.categoryUserId, userId)
          )
        )
        .get();
      if (!cat) notFound("Category", cleanCatId);
      newCategoryId = cleanCatId;
    }
  }

  let newBudgetId = existingTx.transactionBudgetId;
  if (budgetId !== undefined) {
    if (budgetId === null || budgetId === "") {
      newBudgetId = null;
    } else {
      if (!isValidUUID(budgetId)) validationError("Validation Error: 'budgetId' must be a valid UUID", "budgetId");
      const cleanBId = budgetId.trim();
      const b = await db
        .select()
        .from(schema.budgets)
        .where(
          and(
            eq(schema.budgets.budgetId, cleanBId),
            eq(schema.budgets.budgetUserId, userId)
          )
        )
        .get();
      if (!b) notFound("Budget", cleanBId);
      newBudgetId = cleanBId;
    }
  }

  const newAmount = amount !== undefined && isValidPositiveNumber(amount) ? amount : existingTx.transactionAmount;
  const newAdminFee = adminFee !== undefined && isValidFiniteNumber(adminFee) ? adminFee : existingTx.transactionAdminFee;
  const newIsPlannedInt = isPlanned !== undefined ? (isPlanned ? 1 : 0) : existingTx.transactionIsPlanned;

  // Atomic Balance Reconciliation
  if (existingTx.transactionIsPlanned === 0) {
    await applyBalanceDelta(
      db,
      userId,
      existingTx.transactionType,
      existingTx.transactionWalletId,
      existingTx.transactionTargetWalletId,
      existingTx.transactionAmount,
      existingTx.transactionAdminFee,
      -1
    );
  }

  if (newIsPlannedInt === 0) {
    await applyBalanceDelta(
      db,
      userId,
      existingTx.transactionType,
      newWalletId,
      newTargetWalletId,
      newAmount,
      newAdminFee,
      1
    );
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

  if (description !== undefined) {
    updates.transactionDescription =
      typeof description === "string" ? description.trim() : null;
  }
  if (transactionDate !== undefined) {
    updates.transactionDate = normalizeToIsoTimestamp(
      typeof transactionDate === "string" ? transactionDate : undefined
    );
  }

  const updated = await db
    .update(schema.transactions)
    .set(updates)
    .where(
      and(
        eq(schema.transactions.transactionId, cleanTxId),
        eq(schema.transactions.transactionUserId, userId)
      )
    )
    .returning();

  return updated[0];
}
