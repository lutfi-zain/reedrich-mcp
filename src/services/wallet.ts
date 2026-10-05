import type { Database } from "../db";
import * as schema from "../db/schema";
import { eq, and, sql, desc, asc } from "drizzle-orm";
import { currentIsoTimestamp, isValidIsoDateOrTimestamp } from "../utils/date";
import {
  calculateWalletPeriodSnapshot,
  normalizeDateBoundary,
  LedgerFilterMode,
  WalletPeriodSnapshotResult,
  TransactionMovement,
} from "../utils/ledger";
import {
  validationError,
  notFound,
  isValidUUID,
  isValidFiniteNumber,
} from "./errors";
import { ensureAdjustmentCategory } from "./category";
export interface CreateWalletParams {
  name: unknown;
  institution?: unknown;
  type?: unknown;
  balance?: unknown;
  currency?: unknown;
  isLocked?: unknown;
}

export interface UpdateWalletParams {
  name?: unknown;
  institution?: unknown;
  type?: unknown;
  balance?: unknown;
  currency?: unknown;
  isLocked?: unknown;
}
export interface WalletLastTransaction {
  transactionId: string;
  date: string;
  type: string;
  direction: "in" | "out";
  amount: number;
  description: string;
  category: string | null;
}

export type WalletWithLastTransaction = typeof schema.wallets.$inferSelect & {
  lastTransaction?: WalletLastTransaction | null;
  snapshot?: WalletPeriodSnapshotResult;
};

export interface ListWalletsOptions {
  isLocked?: unknown;
  includeLastTransaction?: boolean;
  startDate?: unknown;
  endDate?: unknown;
  filter?: unknown;
}
interface RawWalletLastTxRow extends Record<string, unknown> {
  transaction_id: string;
  wallet_id: string;
  transaction_amount: number;
  transaction_type: string;
  direction: "in" | "out";
  transaction_description: string;
  transaction_date: string;
  category_name: string | null;
}

export async function fetchLatestTransactionsByWallet(
  db: Database,
  userId: string
): Promise<Map<string, WalletLastTransaction>> {
  const query = sql`
    WITH WalletMutations AS (
      SELECT 
        t.transaction_id,
        t.transaction_wallet_id AS wallet_id,
        t.transaction_amount,
        t.transaction_type,
        CASE 
          WHEN t.transaction_type = 'income' THEN 'in'
          ELSE 'out'
        END AS direction,
        t.transaction_description,
        t.transaction_date,
        c.category_name
      FROM transactions t
      LEFT JOIN categories c ON t.transaction_category_id = c.category_id
      WHERE t.transaction_user_id = ${userId} AND t.transaction_is_planned = 0 AND (t.transaction_description IS NULL OR t.transaction_description NOT LIKE 'Initial balance%')
      
      UNION ALL
      
      SELECT 
        t.transaction_id,
        t.transaction_target_wallet_id AS wallet_id,
        t.transaction_amount,
        t.transaction_type,
        'in' AS direction,
        t.transaction_description,
        t.transaction_date,
        c.category_name
      FROM transactions t
      LEFT JOIN categories c ON t.transaction_category_id = c.category_id
      WHERE t.transaction_user_id = ${userId} 
        AND t.transaction_is_planned = 0 
        AND t.transaction_target_wallet_id IS NOT NULL
    ),
    Ranked AS (
      SELECT 
        transaction_id,
        wallet_id,
        transaction_amount,
        transaction_type,
        direction,
        transaction_description,
        transaction_date,
        category_name,
        ROW_NUMBER() OVER (PARTITION BY wallet_id ORDER BY transaction_date DESC) as rn
      FROM WalletMutations
    )
    SELECT 
      transaction_id,
      wallet_id,
      transaction_amount,
      transaction_type,
      direction,
      transaction_description,
      transaction_date,
      category_name
    FROM Ranked 
    WHERE rn = 1
  `;

  const rows = (await db.execute<RawWalletLastTxRow>(query)) as unknown as RawWalletLastTxRow[];
  const map = new Map<string, WalletLastTransaction>();
  for (const row of rows) {
    map.set(row.wallet_id, {
      transactionId: row.transaction_id,
      date: row.transaction_date,
      type: row.transaction_type,
      direction: row.direction,
      amount: row.transaction_amount,
      description: row.transaction_description,
      category: row.category_name ?? null,
    });
  }
  return map;
}

