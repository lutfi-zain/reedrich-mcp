import { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { eq, and } from "drizzle-orm";
import { currentIsoTimestamp } from "../utils/date";
import {
  validationError,
  notFound,
  isValidUUID,
  isValidFiniteNumber,
} from "./errors";

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

export async function listWallets(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  isLockedFilter?: unknown
) {
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
  return db
    .select()
    .from(schema.wallets)
    .where(and(...conditions));
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
    updates.walletBalance = balance;
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
