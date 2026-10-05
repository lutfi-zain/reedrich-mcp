import type { Database } from "../db";
import * as schema from "../db/schema";
import { eq, and, gte, lte, sql, inArray } from "drizzle-orm";
import { isValidIsoDateOrTimestamp } from "../utils/date";
import { validationError } from "./errors";
import { listWallets, WalletLastTransaction } from "./wallet";
import { getExchangeRates, convertCurrency, normalizeCurrencyForFx } from "../utils/fx";
import { calculateGoalPacing } from "../utils/goals";
import { calculateBudgetMetrics, BudgetSpendingStatus } from "../utils/budgets";
export interface AccountDetailParams {
  startDate?: unknown;
  endDate?: unknown;
  baseCurrency?: unknown;
}

export interface WalletSnapshotItem {
  walletId: string;
  walletName: string;
  institution: string;
  type: string;
  currency: string;
  balance: number;
  isLocked: number;
  lastTransaction: WalletLastTransaction | null;
}

export interface AccountDetailResult {
  netWorth: {
    consolidated: {
      total: number;
      currency: string;
      isEstimated: boolean;
      fxSource: string;
    };
    byCurrency: Record<string, number>;
    byInstitution: Record<string, number>;
  };
  wallets: {
    spendable: {
      total: number;
      items: WalletSnapshotItem[];
    };
    locked: {
      total: number;
      items: WalletSnapshotItem[];
    };
  };
  monthlyCashFlow: {
    period: {
      start: string;
      end: string;
    };
    totalIncome: number;
    totalExpense: number;
    netSavings: number;
    categoryBreakdown: Array<{
      categoryName: string;
      amount: number;
      percentage: number;
    }>;
  };
  budgets: Array<{
    budgetId: string;
    budgetName: string;
    categoryId: string | null;
    categoryName: string;
    amount: number;
    periodStart: string;
    periodEnd: string;
    spent: number;
    remaining: number;
    percentUsed: number;
    status: BudgetSpendingStatus;
    daysRemaining: number;
    dailyAllowance: number;
  }>;
  goals: Array<{
    goalId: string;
    goalName: string;
    targetAmount: number;
    currentAmount: number;
    targetDate: string | null;
    currency: string;
    status: string;
    progressPercentage: number;
    isDerived: boolean;
    daysRemaining: number | null;
    requiredMonthlySavings: number | null;
    isReached: boolean;
    linkedWalletsBreakdown?: Array<{
      walletId: string;
      walletName: string;
      balance: number;
      currency: string;
      convertedAmount: number;
      usedPeg: boolean;
    }>;
  }>;
  obligations: {
    totalDebt: number;
    totalReceivable: number;
    activeDebts: Array<{
      debtLoanId: string;
      personName: string;
      amount: number;
      remainingAmount: number;
      dueDate: string | null;
      status: string;
      type: string;
      walletId: string | null;
      notes: string | null;
    }>;
    activeLoans: Array<{
      debtLoanId: string;
      personName: string;
      amount: number;
      remainingAmount: number;
      dueDate: string | null;
      status: string;
      type: string;
      walletId: string | null;
      notes: string | null;
    }>;
  };
}

