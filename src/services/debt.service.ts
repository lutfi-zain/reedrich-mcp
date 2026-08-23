import { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  currentIsoTimestamp,
  isValidIsoDateOrTimestamp,
} from "../utils/date";

export type CreateDebtLoanInput = {
  personName: string;
  type?: "debt" | "loan" | string;
  amount: number;
  walletId?: string | null;
  dueDate?: string | null;
  notes?: string | null;
  adjustWalletBalance?: boolean;
};

export type ListDebtsLoansFilter = {
  type?: "debt" | "loan";
  status?: "unpaid" | "partially_paid" | "paid";
};

export type RepayDebtLoanInput = {
  debtLoanId: string;
  amount: number;
  walletId?: string | null;
  notes?: string | null;
  adjustWalletBalance?: boolean;
};

export type UpdateDebtLoanInput = {
  debtLoanId: string;
  personName?: string;
  dueDate?: string | null;
  notes?: string | null;
  status?: "unpaid" | "partially_paid" | "paid";
};

export async function listDebtsLoans(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  filter: ListDebtsLoansFilter = {}
) {
  const { type, status } = filter;
  const conditions = [eq(schema.debtsLoans.debtLoanUserId, userId)];

  if (status && ["unpaid", "partially_paid", "paid"].includes(status)) {
    conditions.push(eq(schema.debtsLoans.debtLoanStatus, status));
  }
  if (type && ["debt", "loan"].includes(type)) {
    conditions.push(eq(schema.debtsLoans.debtLoanType, type));
  }

  return await db
    .select()
    .from(schema.debtsLoans)
    .where(and(...conditions))
    .orderBy(desc(schema.debtsLoans.debtLoanCreatedAt));
}

export async function getDebtLoanById(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  debtLoanId: string
) {
  const cleanId = debtLoanId.trim();
  return await db
    .select()
    .from(schema.debtsLoans)
    .where(and(eq(schema.debtsLoans.debtLoanId, cleanId), eq(schema.debtsLoans.debtLoanUserId, userId)))
    .get();
}

export async function createDebtLoan(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  input: CreateDebtLoanInput
) {
  const { personName, type, amount, walletId, dueDate, notes, adjustWalletBalance } = input;

  if (!personName || typeof personName !== "string" || personName.trim().length === 0 || personName.trim().length > 100) {
    throw new Error("Validation Error: 'personName' is required (1-100 characters)");
  }
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    throw new Error("Validation Error: 'amount' must be a positive finite number greater than 0");
  }

  const cleanType = type === "debt" ? "debt" : "loan";
  const cleanPersonName = personName.trim();
  const shouldAdjustWallet = adjustWalletBalance !== false;

  let cleanWalletId: string | null = null;
  if (walletId) {
    const targetWId = walletId.trim();
    if (targetWId.length === 0) {
      throw new Error("Validation Error: 'walletId' must be a valid UUID string");
    }
    const targetWallet = await db
      .select()
      .from(schema.wallets)
      .where(and(eq(schema.wallets.walletId, targetWId), eq(schema.wallets.walletUserId, userId)))
      .get();
    if (!targetWallet) {
      throw new Error(`Wallet ID ${targetWId} not found or unauthorized`);
    }
    cleanWalletId = targetWId;
  }

  if (dueDate && !isValidIsoDateOrTimestamp(dueDate)) {
    throw new Error("Validation Error: 'dueDate' must be in valid ISO format (e.g. YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss+07:00)");
  }
  if (notes && (typeof notes !== "string" || notes.length > 500)) {
    throw new Error("Validation Error: 'notes' cannot exceed 500 characters");
  }

  const newDebtLoanId = crypto.randomUUID();
  const nowIso = currentIsoTimestamp();
  const cleanDueDate = dueDate ? dueDate.trim() : null;

  const newRecord = await db.insert(schema.debtsLoans).values({
    debtLoanId: newDebtLoanId,
    debtLoanUserId: userId,
    debtLoanPersonName: cleanPersonName,
    debtLoanType: cleanType,
    debtLoanAmount: amount,
    debtLoanRemainingAmount: amount,
    debtLoanWalletId: cleanWalletId,
    debtLoanDueDate: cleanDueDate,
    debtLoanStatus: "unpaid",
    debtLoanNotes: notes ? notes.trim() : null,
    debtLoanCreatedAt: nowIso,
  }).returning();

  if (shouldAdjustWallet && cleanWalletId) {
    if (cleanType === "loan") {
      await db.update(schema.wallets)
        .set({ walletBalance: sql`wallet_balance - ${amount}` })
        .where(and(eq(schema.wallets.walletId, cleanWalletId), eq(schema.wallets.walletUserId, userId)));
    } else if (cleanType === "debt") {
      await db.update(schema.wallets)
        .set({ walletBalance: sql`wallet_balance + ${amount}` })
        .where(and(eq(schema.wallets.walletId, cleanWalletId), eq(schema.wallets.walletUserId, userId)));
    }
  }

  return newRecord[0];
}