export async function listWallets(
  db: Database,
  userId: string,
  isLockedOrOptions?: unknown,
  includeLastTransaction: boolean = true,
  extraOptions?: {
    startDate?: unknown;
    endDate?: unknown;
    filter?: unknown;
  }
): Promise<WalletWithLastTransaction[]> {
  let isLockedFilter: unknown = isLockedOrOptions;
  let includeLast = includeLastTransaction;
  let startDateParam: unknown = extraOptions?.startDate;
  let endDateParam: unknown = extraOptions?.endDate;
  let filterParam: unknown = extraOptions?.filter;

  if (
    isLockedOrOptions &&
    typeof isLockedOrOptions === "object" &&
    !(isLockedOrOptions instanceof Boolean)
  ) {
    const opts = isLockedOrOptions as ListWalletsOptions;
    isLockedFilter = opts.isLocked;
    if (opts.includeLastTransaction !== undefined) {
      includeLast = opts.includeLastTransaction;
    }
    startDateParam = opts.startDate;
    endDateParam = opts.endDate;
    filterParam = opts.filter;
  }

  const conditions = [eq(schema.wallets.walletUserId, userId)];
  if (isLockedFilter !== undefined) {
    if (typeof isLockedFilter === "boolean") {
      conditions.push(eq(schema.wallets.walletIsLocked, isLockedFilter ? 1 : 0));
    } else if (isLockedFilter === 0 || isLockedFilter === 1 || isLockedFilter === "0" || isLockedFilter === "1") {
      conditions.push(eq(schema.wallets.walletIsLocked, Number(isLockedFilter)));
    } else if (isLockedFilter === "true" || isLockedFilter === "false") {
      conditions.push(eq(schema.wallets.walletIsLocked, isLockedFilter === "true" ? 1 : 0));
    }
  }
  const wallets = await db
    .select()
    .from(schema.wallets)
    .where(and(...conditions))
    .orderBy(desc(schema.wallets.walletBalance), asc(schema.wallets.walletId));
  // Check if snapshot is requested
  const wantsSnapshot =
    startDateParam !== undefined || endDateParam !== undefined || filterParam !== undefined;

  let cleanFilter: LedgerFilterMode = "all";
  let cleanStartDate: string | undefined;
  let cleanEndDate: string | undefined;

  if (wantsSnapshot) {
    if (filterParam !== undefined) {
      if (typeof filterParam !== "string") {
        validationError("Validation Error: 'filter' must be 'realized', 'planned', or 'all'", "filter");
      }
      const f = (filterParam as string).trim().toLowerCase();
      if (f !== "realized" && f !== "planned" && f !== "all") {
        validationError("Validation Error: 'filter' must be 'realized', 'planned', or 'all'", "filter");
      }
      cleanFilter = f as LedgerFilterMode;
    }

    const now = new Date();
    const currentY = now.getUTCFullYear();
    const currentM = now.getUTCMonth();
    const currentStartOfMonth = `${currentY}-${String(currentM + 1).padStart(2, "0")}-01T00:00:00.000Z`;
    const lastDayOfMonth = new Date(Date.UTC(currentY, currentM + 1, 0)).getUTCDate();
    const currentEndOfMonth = `${currentY}-${String(currentM + 1).padStart(2, "0")}-${String(lastDayOfMonth).padStart(2, "0")}T23:59:59.999Z`;

    if (startDateParam !== undefined && startDateParam !== null && String(startDateParam).trim() !== "") {
      try {
        cleanStartDate = normalizeDateBoundary(String(startDateParam), "start");
      } catch (err: any) {
        validationError(`Validation Error: Invalid 'startDate': ${err.message}`, "startDate");
      }
    } else {
      cleanStartDate = currentStartOfMonth;
    }

    if (endDateParam !== undefined && endDateParam !== null && String(endDateParam).trim() !== "") {
      try {
        cleanEndDate = normalizeDateBoundary(String(endDateParam), "end");
      } catch (err: any) {
        validationError(`Validation Error: Invalid 'endDate': ${err.message}`, "endDate");
      }
    } else {
      cleanEndDate = currentEndOfMonth;
    }

    if (cleanStartDate! > cleanEndDate!) {
      validationError(
        `Validation Error: 'startDate' (${cleanStartDate}) cannot be after 'endDate' (${cleanEndDate})`,
        "startDate"
      );
    }
  }

  let lastTxMap: Map<string, WalletLastTransaction> | null = null;
  if (includeLast && wallets.length > 0) {
    lastTxMap = await fetchLatestTransactionsByWallet(db, userId);
  }

  let movements: TransactionMovement[] = [];
  if (wantsSnapshot && wallets.length > 0) {
    const txRows = await db
      .select({
        transactionId: schema.transactions.transactionId,
        walletId: schema.transactions.transactionWalletId,
        targetWalletId: schema.transactions.transactionTargetWalletId,
        amount: schema.transactions.transactionAmount,
        adminFee: schema.transactions.transactionAdminFee,
        type: schema.transactions.transactionType,
        isPlanned: schema.transactions.transactionIsPlanned,
        date: schema.transactions.transactionDate,
      })
      .from(schema.transactions)
      .where(eq(schema.transactions.transactionUserId, userId));

    movements = txRows as TransactionMovement[];
  }

  const nowIso = currentIsoTimestamp();
  const result = wallets.map((w) => {
    const item: WalletWithLastTransaction = {
      ...w,
      lastTransaction: lastTxMap ? lastTxMap.get(w.walletId) ?? null : undefined,
    };

    if (wantsSnapshot) {
      item.snapshot = calculateWalletPeriodSnapshot({
        walletId: w.walletId,
        currentLiveBalance: w.walletBalance,
        nowIso,
        startDate: cleanStartDate!,
        endDate: cleanEndDate!,
        filter: cleanFilter,
        movements,
      });
    }

    return item;
  });

  if (wantsSnapshot) {
    result.sort((a, b) => {
      const aBal = a.snapshot?.totalBalance ?? a.walletBalance;
      const bBal = b.snapshot?.totalBalance ?? b.walletBalance;
      const diffBal = bBal - aBal;
      if (Math.abs(diffBal) > 1e-6) {
        return diffBal;
      }
      return a.walletId.localeCompare(b.walletId);
    });
  }

  return result;
}
export async function getWalletById(
  db: Database,
  userId: string,
  walletId: unknown,
  includeLastTransaction: boolean = true
): Promise<WalletWithLastTransaction> {
  if (!isValidUUID(walletId)) {
    validationError("Validation Error: Valid string 'walletId' (UUID) is required", "walletId");
  }
  const cleanId = (walletId as string).trim();
  const [wallet] = await db
    .select()
    .from(schema.wallets)
    .where(
      and(
        eq(schema.wallets.walletId, cleanId),
        eq(schema.wallets.walletUserId, userId)
      )
    )
    .limit(1);

  if (!wallet) {
    notFound("Wallet", cleanId);
  }

  let lastTx = null;
  if (includeLastTransaction) {
    const lastTxMap = await fetchLatestTransactionsByWallet(db, userId);
    lastTx = lastTxMap.get(cleanId) ?? null;
  }

  return {
    ...wallet,
    lastTransaction: lastTx,
  };
}