export async function getAccountDetail(
  db: Database,
  userId: string,
  params: AccountDetailParams = {},
  fetchFn?: typeof fetch
): Promise<AccountDetailResult> {
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

  const now = new Date();
  const defaultStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01T00:00:00.000Z`;
  const lastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999)).toISOString();

  const periodStart = typeof startDate === "string" ? startDate : defaultStart;
  const periodEnd = typeof endDate === "string" ? endDate : lastDay;

  let resolvedBaseCurrency = "IDR";
  if (typeof baseCurrency === "string" && baseCurrency.trim().length > 0) {
    resolvedBaseCurrency = baseCurrency.trim().toUpperCase();
  }

  // Execute parallel queries for all domain entities
  const [
    walletsWithTx,
    categoriesData,
    budgetsData,
    goalsData,
    debtsLoansData,
    fxRates,
  ] = await Promise.all([
    listWallets(db, userId, undefined, true),
    db.select().from(schema.categories).where(eq(schema.categories.categoryUserId, userId)),
    db
      .select()
      .from(schema.budgets)
      .where(
        and(
          eq(schema.budgets.budgetUserId, userId),
          lte(schema.budgets.budgetPeriodStart, periodEnd),
          gte(schema.budgets.budgetPeriodEnd, periodStart)
        )
      ),
    db
      .select()
      .from(schema.goals)
      .where(
        and(
          eq(schema.goals.goalUserId, userId),
          eq(schema.goals.goalStatus, "in_progress")
        )
      ),
    db.select().from(schema.debtsLoans).where(and(eq(schema.debtsLoans.debtLoanUserId, userId), sql`debt_loan_status != 'paid'`)),
    getExchangeRates(fetchFn),
  ]);

  const categoryMap = new Map<string, string>();
  for (const c of categoriesData) {
    categoryMap.set(c.categoryId, c.categoryName);
  }

  // 1. Wallets Partitioning & Net Worth
  const netWorthByCurrency: Record<string, number> = {};
  const netWorthByInstitution: Record<string, number> = {};
  const spendableEntries: Array<{ item: WalletSnapshotItem; converted: number }> = [];
  const lockedEntries: Array<{ item: WalletSnapshotItem; converted: number }> = [];
  let spendableTotalConverted = 0;
  let lockedTotalConverted = 0;

  for (const w of walletsWithTx) {
    const curr = (w.walletCurrency || "IDR").toUpperCase();
    const inst = w.walletInstitution || "Other";
    const bal = w.walletBalance;

    netWorthByCurrency[curr] = Number(((netWorthByCurrency[curr] || 0) + bal).toFixed(2));
    netWorthByInstitution[inst] = Number(((netWorthByInstitution[inst] || 0) + bal).toFixed(2));

    const converted = convertCurrency(bal, curr, resolvedBaseCurrency, fxRates.rates);

    const item: WalletSnapshotItem = {
      walletId: w.walletId,
      walletName: w.walletName,
      institution: inst,
      type: w.walletType,
      currency: curr,
      balance: bal,
      isLocked: w.walletIsLocked,
      lastTransaction: w.lastTransaction ?? null,
    };

    if (w.walletIsLocked === 1) {
      lockedEntries.push({ item, converted });
      lockedTotalConverted += converted;
    } else {
      spendableEntries.push({ item, converted });
      spendableTotalConverted += converted;
    }
  }

  const compareWalletEntries = (
    a: { item: WalletSnapshotItem; converted: number },
    b: { item: WalletSnapshotItem; converted: number }
  ) => {
    const diffConverted = b.converted - a.converted;
    if (Math.abs(diffConverted) > 1e-6) {
      return diffConverted;
    }
    const diffBalance = b.item.balance - a.item.balance;
    if (Math.abs(diffBalance) > 1e-6) {
      return diffBalance;
    }
    return a.item.walletId.localeCompare(b.item.walletId);
  };

  spendableEntries.sort(compareWalletEntries);
  lockedEntries.sort(compareWalletEntries);

  const spendableItems = spendableEntries.map((e) => e.item);
  const lockedItems = lockedEntries.map((e) => e.item);

  let consolidatedTotal = 0;
  const isEstimated = Object.keys(netWorthByCurrency).some(
    (c) => c.toUpperCase() !== resolvedBaseCurrency
  );
  for (const [curr, bal] of Object.entries(netWorthByCurrency)) {
    consolidatedTotal += convertCurrency(bal, curr, resolvedBaseCurrency, fxRates.rates);
  }

  // 2. Monthly Cashflow & Category Breakdown
  const txConditions = [
    eq(schema.transactions.transactionUserId, userId),
    eq(schema.transactions.transactionIsPlanned, 0),
    gte(schema.transactions.transactionDate, periodStart),
    lte(schema.transactions.transactionDate, periodEnd),
  ];
  const txs = await db.select().from(schema.transactions).where(and(...txConditions));

  let totalIncome = 0;
  let totalExpense = 0;
  const expenseByCategory: Record<string, number> = {};

  for (const t of txs) {
    const fee = t.transactionAdminFee || 0;
    if (t.transactionType === "income") {
      if (t.transactionDescription && t.transactionDescription.startsWith("Initial balance:")) {
        continue;
      }
      totalIncome += t.transactionAmount - fee;
    } else if (t.transactionType === "expense") {
      const totalCost = t.transactionAmount + fee;
      totalExpense += totalCost;
      const catName = t.transactionCategoryId
        ? categoryMap.get(t.transactionCategoryId) || "Uncategorized"
        : "Uncategorized";
      expenseByCategory[catName] = (expenseByCategory[catName] || 0) + totalCost;
    } else if (t.transactionType === "transfer") {
      if (fee > 0) {
        totalExpense += fee;
        const catName = t.transactionCategoryId
          ? categoryMap.get(t.transactionCategoryId) || "Transfer Fees"
          : "Transfer Fees";
        expenseByCategory[catName] = (expenseByCategory[catName] || 0) + fee;
      }
    }
  }
  const categoryBreakdown = Object.entries(expenseByCategory).map(([categoryName, amount]) => {
    const percentage = totalExpense > 0 ? Number(((amount / totalExpense) * 100).toFixed(2)) : 0;
    return {
      categoryName,
      amount: Number(amount.toFixed(2)),
      percentage,
    };
  });
  categoryBreakdown.sort((a, b) => b.amount - a.amount);

  // 3. Budgets Aggregation
  let allBudgetTxs: typeof txs = [];
  if (budgetsData.length > 0) {
    const minStart = budgetsData.reduce(
      (min, b) => (b.budgetPeriodStart < min ? b.budgetPeriodStart : min),
      budgetsData[0].budgetPeriodStart
    );
    const maxEnd = budgetsData.reduce(
      (max, b) => (b.budgetPeriodEnd > max ? b.budgetPeriodEnd : max),
      budgetsData[0].budgetPeriodEnd
    );

    allBudgetTxs = await db
      .select()
      .from(schema.transactions)
      .where(
        and(
          eq(schema.transactions.transactionUserId, userId),
          eq(schema.transactions.transactionIsPlanned, 0),
          eq(schema.transactions.transactionType, "expense"),
          gte(schema.transactions.transactionDate, minStart),
          lte(schema.transactions.transactionDate, maxEnd)
        )
      );
  }

  const budgets: AccountDetailResult["budgets"] = [];
  for (const b of budgetsData) {
    const catName = b.budgetCategoryId
      ? categoryMap.get(b.budgetCategoryId) || "General"
      : "General";

    const bTxs = allBudgetTxs.filter((t) => {
      if (t.transactionDate < b.budgetPeriodStart || t.transactionDate > b.budgetPeriodEnd) return false;
      if (b.budgetCategoryId && t.transactionCategoryId === b.budgetCategoryId) return true;
      if (t.transactionBudgetId && t.transactionBudgetId === b.budgetId) return true;
      return false;
    });

    const spent = bTxs.reduce((sum, t) => sum + t.transactionAmount + (t.transactionAdminFee || 0), 0);
    const metrics = calculateBudgetMetrics({
      amount: b.budgetAmount,
      periodStart: b.budgetPeriodStart,
      periodEnd: b.budgetPeriodEnd,
      spent,
    });

    budgets.push({
      budgetId: b.budgetId,
      budgetName: b.budgetName,
      categoryId: b.budgetCategoryId ?? null,
      categoryName: catName,
      amount: b.budgetAmount,
      periodStart: b.budgetPeriodStart,
      periodEnd: b.budgetPeriodEnd,
      spent: metrics.spent,
      remaining: metrics.remaining,
      percentUsed: metrics.percentUsed,
      status: metrics.status,
      daysRemaining: metrics.daysRemaining,
      dailyAllowance: metrics.dailyAllowance,
    });
  }

  // 4. Goals Aggregation with Linked Wallets Breakdown
  const goalIds = goalsData.map((g) => g.goalId);
  const goalLinksByGoalId = new Map<string, string[]>();
  if (goalIds.length > 0) {
    const allLinks = await db
      .select()
      .from(schema.goalWallets)
      .where(inArray(schema.goalWallets.goalId, goalIds));
    for (const link of allLinks) {
      const bucket = goalLinksByGoalId.get(link.goalId) || [];
      bucket.push(link.walletId);
      goalLinksByGoalId.set(link.goalId, bucket);
    }
  }

  const walletsById = new Map<string, (typeof walletsWithTx)[number]>();
  for (const w of walletsWithTx) walletsById.set(w.walletId, w);

  const goals: AccountDetailResult["goals"] = goalsData.map((g) => {
    const linkedIds = goalLinksByGoalId.get(g.goalId) || [];
    if (linkedIds.length === 0) {
      const pacing = calculateGoalPacing(
        g.goalTargetAmount,
        g.goalCurrentAmount,
        g.goalTargetDate,
        g.goalStatus
      );
      const isReached = g.goalCurrentAmount >= g.goalTargetAmount;
      return {
        goalId: g.goalId,
        goalName: g.goalName,
        targetAmount: g.goalTargetAmount,
        currentAmount: g.goalCurrentAmount,
        targetDate: g.goalTargetDate ?? null,
        currency: (g.goalCurrency || "IDR").toUpperCase(),
        status: g.goalStatus,
        progressPercentage: pacing.progressPercentage,
        isDerived: false,
        daysRemaining: pacing.daysRemaining,
        requiredMonthlySavings: pacing.requiredMonthlySavings,
        isReached,
      };
    }

    const goalCurrency = (g.goalCurrency || "IDR").toUpperCase();
    const linkedBreakdown: NonNullable<AccountDetailResult["goals"][number]["linkedWalletsBreakdown"]> = [];
    let derivedTotal = 0;

    for (const wid of linkedIds) {
      const w = walletsById.get(wid);
      if (!w) continue;
      const walletCurrency = (w.walletCurrency || "IDR").toUpperCase();
      const converted = convertCurrency(
        w.walletBalance,
        walletCurrency,
        goalCurrency,
        fxRates.rates
      );
      const usedPeg =
        normalizeCurrencyForFx(walletCurrency).usedPeg ||
        normalizeCurrencyForFx(goalCurrency).usedPeg;

      linkedBreakdown.push({
        walletId: w.walletId,
        walletName: w.walletName,
        balance: w.walletBalance,
        currency: walletCurrency,
        convertedAmount: converted,
        usedPeg,
      });
      derivedTotal = Number((derivedTotal + converted).toFixed(2));
    }

    linkedBreakdown.sort((a, b) => {
      const diffConverted = b.convertedAmount - a.convertedAmount;
      if (Math.abs(diffConverted) > 1e-6) return diffConverted;
      const diffBal = b.balance - a.balance;
      if (Math.abs(diffBal) > 1e-6) return diffBal;
      return a.walletId.localeCompare(b.walletId);
    });

    const pacing = calculateGoalPacing(
      g.goalTargetAmount,
      derivedTotal,
      g.goalTargetDate,
      g.goalStatus
    );

    const isReached = derivedTotal >= g.goalTargetAmount;
    return {
      goalId: g.goalId,
      goalName: g.goalName,
      targetAmount: g.goalTargetAmount,
      currentAmount: derivedTotal,
      targetDate: g.goalTargetDate ?? null,
      currency: goalCurrency,
      status: g.goalStatus,
      progressPercentage: pacing.progressPercentage,
      isDerived: true,
      daysRemaining: pacing.daysRemaining,
      requiredMonthlySavings: pacing.requiredMonthlySavings,
      isReached,
      linkedWalletsBreakdown: linkedBreakdown,
    };
  });

  goals.sort((a, b) => {
    const aConverted = convertCurrency(a.currentAmount, a.currency, resolvedBaseCurrency, fxRates.rates);
    const bConverted = convertCurrency(b.currentAmount, b.currency, resolvedBaseCurrency, fxRates.rates);
    const diffConverted = bConverted - aConverted;
    if (Math.abs(diffConverted) > 1e-6) return diffConverted;
    const diffCurrent = b.currentAmount - a.currentAmount;
    if (Math.abs(diffCurrent) > 1e-6) return diffCurrent;
    return a.goalId.localeCompare(b.goalId);
  });
  // 5. Obligations Aggregation
  let totalDebt = 0;
  let totalReceivable = 0;
  const activeDebts: AccountDetailResult["obligations"]["activeDebts"] = [];
  const activeLoans: AccountDetailResult["obligations"]["activeLoans"] = [];

  for (const dl of debtsLoansData) {
    if (dl.debtLoanType === "debt") {
      totalDebt += dl.debtLoanRemainingAmount;
      activeDebts.push({
        debtLoanId: dl.debtLoanId,
        personName: dl.debtLoanPersonName,
        amount: dl.debtLoanAmount,
        remainingAmount: dl.debtLoanRemainingAmount,
        dueDate: dl.debtLoanDueDate,
        status: dl.debtLoanStatus,
        type: dl.debtLoanType,
        walletId: dl.debtLoanWalletId ?? null,
        notes: dl.debtLoanNotes ?? null,
      });
    } else if (dl.debtLoanType === "loan") {
      totalReceivable += dl.debtLoanRemainingAmount;
      activeLoans.push({
        debtLoanId: dl.debtLoanId,
        personName: dl.debtLoanPersonName,
        amount: dl.debtLoanAmount,
        remainingAmount: dl.debtLoanRemainingAmount,
        dueDate: dl.debtLoanDueDate,
        status: dl.debtLoanStatus,
        type: dl.debtLoanType,
        walletId: dl.debtLoanWalletId ?? null,
        notes: dl.debtLoanNotes ?? null,
      });
    }
  }

  return {
    netWorth: {
      consolidated: {
        total: Number(consolidatedTotal.toFixed(2)),
        currency: resolvedBaseCurrency,
        isEstimated,
        fxSource: fxRates.source,
      },
      byCurrency: netWorthByCurrency,
      byInstitution: netWorthByInstitution,
    },
    wallets: {
      spendable: {
        total: Number(spendableTotalConverted.toFixed(2)),
        items: spendableItems,
      },
      locked: {
        total: Number(lockedTotalConverted.toFixed(2)),
        items: lockedItems,
      },
    },
    monthlyCashFlow: {
      period: {
        start: periodStart,
        end: periodEnd,
      },
      totalIncome: Number(totalIncome.toFixed(2)),
      totalExpense: Number(totalExpense.toFixed(2)),
      netSavings: Number((totalIncome - totalExpense).toFixed(2)),
      categoryBreakdown,
    },
    budgets,
    goals,
    obligations: {
      totalDebt: Number(totalDebt.toFixed(2)),
      totalReceivable: Number(totalReceivable.toFixed(2)),
      activeDebts,
      activeLoans,
    },
  };
}
