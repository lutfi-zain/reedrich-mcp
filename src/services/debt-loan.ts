import { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  currentIsoTimestamp,
  isValidIsoDateOrTimestamp,
} from "../utils/date";
import {
  validationError,
  notFound,
  isValidPositiveNumber,
  isValidUUID,
} from "./errors";

export interface ListDebtsLoansFilters {
  status?: unknown;
  type?: unknown;
}

export async function listDebtsLoans(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  filters: ListDebtsLoansFilters = {}
) {
  const { status, type } = filters;
  const conditions = [eq(schema.debtsLoans.debtLoanUserId, userId)];

  if (
    typeof status === "string" &&
    ["unpaid", "partially_paid", "paid"].includes(status)
  ) {
    conditions.push(eq(schema.debtsLoans.debtLoanStatus, status));
  }
  if (typeof type === "string" && ["debt", "loan"].includes(type)) {
    conditions.push(eq(schema.debtsLoans.debtLoanType, type));
  }

  return db
    .select()
    .from(schema.debtsLoans)
    .where(and(...conditions))
    .orderBy(desc(schema.debtsLoans.debtLoanCreatedAt));
}

export interface CreateDebtLoanParams {
  personName: unknown;
  amount: unknown;
  type?: unknown;
  walletId?: unknown;
  dueDate?: unknown;
  notes?: unknown;
  adjustWalletBalance?: unknown;
}

export async function createDebtLoan(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  params: CreateDebtLoanParams
) {
  const {
    personName,
    amount,
    type,
    walletId,
    dueDate,
    notes,
    adjustWalletBalance,
  } = params;

  if (
    !personName ||
    typeof personName !== "string" ||
    personName.trim().length === 0 ||
    personName.trim().length > 100
  ) {
    validationError(
      "Validation Error: 'personName' is required (1-100 characters)",
      "personName"
    );
  }
  if (!isValidPositiveNumber(amount)) {
    validationError(
      "Validation Error: 'amount' must be a positive finite number greater than 0",
      "amount"
    );
  }

  const cleanType = type === "debt" ? "debt" : "loan";
  const cleanPersonName = personName.trim();
  const shouldAdjustWallet = adjustWalletBalance !== false;

  let cleanWalletId: string | null = null;
  if (walletId) {
    if (!isValidUUID(walletId)) {
      validationError(
        "Validation Error: 'walletId' must be a valid UUID string",
        "walletId"
      );
    }
    const targetWallet = await db
      .select()
      .from(schema.wallets)
      .where(
        and(
          eq(schema.wallets.walletId, walletId.trim()),
          eq(schema.wallets.walletUserId, userId)
        )
      )
      .get();
    if (!targetWallet) {
      notFound("Wallet", walletId.trim());
    }
    cleanWalletId = walletId.trim();
  }

  if (
    dueDate &&
    (typeof dueDate !== "string" || !isValidIsoDateOrTimestamp(dueDate))
  ) {
    validationError(
      "Validation Error: 'dueDate' must be in valid ISO format (e.g. YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss+07:00)",
      "dueDate"
    );
  }
  if (notes && (typeof notes !== "string" || notes.length > 500)) {
    validationError(
      "Validation Error: 'notes' cannot exceed 500 characters",
      "notes"
    );
  }

  const newDebtLoanId = crypto.randomUUID();
  const nowIso = currentIsoTimestamp();
  const cleanDueDate =
    typeof dueDate === "string" && dueDate.trim().length > 0
      ? dueDate.trim()
      : null;

  const newRecord = await db
    .insert(schema.debtsLoans)
    .values({
      debtLoanId: newDebtLoanId,
      debtLoanUserId: userId,
      debtLoanPersonName: cleanPersonName,
      debtLoanType: cleanType,
      debtLoanAmount: amount,
      debtLoanRemainingAmount: amount,
      debtLoanWalletId: cleanWalletId,
      debtLoanDueDate: cleanDueDate,
      debtLoanStatus: "unpaid",
      debtLoanNotes: typeof notes === "string" ? notes.trim() : null,
      debtLoanCreatedAt: nowIso,
    })
    .returning();

  if (shouldAdjustWallet && cleanWalletId) {
    if (cleanType === "loan") {
      await db
        .update(schema.wallets)
        .set({ walletBalance: sql`wallet_balance - ${amount}` })
        .where(
          and(
            eq(schema.wallets.walletId, cleanWalletId),
            eq(schema.wallets.walletUserId, userId)
          )
        );
    } else if (cleanType === "debt") {
      await db
        .update(schema.wallets)
        .set({ walletBalance: sql`wallet_balance + ${amount}` })
        .where(
          and(
            eq(schema.wallets.walletId, cleanWalletId),
            eq(schema.wallets.walletUserId, userId)
          )
        );
    }
  }

  return newRecord[0];
}

export interface RepayDebtLoanParams {
  amount: unknown;
  walletId?: unknown;
  adjustWalletBalance?: unknown;
}