export async function createWallet(
  db: Database,
  userId: string,
  params: CreateWalletParams
) {
  const { name: walletName, institution, type, balance, currency, isLocked } = params;

  let cleanIsLocked = 0;
  if (isLocked !== undefined) {
    if (typeof isLocked === "boolean") {
      cleanIsLocked = isLocked ? 1 : 0;
    } else if (isLocked === 0 || isLocked === 1) {
      cleanIsLocked = isLocked;
    } else {
      validationError(
        "Validation Error: 'isLocked' must be a boolean",
        "isLocked"
      );
    }
  }
  if (
    !walletName ||
    typeof walletName !== "string" ||
    walletName.trim().length === 0 ||
    walletName.trim().length > 100
  ) {
    validationError(
      "Validation Error: Wallet 'name' is required (1-100 characters)",
      "name"
    );
  }

  const allowedTypes = [
    "bank",
    "cash",
    "e-wallet",
    "credit",
    "crypto",
    "investment",
  ];
  const cleanType =
    typeof type === "string" && allowedTypes.includes(type) ? type : "bank";
  const cleanBalance = isValidFiniteNumber(balance) ? balance : 0;
  const cleanCurrency =
    currency &&
    typeof currency === "string" &&
    currency.trim().length > 0 &&
    currency.trim().length <= 10
      ? currency.trim().toUpperCase()
      : "IDR";
  const cleanInstitution =
    institution &&
    typeof institution === "string" &&
    institution.trim().length > 0
      ? institution.trim()
      : "General";

  const newWalletId = crypto.randomUUID();
  const nowIso = currentIsoTimestamp();

  const result = await db
    .insert(schema.wallets)
    .values({
      walletId: newWalletId,
      walletUserId: userId,
      walletName: walletName.trim(),
      walletInstitution: cleanInstitution,
      walletType: cleanType,
      walletBalance: cleanBalance,
      walletCurrency: cleanCurrency,
      walletIsLocked: cleanIsLocked,
      walletCreatedAt: nowIso,
    })
    .returning();

  if (cleanBalance > 0) {
    const adjustmentCategory = await ensureAdjustmentCategory(db, userId);
    await db.insert(schema.transactions).values({
      transactionUserId: userId,
      transactionWalletId: newWalletId,
      transactionCategoryId: adjustmentCategory.categoryId,
      transactionAmount: cleanBalance,
      transactionAdminFee: 0,
      transactionType: "income",
      transactionDescription: `Initial balance: ${walletName.trim()}`,
      transactionIsPlanned: 0,
      transactionDate: nowIso,
    });
  }

  return result[0];
}

