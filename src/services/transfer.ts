import { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { eq, and, sql } from "drizzle-orm";
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
import { applyBalanceDelta } from "./transaction";

export class InsufficientWalletsError extends ServiceError {
  public readonly suggestion = "onboarding_assistant";
  constructor() {
    super(
      "VALIDATION",
      "No wallets found. You need at least 2 wallets to transfer funds. Please create wallets first using manage_wallet(action: 'create') or follow the onboarding_assistant prompt."
    );
    this.name = "InsufficientWalletsError";
  }
}

export interface TransferFundsParams {
  sourceWalletId: unknown;
  targetWalletId: unknown;
  amount: unknown;
  adminFee?: unknown;
  categoryId?: unknown;
  description?: unknown;
  isPlanned?: unknown;
  transactionDate?: unknown;
}

export async function transferFunds(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  params: TransferFundsParams
) {
  const [walletCheck] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.wallets)
    .where(eq(schema.wallets.walletUserId, userId));

  if (Number(walletCheck?.count || 0) === 0) {
    throw new InsufficientWalletsError();
  }

  const {
    sourceWalletId,
    targetWalletId,
    amount,
    adminFee,
    categoryId,
    description,
    isPlanned,
    transactionDate,
  } = params;

  if (!isValidPositiveNumber(amount)) {
    validationError(
      "Validation Error: Transfer 'amount' must be a positive finite number greater than 0",
      "amount"
    );
  }
  if (!isValidUUID(sourceWalletId)) {
    validationError(
      "Validation Error: Valid string 'sourceWalletId' (UUID) is required",
      "sourceWalletId"
    );
  }
  if (!isValidUUID(targetWalletId)) {
    validationError(
      "Validation Error: Valid string 'targetWalletId' (UUID) is required",
      "targetWalletId"
    );
  }
  if (sourceWalletId.trim() === targetWalletId.trim()) {
    validationError(
      "Validation Error: 'sourceWalletId' and 'targetWalletId' cannot be the same wallet"
    );
  }
  if (adminFee !== undefined && (!isValidFiniteNumber(adminFee) || adminFee < 0)) {
    validationError(
      "Validation Error: 'adminFee' must be a non-negative finite number",
      "adminFee"
    );
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
    validationError(
      "Validation Error: 'description' cannot exceed 500 characters",
      "description"
    );
  }

  const cleanSourceWalletId = sourceWalletId.trim();
  const cleanTargetWalletId = targetWalletId.trim();
  const cleanAdminFee =
    isValidFiniteNumber(adminFee) && adminFee >= 0 ? adminFee : 0;

  const sourceWallet = await db
    .select()
    .from(schema.wallets)
    .where(
      and(
        eq(schema.wallets.walletId, cleanSourceWalletId),
        eq(schema.wallets.walletUserId, userId)
      )
    )
    .get();
  if (!sourceWallet) notFound("Source Wallet", cleanSourceWalletId);

  const targetWallet = await db
    .select()
    .from(schema.wallets)
    .where(
      and(
        eq(schema.wallets.walletId, cleanTargetWalletId),
        eq(schema.wallets.walletUserId, userId)
      )
    )
    .get();
  if (!targetWallet) notFound("Target Wallet", cleanTargetWalletId);

  let cleanCategoryId: string | null = null;
  if (
    categoryId &&
    typeof categoryId === "string" &&
    categoryId.trim().length > 0
  ) {
    if (!isValidUUID(categoryId)) {
      validationError(
        "Validation Error: 'categoryId' must be a valid string (UUID)",
        "categoryId"
      );
    }
    const targetCatId = categoryId.trim();
    const category = await db
      .select()
      .from(schema.categories)
      .where(
        and(
          eq(schema.categories.categoryId, targetCatId),
          eq(schema.categories.categoryUserId, userId)
        )
      )
      .get();
    if (!category) notFound("Category", targetCatId);
    cleanCategoryId = targetCatId;
  } else {
    let transferCat = await db
      .select()
      .from(schema.categories)
      .where(
        and(
          eq(schema.categories.categoryUserId, userId),
          eq(schema.categories.categoryName, "Transfer")
        )
      )
      .get();
    if (!transferCat) {
      const newCatId = crypto.randomUUID();
      const created = await db
        .insert(schema.categories)
        .values({
          categoryId: newCatId,
          categoryUserId: userId,
          categoryName: "Transfer",
          categoryType: "expense",
          categoryIcon: "🔄",
          categoryCreatedAt: currentIsoTimestamp(),
        })
        .returning();
      transferCat = created[0];
    }
    cleanCategoryId = transferCat.categoryId;
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
      transactionWalletId: cleanSourceWalletId,
      transactionTargetWalletId: cleanTargetWalletId,
      transactionCategoryId: cleanCategoryId,
      transactionAmount: amount,
      transactionAdminFee: cleanAdminFee,
      transactionType: "transfer",
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
      "transfer",
      cleanSourceWalletId,
      cleanTargetWalletId,
      amount,
      cleanAdminFee,
      1
    );
  }
  let notice: string | undefined;
  if (Number(sourceWallet.walletIsLocked) === 1) {
    notice = `Notice: Outward transfer from locked wallet '${cleanSourceWalletId}'. Protected capital reserve reduced.`;
  }

  return {
    ...tx[0],
    ...(notice ? { notice } : {}),
  };
}
