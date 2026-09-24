import { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { eq, and, sql } from "drizzle-orm";
import { currentIsoTimestamp } from "../utils/date";
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
};

interface RawWalletLastTxRow {
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
  db: DrizzleD1Database<typeof schema>,
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
      WHERE t.transaction_user_id = ${userId} AND t.transaction_is_planned = 0
      
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

  const rows = await db.all<RawWalletLastTxRow>(query);
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
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  isLockedFilter?: unknown,
  includeLastTransaction: boolean = true
): Promise<WalletWithLastTransaction[]> {
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
    .where(and(...conditions));

  if (!includeLastTransaction || wallets.length === 0) {
    return wallets;
  }

  const lastTxMap = await fetchLatestTransactionsByWallet(db, userId);
  return wallets.map((w) => ({
    ...w,
    lastTransaction: lastTxMap.get(w.walletId) ?? null,
  }));
}

export async function createWallet(
  db: DrizzleD1Database<typeof schema>,
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

  return result[0];
}

export async function updateWallet(
  db: DrizzleD1Database<typeof schema>,
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
  const existing = await db
    .select()
    .from(schema.wallets)
    .where(
      and(
        eq(schema.wallets.walletId, cleanWalletId),
        eq(schema.wallets.walletUserId, userId)
      )
    )
    .get();

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