export async function updateWallet(
  db: Database,
  userId: string,
  walletId: unknown,
  params: UpdateWalletParams
) {
  if (!isValidUUID(walletId)) {
    validationError(
      "Validation Error: Valid string 'walletId' (UUID) is required for update action",
      "walletId"
    );
  }

  const cleanWalletId = walletId.trim();
  const [existing] = await db
    .select()
    .from(schema.wallets)
    .where(
      and(
        eq(schema.wallets.walletId, cleanWalletId),
        eq(schema.wallets.walletUserId, userId)
      )
    )
    .limit(1);
  if (!existing) {
    notFound("Wallet", cleanWalletId);
  }

  const { name: walletName, institution, type, balance, currency, isLocked } = params;
  const updates: Partial<typeof schema.wallets.$inferInsert> = {};

  if (
    walletName &&
    typeof walletName === "string" &&
    walletName.trim().length > 0 &&
    walletName.trim().length <= 100
  ) {
    updates.walletName = walletName.trim();
  }
  if (institution && typeof institution === "string" && institution.trim().length > 0) {
    updates.walletInstitution = institution.trim();
  }
  if (balance !== undefined) {
    if (!isValidFiniteNumber(balance)) {
      validationError(
        "Validation Error: 'balance' must be a valid finite number",
        "balance"
      );
    }
  }
  if (
    type &&
    typeof type === "string" &&
    ["bank", "cash", "e-wallet", "credit", "crypto", "investment"].includes(type)
  ) {
    updates.walletType = type;
  }
  if (
    currency &&
    typeof currency === "string" &&
    currency.trim().length > 0 &&
    currency.trim().length <= 10
  ) {
    updates.walletCurrency = currency.trim().toUpperCase();
  }
  if (isLocked !== undefined) {
    if (typeof isLocked === "boolean") {
      updates.walletIsLocked = isLocked ? 1 : 0;
    } else if (isLocked === 0 || isLocked === 1) {
      updates.walletIsLocked = isLocked;
    } else {
      validationError(
        "Validation Error: 'isLocked' must be a boolean",
        "isLocked"
      );
    }
  }

  if (Object.keys(updates).length === 0 && balance === undefined) {
    return existing;
  }

  if (balance !== undefined) {
    const delta = Number((balance - existing.walletBalance).toFixed(2));
    if (delta !== 0) {
      const adjustmentCategory = await ensureAdjustmentCategory(db, userId);
      const isIncrease = delta > 0;
      const nowIso = currentIsoTimestamp();
      await db.insert(schema.transactions).values({
        transactionUserId: userId,
        transactionWalletId: cleanWalletId,
        transactionCategoryId: adjustmentCategory.categoryId,
        transactionAmount: Math.abs(delta),
        transactionAdminFee: 0,
        transactionType: isIncrease ? "income" : "expense",
        transactionDescription: `Balance adjustment: ${existing.walletName} → ${balance}`,
        transactionIsPlanned: 0,
        transactionDate: nowIso,
      });
      updates.walletBalance = balance;
    }
  }

  if (Object.keys(updates).length === 0) {
    return existing;
  }

  const result = await db
    .update(schema.wallets)
    .set(updates)
    .where(
      and(
        eq(schema.wallets.walletId, cleanWalletId),
        eq(schema.wallets.walletUserId, userId)
      )
    )
    .returning();

  return result[0];
}
export async function deleteWallet(
  db: Database,
  userId: string,
  walletId: unknown
) {
  const existing = await getWalletById(db, userId, walletId);

  // 1. Balance Zero Guard
  if (Math.abs(existing.walletBalance) > 0.001) {
    validationError(
      "Validation Error: Wallet balance must be 0 before deletion. Please transfer or adjust remaining funds first.",
      "walletBalance"
    );
  }

  // 2. Active Goal Link Guard
  const [linkedGoal] = await db
    .select({ goalName: schema.goals.goalName })
    .from(schema.goalWallets)
    .innerJoin(schema.goals, eq(schema.goalWallets.goalId, schema.goals.goalId))
    .where(
      and(
        eq(schema.goalWallets.walletId, existing.walletId),
        eq(schema.goals.goalUserId, userId),
        eq(schema.goals.goalStatus, "in_progress")
      )
    )
    .limit(1);

  if (linkedGoal) {
    validationError(
      `Validation Error: Cannot delete wallet linked to active goal '${linkedGoal.goalName}'. Unlink the wallet from goals first.`,
      "walletId"
    );
  }

  // 3. Active Recurring Template Guard
  const [linkedTemplate] = await db
    .select({ templateName: schema.recurringTemplates.templateName })
    .from(schema.recurringTemplates)
    .where(
      and(
        eq(schema.recurringTemplates.templateWalletId, existing.walletId),
        eq(schema.recurringTemplates.templateUserId, userId),
        eq(schema.recurringTemplates.templateIsActive, 1)
      )
    )
    .limit(1);

  if (linkedTemplate) {
    validationError(
      `Validation Error: Cannot delete wallet linked to active recurring template '${linkedTemplate.templateName}'. Deactivate or reassign templates first.`,
      "walletId"
    );
  }

  await db
    .delete(schema.wallets)
    .where(
      and(
        eq(schema.wallets.walletId, existing.walletId),
        eq(schema.wallets.walletUserId, userId)
      )
    );

  return {
    success: true,
    message: `Wallet '${existing.walletName}' (${existing.walletId}) successfully deleted.`,
    deletedWalletId: existing.walletId,
  };
}