export async function repayDebtLoan(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  input: RepayDebtLoanInput
) {
  const { debtLoanId, amount, walletId, notes, adjustWalletBalance } = input;

  if (!debtLoanId || typeof debtLoanId !== "string" || debtLoanId.trim().length === 0) {
    throw new Error("Validation Error: Valid string 'debtLoanId' (UUID) is required for repay");
  }
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    throw new Error("Validation Error: Repayment 'amount' must be a positive finite number greater than 0");
  }

  const cleanId = debtLoanId.trim();
  const existingRecord = await getDebtLoanById(db, userId, cleanId);

  if (!existingRecord) {
    throw new Error(`Debt/Loan ID ${cleanId} not found or unauthorized`);
  }

  if (existingRecord.debtLoanStatus === "paid" || existingRecord.debtLoanRemainingAmount <= 0) {
    throw new Error(`Debt/Loan ${cleanId} is already fully paid`);
  }

  if (amount > existingRecord.debtLoanRemainingAmount + 0.001) {
    throw new Error(`Validation Error: Repayment amount (${amount}) cannot exceed remaining balance (${existingRecord.debtLoanRemainingAmount})`);
  }

  let effectiveWalletId: string | null = existingRecord.debtLoanWalletId;
  if (walletId) {
    const targetWId = walletId.trim();
    if (targetWId.length === 0) throw new Error("Validation Error: 'walletId' must be a valid UUID string");
    const targetWallet = await db.select().from(schema.wallets)
      .where(and(eq(schema.wallets.walletId, targetWId), eq(schema.wallets.walletUserId, userId)))
      .get();
    if (!targetWallet) {
      throw new Error(`Wallet ID ${targetWId} not found or unauthorized`);
    }
    effectiveWalletId = targetWId;
  }

  const shouldAdjustWallet = adjustWalletBalance !== false;
  const newRemaining = Math.max(0, Number((existingRecord.debtLoanRemainingAmount - amount).toFixed(2)));
  const newStatus = newRemaining === 0 ? "paid" : "partially_paid";

  let updatedNotes = existingRecord.debtLoanNotes;
  if (notes && typeof notes === "string" && notes.trim().length > 0) {
    const repaymentNote = `[Repayment ${amount}]: ${notes.trim()}`;
    updatedNotes = existingRecord.debtLoanNotes ? `${existingRecord.debtLoanNotes}\n${repaymentNote}` : repaymentNote;
  }

  const updatedRecord = await db.update(schema.debtsLoans)
    .set({
      debtLoanRemainingAmount: newRemaining,
      debtLoanStatus: newStatus,
      debtLoanNotes: updatedNotes,
    })
    .where(and(eq(schema.debtsLoans.debtLoanId, cleanId), eq(schema.debtsLoans.debtLoanUserId, userId)))
    .returning();

  if (shouldAdjustWallet && effectiveWalletId) {
    if (existingRecord.debtLoanType === "debt") {
      await db.update(schema.wallets)
        .set({ walletBalance: sql`wallet_balance - ${amount}` })
        .where(and(eq(schema.wallets.walletId, effectiveWalletId), eq(schema.wallets.walletUserId, userId)));
    } else if (existingRecord.debtLoanType === "loan") {
      await db.update(schema.wallets)
        .set({ walletBalance: sql`wallet_balance + ${amount}` })
        .where(and(eq(schema.wallets.walletId, effectiveWalletId), eq(schema.wallets.walletUserId, userId)));
    }
  }

  return updatedRecord[0];
}

export async function updateDebtLoan(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  input: UpdateDebtLoanInput
) {
  const { debtLoanId, personName, dueDate, notes, status } = input;

  if (!debtLoanId || typeof debtLoanId !== "string" || debtLoanId.trim().length === 0) {
    throw new Error("Validation Error: Valid string 'debtLoanId' (UUID) is required for update");
  }

  const cleanId = debtLoanId.trim();
  const existingRecord = await getDebtLoanById(db, userId, cleanId);
  if (!existingRecord) {
    throw new Error(`Debt/Loan ID ${cleanId} not found or unauthorized`);
  }

  const updates: Partial<typeof schema.debtsLoans.$inferInsert> = {};
  if (personName && typeof personName === "string" && personName.trim().length > 0 && personName.trim().length <= 100) {
    updates.debtLoanPersonName = personName.trim();
  }
  if (dueDate !== undefined) {
    if (dueDate && !isValidIsoDateOrTimestamp(dueDate)) {
      throw new Error("Validation Error: 'dueDate' must be in valid ISO format (e.g. YYYY-MM-DD)");
    }
    updates.debtLoanDueDate = dueDate ? dueDate.trim() : null;
  }
  if (notes !== undefined) {
    updates.debtLoanNotes = notes && typeof notes === "string" ? notes.trim() : null;
  }
  if (status && ["unpaid", "partially_paid", "paid"].includes(status)) {
    updates.debtLoanStatus = status;
    if (status === "paid") {
      updates.debtLoanRemainingAmount = 0;
    }
  }

  const updated = await db.update(schema.debtsLoans)
    .set(updates)
    .where(and(eq(schema.debtsLoans.debtLoanId, cleanId), eq(schema.debtsLoans.debtLoanUserId, userId)))
    .returning();

  return updated[0];
}

export async function getActiveDebtsLoansSummary(
  db: DrizzleD1Database<typeof schema>,
  userId: string
) {
  const activeDebtsLoans = await db.select().from(schema.debtsLoans)
    .where(
      and(
        eq(schema.debtsLoans.debtLoanUserId, userId),
        sql`debt_loan_status != 'paid'`
      )
    );

  let totalDebt = 0;
  let totalReceivable = 0;
  for (const dl of activeDebtsLoans) {
    if (dl.debtLoanType === "debt") {
      totalDebt += dl.debtLoanRemainingAmount;
    } else if (dl.debtLoanType === "loan") {
      totalReceivable += dl.debtLoanRemainingAmount;
    }
  }

  return {
    totalDebt: Number(totalDebt.toFixed(2)),
    totalReceivable: Number(totalReceivable.toFixed(2)),
    activeCount: activeDebtsLoans.length,
    activeRecords: activeDebtsLoans,
  };
}