export async function repayDebtLoan(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  debtLoanId: unknown,
  params: RepayDebtLoanParams
) {
  if (!isValidUUID(debtLoanId)) {
    validationError(
      "Validation Error: Valid string 'debtLoanId' (UUID) is required for repay",
      "debtLoanId"
    );
  }
  const { amount, walletId, adjustWalletBalance } = params;
  if (!isValidPositiveNumber(amount)) {
    validationError(
      "Validation Error: Repayment 'amount' must be a positive finite number greater than 0",
      "amount"
    );
  }

  const cleanId = debtLoanId.trim();
  const existingRecord = await db
    .select()
    .from(schema.debtsLoans)
    .where(
      and(
        eq(schema.debtsLoans.debtLoanId, cleanId),
        eq(schema.debtsLoans.debtLoanUserId, userId)
      )
    )
    .get();

  if (!existingRecord) {
    notFound("Debt/Loan", cleanId);
  }

  if (
    existingRecord.debtLoanStatus === "paid" ||
    existingRecord.debtLoanRemainingAmount <= 0
  ) {
    validationError(`Debt/Loan ${cleanId} is already fully paid`);
  }

  if (amount > existingRecord.debtLoanRemainingAmount + 0.001) {
    validationError(
      `Validation Error: Repayment amount (${amount}) cannot exceed remaining balance (${existingRecord.debtLoanRemainingAmount})`
    );
  }

  const shouldAdjustWallet = adjustWalletBalance !== false;
  let cleanWalletId = existingRecord.debtLoanWalletId;
  if (walletId) {
    if (!isValidUUID(walletId)) {
      validationError(
        "Validation Error: 'walletId' must be a valid UUID string",
        "walletId"
      );
    }
    const targetWallet = await db
      .select()
      .from(schema.wallets)
      .where(
        and(
          eq(schema.wallets.walletId, walletId.trim()),
          eq(schema.wallets.walletUserId, userId)
        )
      )
      .get();
    if (!targetWallet) {
      notFound("Wallet", walletId.trim());
    }
    cleanWalletId = walletId.trim();
  }

  const newRemaining = Number(
    (existingRecord.debtLoanRemainingAmount - amount).toFixed(2)
  );
  const newStatus = newRemaining <= 0.001 ? "paid" : "partially_paid";
  const finalRemaining = newRemaining <= 0.001 ? 0 : newRemaining;

  const updated = await db
    .update(schema.debtsLoans)
    .set({
      debtLoanRemainingAmount: finalRemaining,
      debtLoanStatus: newStatus,
    })
    .where(
      and(
        eq(schema.debtsLoans.debtLoanId, cleanId),
        eq(schema.debtsLoans.debtLoanUserId, userId)
      )
    )
    .returning();

  if (shouldAdjustWallet && cleanWalletId) {
    if (existingRecord.debtLoanType === "loan") {
      await db
        .update(schema.wallets)
        .set({ walletBalance: sql`wallet_balance + ${amount}` })
        .where(
          and(
            eq(schema.wallets.walletId, cleanWalletId),
            eq(schema.wallets.walletUserId, userId)
          )
        );
    } else if (existingRecord.debtLoanType === "debt") {
      await db
        .update(schema.wallets)
        .set({ walletBalance: sql`wallet_balance - ${amount}` })
        .where(
          and(
            eq(schema.wallets.walletId, cleanWalletId),
            eq(schema.wallets.walletUserId, userId)
          )
        );
    }
  }

  return updated[0];
}

export interface UpdateDebtLoanParams {
  personName?: unknown;
  dueDate?: unknown;
  notes?: unknown;
}

export async function updateDebtLoan(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  debtLoanId: unknown,
  params: UpdateDebtLoanParams
) {
  if (!isValidUUID(debtLoanId)) {
    validationError(
      "Validation Error: Valid string 'debtLoanId' (UUID) is required for update",
      "debtLoanId"
    );
  }
  const cleanId = debtLoanId.trim();
  const existingRecord = await db
    .select()
    .from(schema.debtsLoans)
    .where(
      and(
        eq(schema.debtsLoans.debtLoanId, cleanId),
        eq(schema.debtsLoans.debtLoanUserId, userId)
      )
    )
    .get();

  if (!existingRecord) {
    notFound("Debt/Loan", cleanId);
  }

  const { personName, dueDate, notes } = params;
  const updateData: Partial<typeof schema.debtsLoans.$inferInsert> = {};

  if (personName !== undefined) {
    if (
      typeof personName !== "string" ||
      personName.trim().length === 0 ||
      personName.trim().length > 100
    ) {
      validationError(
        "Validation Error: 'personName' must be 1-100 characters",
        "personName"
      );
    }
    updateData.debtLoanPersonName = personName.trim();
  }
  if (dueDate !== undefined) {
    if (
      dueDate &&
      (typeof dueDate !== "string" || !isValidIsoDateOrTimestamp(dueDate))
    ) {
      validationError(
        "Validation Error: 'dueDate' must be in valid ISO format",
        "dueDate"
      );
    }
    updateData.debtLoanDueDate =
      typeof dueDate === "string" && dueDate.trim().length > 0
        ? dueDate.trim()
        : null;
  }
  if (notes !== undefined) {
    if (notes && (typeof notes !== "string" || notes.length > 500)) {
      validationError(
        "Validation Error: 'notes' cannot exceed 500 characters",
        "notes"
      );
    }
    updateData.debtLoanNotes =
      typeof notes === "string" && notes.trim().length > 0
        ? notes.trim()
        : null;
  }

  if (Object.keys(updateData).length === 0) {
    return existingRecord;
  }

  const updated = await db
    .update(schema.debtsLoans)
    .set(updateData)
    .where(
      and(
        eq(schema.debtsLoans.debtLoanId, cleanId),
        eq(schema.debtsLoans.debtLoanUserId, userId)
      )
    )
    .returning();

  return updated[0];
}
