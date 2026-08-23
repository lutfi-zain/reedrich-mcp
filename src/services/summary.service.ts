import { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import {
  isValidIsoDateOrTimestamp,
  normalizeToIsoTimestamp,
} from "../utils/date";

export type FinancialSummaryOptions = {
  startDate?: string;
  endDate?: string;
};

export type FinancialSummaryResult = {
  netWorthByCurrency: Record<string, number>;
  netWorthByInstitution: Record<string, number>;
  totalIncome: number;
  totalExpense: number;
  totalAdminFees: number;
  netSavings: number;
  totalDebt: number;
  totalReceivable: number;
  walletsCount: number;
  transactionsCount: number;
  transfersCount: number;
  categoryBreakdown: Record<string, number>;
};

export async function getFinancialSummary(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  options: FinancialSummaryOptions = {}
): Promise<FinancialSummaryResult> {
  const { startDate, endDate } = options;

  if (startDate !== undefined && !isValidIsoDateOrTimestamp(startDate)) {
    throw new Error("Validation Error: 'startDate' must be a valid ISO date or timestamp");
  }
  if (endDate !== undefined && !isValidIsoDateOrTimestamp(endDate)) {
    throw new Error("Validation Error: 'endDate' must be a valid ISO date or timestamp");
  }

  // 1. Group net worth by currency and institution across all user wallets
  const walletsData = await db.select().from(schema.wallets).where(eq(schema.wallets.walletUserId, userId));
  const netWorthByCurrency: Record<string, number> = {};
  const netWorthByInstitution: Record<string, number> = {};
  for (const w of walletsData) {
    netWorthByCurrency[w.walletCurrency] = Number(((netWorthByCurrency[w.walletCurrency] || 0) + w.walletBalance).toFixed(2));
    netWorthByInstitution[w.walletInstitution] = Number(((netWorthByInstitution[w.walletInstitution] || 0) + w.walletBalance).toFixed(2));
  }

  // 2. Query non-planned transactions
  const conditions = [
    eq(schema.transactions.transactionUserId, userId),
    eq(schema.transactions.transactionIsPlanned, 0)
  ];
  if (startDate !== undefined) conditions.push(gte(schema.transactions.transactionDate, normalizeToIsoTimestamp(startDate)));
  if (endDate !== undefined) {
    const cleanEndDate = /^\d{4}-\d{2}-\d{2}$/.test(endDate.trim())
      ? `${endDate.trim()}T23:59:59.999Z`
      : normalizeToIsoTimestamp(endDate);
    conditions.push(lte(schema.transactions.transactionDate, cleanEndDate));
  }

  const txs = await db.select().from(schema.transactions).where(and(...conditions));

  // 3. Map categories for human-readable breakdown
  const categoriesData = await db.select().from(schema.categories).where(eq(schema.categories.categoryUserId, userId));
  const categoryMap = new Map(categoriesData.map(c => [c.categoryId, c.categoryName]));

  let totalIncome = 0;
  let totalExpense = 0;
  let totalAdminFees = 0;
  let transfersCount = 0;
  const categoryBreakdown: Record<string, number> = {};

  for (const tx of txs) {
    const fee = tx.transactionAdminFee || 0;
    totalAdminFees += fee;

    if (tx.transactionType === "income") {
      totalIncome += (tx.transactionAmount - fee);
    } else if (tx.transactionType === "expense") {
      const totalCost = tx.transactionAmount + fee;
      totalExpense += totalCost;
      const catName = tx.transactionCategoryId ? (categoryMap.get(tx.transactionCategoryId) || `Category #${tx.transactionCategoryId}`) : "Uncategorized";
      categoryBreakdown[catName] = Number(((categoryBreakdown[catName] || 0) + totalCost).toFixed(2));
    } else if (tx.transactionType === "transfer") {
      transfersCount += 1;
      if (fee > 0) {
        totalExpense += fee;
        const catName = tx.transactionCategoryId ? (categoryMap.get(tx.transactionCategoryId) || `Category #${tx.transactionCategoryId}`) : "Transfer Fees";
        categoryBreakdown[catName] = Number(((categoryBreakdown[catName] || 0) + fee).toFixed(2));
      }
    }
  }

  // 4. Query active debts & loans for summary totals
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
    netWorthByCurrency,
    netWorthByInstitution,
    totalIncome: Number(totalIncome.toFixed(2)),
    totalExpense: Number(totalExpense.toFixed(2)),
    totalAdminFees: Number(totalAdminFees.toFixed(2)),
    netSavings: Number((totalIncome - totalExpense).toFixed(2)),
    totalDebt: Number(totalDebt.toFixed(2)),
    totalReceivable: Number(totalReceivable.toFixed(2)),
    walletsCount: walletsData.length,
    transactionsCount: txs.length,
    transfersCount,
    categoryBreakdown,
  };
}
