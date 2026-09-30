import { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { eq, and, or, asc, desc, gte, lte, sql, inArray } from "drizzle-orm";
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
function parseMultiIdFilter(val: unknown): string[] {
  if (Array.isArray(val)) {
    return val.map((s) => String(s).trim()).filter((s) => s.length > 0);
  }
  if (typeof val === "string") {
    return val.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  }
  return [];
}

export interface ListTransactionsFilters {
  walletId?: unknown;
  targetWalletId?: unknown;
  categoryId?: unknown;
  budgetId?: unknown;
  type?: unknown;
  status?: unknown;
  q?: unknown;
  search?: unknown;
  isPlanned?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  limit?: unknown;
  offset?: unknown;
  orderBy?: unknown;
  direction?: unknown;
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
    status,
    q,
    search,
    isPlanned,
    startDate,
    endDate,
    limit = 50,
    offset = 0,
    orderBy,
    direction,
  } = filters;

  const conditions = [eq(schema.transactions.transactionUserId, userId)];

  const walletIds = parseMultiIdFilter(walletId);
  const targetWalletIds = parseMultiIdFilter(targetWalletId);

  const sourceCondition =
    walletIds.length === 1
      ? eq(schema.transactions.transactionWalletId, walletIds[0])
      : walletIds.length > 1
        ? inArray(schema.transactions.transactionWalletId, walletIds)
        : undefined;

  const walletStatementDestinationCondition =
    walletIds.length === 1
      ? eq(schema.transactions.transactionTargetWalletId, walletIds[0])
      : walletIds.length > 1
        ? inArray(schema.transactions.transactionTargetWalletId, walletIds)
        : undefined;

  const explicitDestinationCondition =
    targetWalletIds.length === 1
      ? eq(schema.transactions.transactionTargetWalletId, targetWalletIds[0])
      : targetWalletIds.length > 1
        ? inArray(schema.transactions.transactionTargetWalletId, targetWalletIds)
        : undefined;

  if (sourceCondition && explicitDestinationCondition) {
    conditions.push(and(sourceCondition, explicitDestinationCondition)!);
  } else if (sourceCondition && walletStatementDestinationCondition) {
    conditions.push(or(sourceCondition, walletStatementDestinationCondition)!);
  } else if (explicitDestinationCondition) {
    conditions.push(explicitDestinationCondition);
  }

  const categoryIds = parseMultiIdFilter(categoryId);
  if (categoryIds.length === 1) {
    conditions.push(eq(schema.transactions.transactionCategoryId, categoryIds[0]));
  } else if (categoryIds.length > 1) {
    conditions.push(inArray(schema.transactions.transactionCategoryId, categoryIds));
  }

  const budgetIds = parseMultiIdFilter(budgetId);
  if (budgetIds.length === 1) {
    conditions.push(eq(schema.transactions.transactionBudgetId, budgetIds[0]));
  } else if (budgetIds.length > 1) {
    conditions.push(inArray(schema.transactions.transactionBudgetId, budgetIds));
  }

  const rawSearch = typeof q === "string" ? q.trim() : typeof search === "string" ? search.trim() : "";
  if (rawSearch.length > 0) {
    const cleanSearch = rawSearch.toLowerCase();
    conditions.push(
      sql`LOWER(${schema.transactions.transactionDescription}) LIKE ${"%" + cleanSearch + "%"}`
    );
  }
  if (
    type !== undefined &&
    (type === "expense" || type === "income" || type === "transfer")
  ) {
    conditions.push(eq(schema.transactions.transactionType, type));
  }
  if (status !== undefined) {
    if (typeof status !== "string") {
      validationError("Validation Error: 'status' must be 'realized', 'planned', or 'all'", "status");
    }
    const cleanStatus = status.trim().toLowerCase();
    if (cleanStatus === "realized") {
      conditions.push(eq(schema.transactions.transactionIsPlanned, 0));
    } else if (cleanStatus === "planned") {
      conditions.push(eq(schema.transactions.transactionIsPlanned, 1));
    } else if (cleanStatus === "all") {
      // Unconstrained planned status
    } else {
      validationError("Validation Error: 'status' must be 'realized', 'planned', or 'all'", "status");
    }
  } else if (isPlanned !== undefined) {
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

  const sortColumns = {
    date: schema.transactions.transactionDate,
    amount: schema.transactions.transactionAmount,
    createdat: schema.transactions.transactionCreatedAt,
    description: schema.transactions.transactionDescription,
  } as const;

  let sortKey: keyof typeof sortColumns = "date";
  if (orderBy !== undefined) {
    if (typeof orderBy !== "string") {
      validationError(
        "Validation Error: 'orderBy' must be one of 'date', 'amount', 'createdAt', 'description'",
        "orderBy"
      );
    }
    const cleanOrderBy = orderBy.trim().toLowerCase();
    if (!(cleanOrderBy in sortColumns)) {
      validationError(
        "Validation Error: 'orderBy' must be one of 'date', 'amount', 'createdAt', 'description'",
        "orderBy"
      );
    }
    sortKey = cleanOrderBy as keyof typeof sortColumns;
  }

  let sortDir: "asc" | "desc" = "desc";
  if (direction !== undefined) {
    if (typeof direction !== "string") {
      validationError(
        "Validation Error: 'direction' must be either 'asc' or 'desc'",
        "direction"
      );
    }
    const cleanDirection = direction.trim().toLowerCase();
    if (cleanDirection !== "asc" && cleanDirection !== "desc") {
      validationError(
        "Validation Error: 'direction' must be either 'asc' or 'desc'",
        "direction"
      );
    }
    sortDir = cleanDirection;
  }

  const primarySort =
    sortDir === "asc" ? asc(sortColumns[sortKey]) : desc(sortColumns[sortKey]);

  const [items, countResult] = await Promise.all([
    db
      .select()
      .from(schema.transactions)
      .where(and(...conditions))
      .orderBy(primarySort, desc(schema.transactions.transactionCreatedAt))
      .limit(safeLimit)
      .offset(safeOffset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(schema.transactions)
      .where(and(...conditions)),
  ]);

  const total = Number(countResult[0]?.count || 0);
  const totalPages = Math.ceil(total / safeLimit);
  const hasNext = safeOffset + items.length < total;

  return {
    items,
    pagination: {
      total,
      limit: safeLimit,
      offset: safeOffset,
      hasNext,
      totalPages,
    },
  };
}

export async function getTransactionById(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  transactionId: unknown
) {
  if (!isValidUUID(transactionId)) {
    validationError("Validation Error: Valid string 'transactionId' (UUID) is required", "transactionId");
  }
  const cleanId = (transactionId as string).trim();
  const tx = await db
    .select()
    .from(schema.transactions)
    .where(
      and(
        eq(schema.transactions.transactionId, cleanId),
        eq(schema.transactions.transactionUserId, userId)
      )
    )
    .get();

  if (!tx) {
    notFound("Transaction", cleanId);
  }
  return tx;
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
  let notice: string | undefined;
  if (txType === "expense" && Number(wallet.walletIsLocked) === 1) {
    notice = `Notice: Expense recorded on locked wallet '${cleanWalletId}'. Protected capital reserve reduced.`;
  }

  return {
    ...tx[0],
    ...(notice ? { notice } : {}),
  };
}

export interface UpdateTransactionParams {
  type?: unknown;
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
    type,
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

  let newType = existingTx.transactionType;
  if (type !== undefined) {
    if (
      typeof type !== "string" ||
      !["expense", "income", "transfer"].includes(type.trim().toLowerCase())
    ) {
      validationError(
        "Validation Error: 'type' must be 'expense', 'income', or 'transfer'",
        "type"
      );
    }
    newType = type.trim().toLowerCase();
  }

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
  if (newType === "transfer") {
    if (targetWalletId !== undefined) {
      if (targetWalletId === null || targetWalletId === "") {
        validationError(
          "Validation Error: 'targetWalletId' is required for transfer transactions",
          "targetWalletId"
        );
      }
      if (!isValidUUID(targetWalletId)) {
        validationError(
          "Validation Error: 'targetWalletId' must be a valid UUID",
          "targetWalletId"
        );
      }
      const cleanTWId = (targetWalletId as string).trim();
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
    } else if (!newTargetWalletId) {
      validationError(
        "Validation Error: 'targetWalletId' is required when switching to a transfer transaction",
        "targetWalletId"
      );
    }

    if (newWalletId === newTargetWalletId) {
      validationError(
        "Validation Error: 'walletId' and 'targetWalletId' cannot be the same wallet",
        "targetWalletId"
      );
    }
  } else {
    if (targetWalletId !== undefined && targetWalletId !== null && targetWalletId !== "") {
      validationError(
        "Validation Error: 'targetWalletId' is only allowed for transfer transactions",
        "targetWalletId"
      );
    }
    newTargetWalletId = null;
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
  if (newType !== "expense") {
    newBudgetId = null;
  } else if (budgetId !== undefined) {
    if (budgetId === null || budgetId === "") {
      newBudgetId = null;
    } else {
      if (!isValidUUID(budgetId)) validationError("Validation Error: 'budgetId' must be a valid UUID", "budgetId");
      const cleanBId = (budgetId as string).trim();
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
      newType,
      newWalletId,
      newTargetWalletId,
      newAmount,
      newAdminFee,
      1
    );
  }

  const updates: Partial<typeof schema.transactions.$inferInsert> = {
    transactionType: newType,
    transactionAmount: newAmount,
    transactionAdminFee: newAdminFee,
    transactionWalletId: newWalletId,
    transactionTargetWalletId: newType === "transfer" ? newTargetWalletId : null,
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

  let notice: string | undefined;
  if (
    (newType === "expense" || newType === "transfer") &&
    newIsPlannedInt === 0 &&
    newWalletId
  ) {
    const sourceWallet = await db
      .select()
      .from(schema.wallets)
      .where(
        and(
          eq(schema.wallets.walletId, newWalletId),
          eq(schema.wallets.walletUserId, userId)
        )
      )
      .get();
    if (sourceWallet && Number(sourceWallet.walletIsLocked) === 1) {
      notice = `Notice: ${newType === "expense" ? "Expense recorded" : "Outward transfer"} on locked wallet '${newWalletId}'. Protected capital reserve reduced.`;
    }
  }

  return {
    ...updated[0],
    ...(notice ? { notice } : {}),
  };
}

export async function deleteTransaction(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  transactionId: unknown
): Promise<{ success: boolean; message: string; deletedTransactionId: string }> {
  if (!isValidUUID(transactionId)) {
    validationError("Validation Error: Valid string 'transactionId' (UUID) is required", "transactionId");
  }

  const cleanTxId = (transactionId as string).trim();
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

  // Atomic Balance Reversal for realized transactions
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

  await db
    .delete(schema.transactions)
    .where(
      and(
        eq(schema.transactions.transactionId, cleanTxId),
        eq(schema.transactions.transactionUserId, userId)
      )
    );

  return {
    success: true,
    message: `Transaction ${cleanTxId} successfully deleted and balance reconciled.`,
    deletedTransactionId: cleanTxId,
  };
}
