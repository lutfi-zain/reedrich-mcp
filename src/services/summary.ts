import { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import {
  normalizeToIsoTimestamp,
  isValidIsoDateOrTimestamp,
} from "../utils/date";
import { getExchangeRates, convertCurrency } from "../utils/fx";
import { calculateGoalPacing } from "../utils/goals";
import { projectRecurringCashflow } from "../utils/recurring";
import { validationError } from "./errors";

export interface FinancialSummaryParams {
  startDate?: unknown;
  endDate?: unknown;
  baseCurrency?: unknown;
}

export async function financialSummary(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  params: FinancialSummaryParams = {},
  fetchFn?: typeof fetch
) {
  const { startDate, endDate, baseCurrency } = params;

  if (
    startDate !== undefined &&
    (typeof startDate !== "string" || !isValidIsoDateOrTimestamp(startDate))
  ) {
    validationError(
      "Validation Error: 'startDate' must be a valid ISO date or timestamp",
      "startDate"
    );
  }
  if (
    endDate !== undefined &&
    (typeof endDate !== "string" || !isValidIsoDateOrTimestamp(endDate))
  ) {
    validationError(
      "Validation Error: 'endDate' must be a valid ISO date or timestamp",
      "endDate"
    );
  }

  // 1. Group net worth by currency and institution across all user wallets
  const walletsData = await db
    .select()
    .from(schema.wallets)
    .where(eq(schema.wallets.walletUserId, userId));

  const netWorthByCurrency: Record<string, number> = {};
  const netWorthByInstitution: Record<string, number> = {};
  const currencyCounts: Record<string, number> = {};

  for (const w of walletsData) {
    const curr = (w.walletCurrency || "IDR").toUpperCase();
    netWorthByCurrency[w.walletCurrency] = Number(
      ((netWorthByCurrency[w.walletCurrency] || 0) + w.walletBalance).toFixed(2)
    );
    netWorthByInstitution[w.walletInstitution] = Number(
      (
        (netWorthByInstitution[w.walletInstitution] || 0) + w.walletBalance
      ).toFixed(2)
    );
    currencyCounts[curr] = (currencyCounts[curr] || 0) + 1;
  }

  // Base currency resolution: explicit override or auto-detection from wallet frequency / default IDR
  let resolvedBaseCurrency = "IDR";
  if (
    baseCurrency &&
    typeof baseCurrency === "string" &&
    baseCurrency.trim().length > 0
  ) {
    resolvedBaseCurrency = baseCurrency.trim().toUpperCase();
  } else {
    let maxCount = 0;
    for (const [curr, count] of Object.entries(currencyCounts)) {
      if (count > maxCount) {
        maxCount = count;
        resolvedBaseCurrency = curr;
      }
    }
  }

  // Fetch exchange rates (with 3s timeout & fallback)
  const fxRates = await getExchangeRates(fetchFn);
  let consolidatedEstimatedTotal = 0;
  const isEstimated = Object.keys(netWorthByCurrency).some(
    (curr) => curr.toUpperCase() !== resolvedBaseCurrency
  );

  for (const [curr, balance] of Object.entries(netWorthByCurrency)) {
    const converted = convertCurrency(
      balance,
      curr,
      resolvedBaseCurrency,
      fxRates.rates
    );
    consolidatedEstimatedTotal += converted;
  }

  const consolidatedNetWorth = {
    baseCurrency: resolvedBaseCurrency,
    estimatedTotal: Number(consolidatedEstimatedTotal.toFixed(2)),
    isEstimated,
    exchangeRatesSource: fxRates.source,
  };

  // 2. Query non-planned transactions
  const conditions = [
    eq(schema.transactions.transactionUserId, userId),
    eq(schema.transactions.transactionIsPlanned, 0),
  ];
  if (typeof startDate === "string") {
    conditions.push(
      gte(
        schema.transactions.transactionDate,
        normalizeToIsoTimestamp(startDate)
      )
    );
  }
  if (typeof endDate === "string") {
    const cleanEndDate = /^\d{4}-\d{2}-\d{2}$/.test(endDate.trim())
      ? `${endDate.trim()}T23:59:59.999Z`
      : normalizeToIsoTimestamp(endDate);
    conditions.push(lte(schema.transactions.transactionDate, cleanEndDate));
  }

  const txs = await db
    .select()
    .from(schema.transactions)
    .where(and(...conditions));

  // 3. Map categories for human-readable breakdown
  const categoriesData = await db
    .select()
    .from(schema.categories)
    .where(eq(schema.categories.categoryUserId, userId));
  const categoryMap = new Map(
    categoriesData.map((c) => [c.categoryId, c.categoryName])
  );

  let totalIncome = 0;
  let totalExpense = 0;
  let totalAdminFees = 0;
  let transfersCount = 0;
  const categoryBreakdown: Record<string, number> = {};

  for (const tx of txs) {
    const fee = tx.transactionAdminFee || 0;
    totalAdminFees += fee;

    if (tx.transactionType === "income") {
      totalIncome += tx.transactionAmount - fee;
    } else if (tx.transactionType === "expense") {
      const totalCost = tx.transactionAmount + fee;
      totalExpense += totalCost;
      const catName = tx.transactionCategoryId
        ? categoryMap.get(tx.transactionCategoryId) ||
          `Category #${tx.transactionCategoryId}`
        : "Uncategorized";
      categoryBreakdown[catName] = Number(
        ((categoryBreakdown[catName] || 0) + totalCost).toFixed(2)
      );
    } else if (tx.transactionType === "transfer") {
      transfersCount += 1;
      if (fee > 0) {
        totalExpense += fee;
        const catName = tx.transactionCategoryId
          ? categoryMap.get(tx.transactionCategoryId) ||
            `Category #${tx.transactionCategoryId}`
          : "Transfer Fees";
        categoryBreakdown[catName] = Number(
          ((categoryBreakdown[catName] || 0) + fee).toFixed(2)
        );
      }
    }
  }

  // 4. Query active debts & loans for summary totals
  const activeDebtsLoans = await db
    .select()
    .from(schema.debtsLoans)
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

  // 5. Query active goals and compute pacing
  const goalsData = await db
    .select()
    .from(schema.goals)
    .where(
      and(
        eq(schema.goals.goalUserId, userId),
        sql`goal_status != 'cancelled'`
      )
    );

  const activeGoals = goalsData.map((g) => {
    const pacing = calculateGoalPacing(
      g.goalTargetAmount,
      g.goalCurrentAmount,
      g.goalTargetDate,
      g.goalStatus
    );
    return {
      goalId: g.goalId,
      name: g.goalName,
      currency: g.goalCurrency,
      walletId: g.goalWalletId,
      categoryId: g.goalCategoryId,
      ...pacing,
    };
  });

  // 6. Query recurring templates & forward 30-day cashflow projection
  const templatesData = await db
    .select()
    .from(schema.recurringTemplates)
    .where(
      and(
        eq(schema.recurringTemplates.templateUserId, userId),
        eq(schema.recurringTemplates.templateIsActive, 1)
      )
    );

  const cashflowProjections = projectRecurringCashflow(
    templatesData.map((t) => ({
      templateId: t.templateId,
      templateName: t.templateName,
      templateWalletId: t.templateWalletId,
      templateTargetWalletId: t.templateTargetWalletId,
      templateCategoryId: t.templateCategoryId,
      templateAmount: t.templateAmount,
      templateAdminFee: t.templateAdminFee,
      templateType: t.templateType as "expense" | "income" | "transfer",
      templateFrequency: t.templateFrequency as
        | "daily"
        | "weekly"
        | "monthly"
        | "yearly",
      templateInterval: t.templateInterval,
      templateStartDate: t.templateStartDate,
      templateNextRunDate: t.templateNextRunDate,
      templateEndDate: t.templateEndDate,
      templateIsActive: t.templateIsActive,
      templateNotes: t.templateNotes,
    })),
    30
  );

  const summary: Record<string, unknown> = {
    netWorthByCurrency,
    netWorthByInstitution,
    consolidatedNetWorth,
    totalIncome: Number(totalIncome.toFixed(2)),
    totalExpense: Number(totalExpense.toFixed(2)),
    totalAdminFees: Number(totalAdminFees.toFixed(2)),
    netSavings: Number((totalIncome - totalExpense).toFixed(2)),
    totalDebt: Number(totalDebt.toFixed(2)),
    totalReceivable: Number(totalReceivable.toFixed(2)),
    activeGoals,
    cashflowProjections,
    walletsCount: walletsData.length,
    transactionsCount: txs.length,
    transfersCount,
    categoryBreakdown,
  };

  if (walletsData.length === 0) {
    summary.accountStatus = "new_account_needs_onboarding";
    summary.isNewUser = true;
    summary.guidance =
      "Akun Reedrich ini baru terhubung dan belum memiliki dompet. Tawarkan untuk membuat dompet pertama (misal: Bank BCA, Cash, GoPay) via manage_wallet(action: 'create') dan pasang kategori via manage_category(action: 'seed_defaults').";
  }

  return summary;
}