export interface ReconcileOpeningBalanceResult {
  reconciledCount: number;
  wallets: Array<{
    walletId: string;
    walletName: string;
    delta: number;
    transactionId: string;
  }>;
}

/**
 * Idempotent reconciliation utility that detects wallets whose balances are not
 * fully backed by transaction rows, and inserts missing opening balance transactions.
 */
export async function reconcileMissingOpeningBalances(
  db: Database,
  userId: string
): Promise<ReconcileOpeningBalanceResult> {
  const userWallets = await db
    .select()
    .from(schema.wallets)
    .where(eq(schema.wallets.walletUserId, userId));

  if (userWallets.length === 0) {
    return { reconciledCount: 0, wallets: [] };
  }

  const txRows = await db
    .select({
      walletId: schema.transactions.transactionWalletId,
      targetWalletId: schema.transactions.transactionTargetWalletId,
      amount: schema.transactions.transactionAmount,
      adminFee: schema.transactions.transactionAdminFee,
      type: schema.transactions.transactionType,
    })
    .from(schema.transactions)
    .where(
      and(
        eq(schema.transactions.transactionUserId, userId),
        eq(schema.transactions.transactionIsPlanned, 0)
      )
    );

  const netByWallet = new Map<string, number>();
  for (const tx of txRows) {
    const fee = tx.adminFee || 0;
    if (tx.type === "income") {
      netByWallet.set(tx.walletId, (netByWallet.get(tx.walletId) || 0) + (tx.amount - fee));
    } else if (tx.type === "expense") {
      netByWallet.set(tx.walletId, (netByWallet.get(tx.walletId) || 0) - (tx.amount + fee));
    } else if (tx.type === "transfer") {
      netByWallet.set(tx.walletId, (netByWallet.get(tx.walletId) || 0) - (tx.amount + fee));
      if (tx.targetWalletId) {
        netByWallet.set(tx.targetWalletId, (netByWallet.get(tx.targetWalletId) || 0) + tx.amount);
      }
    }
  }

  const reconciled: ReconcileOpeningBalanceResult["wallets"] = [];
  let adjustmentCategory: { categoryId: string } | null = null;

  for (const w of userWallets) {
    const recordedNet = netByWallet.get(w.walletId) || 0;
    const delta = Number((w.walletBalance - recordedNet).toFixed(2));
    if (delta > 0.001) {
      if (!adjustmentCategory) {
        adjustmentCategory = await ensureAdjustmentCategory(db, userId);
      }
      const newTxId = crypto.randomUUID();
      await db.insert(schema.transactions).values({
        transactionId: newTxId,
        transactionUserId: userId,
        transactionWalletId: w.walletId,
        transactionCategoryId: adjustmentCategory.categoryId,
        transactionAmount: delta,
        transactionAdminFee: 0,
        transactionType: "income",
        transactionDescription: `Initial balance backfill: ${w.walletName}`,
        transactionIsPlanned: 0,
        transactionDate: w.walletCreatedAt || currentIsoTimestamp(),
      });
      reconciled.push({
        walletId: w.walletId,
        walletName: w.walletName,
        delta,
        transactionId: newTxId,
      });
    }
  }

  return {
    reconciledCount: reconciled.length,
    wallets: reconciled,
  };
}
