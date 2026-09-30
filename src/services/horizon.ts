import { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { eq, and, gte, lte, ne } from "drizzle-orm";
import { currentIsoTimestamp } from "../utils/date";
import { getExchangeRates, convertCurrency } from "../utils/fx";
import { validationError, isValidFiniteNumber } from "./errors";

export interface HorizonProjectionsParams {
  months?: unknown;
  periods?: unknown;
  baseCurrency?: unknown;
}

export interface PeriodProjection {
  periodKey: string;
  startDate: string;
  endDate: string;
  cashflow: {
    income: number;
    expense: number;
    net: number;
  };
  netWorth: {
    total: number;
    spendable: number;
    locked: number;
  };
  walletBalances: Array<{
    walletId: string;
    walletName: string;
    balance: number;
    currency: string;
    isLocked: number;
  }>;
  goals: Array<{
    goalId: string;
    name: string;
    currentAmount: number;
    targetAmount: number;
    progressPercentage: number;
    isReached: boolean;
  }>;
}

export interface HorizonProjectionsResult {
  baseCurrency: string;
  generatedAt: string;
  startingNetWorth: {
    total: number;
    spendable: number;
    locked: number;
  };
  periods: PeriodProjection[];
}

export async function getHorizonProjections(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
  params: HorizonProjectionsParams = {},
  fetchFn?: typeof fetch
): Promise<HorizonProjectionsResult> {
  const { months, periods, baseCurrency } = params;

  let numMonths = 6;
  if (months !== undefined) {
    const parsed = Number(months);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1 || parsed > 24) {
      validationError("Validation Error: 'months' must be an integer between 1 and 24", "months");
    }
    numMonths = parsed;
  }

  const cleanBaseCurrency =
    typeof baseCurrency === "string" && baseCurrency.trim() !== ""
      ? baseCurrency.trim().toUpperCase()
      : "IDR";

  const periodKeys: string[] = [];
  if (typeof periods === "string" && periods.trim() !== "") {
    const rawKeys = periods.split(",").map((k) => k.trim()).filter((k) => k.length > 0);
    for (const k of rawKeys) {
      if (!/^\d{4}-\d{2}$/.test(k)) {
        validationError(`Validation Error: Invalid period format '${k}'. Expected YYYY-MM`, "periods");
      }
      if (!periodKeys.includes(k)) {
        periodKeys.push(k);
      }
    }
    periodKeys.sort();
  } else {
    const now = new Date();
    const currentYear = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth(); // 0-indexed
    for (let i = 0; i < numMonths; i++) {
      const d = new Date(Date.UTC(currentYear, currentMonth + i, 1));
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
      periodKeys.push(`${yyyy}-${mm}`);
    }
  }

  if (periodKeys.length === 0) {
    validationError("Validation Error: At least one period is required for horizon projection", "periods");
  }

  const overallStartMonth = periodKeys[0];
  const overallEndMonth = periodKeys[periodKeys.length - 1];
  const overallStartDate = `${overallStartMonth}-01T00:00:00.000Z`;

  const [endY, endM] = overallEndMonth.split("-").map(Number);
  const endLastDay = new Date(Date.UTC(endY, endM, 0)).getUTCDate();
  const overallEndDate = `${overallEndMonth}-${String(endLastDay).padStart(2, "0")}T23:59:59.999Z`;

  // 1. Single-pass concurrent fetch of all required domain entities
  const [wallets, goals, goalWallets, plannedTransactions, fxRates] = await Promise.all([
    db.select().from(schema.wallets).where(eq(schema.wallets.walletUserId, userId)),
    db.select().from(schema.goals).where(and(eq(schema.goals.goalUserId, userId), ne(schema.goals.goalStatus, "cancelled"))),
    db.select().from(schema.goalWallets),
    db.select().from(schema.transactions).where(
      and(
        eq(schema.transactions.transactionUserId, userId),
        eq(schema.transactions.transactionIsPlanned, 1),
        gte(schema.transactions.transactionDate, overallStartDate),
        lte(schema.transactions.transactionDate, overallEndDate)
      )
    ),
    getExchangeRates(fetchFn),
  ]);

  const walletsById = new Map<string, typeof schema.wallets.$inferSelect>();
  for (const w of wallets) {
    walletsById.set(w.walletId, w);
  }

  // Map goal-wallet links
  const goalLinksByGoalId = new Map<string, string[]>();
  for (const link of goalWallets) {
    const list = goalLinksByGoalId.get(link.goalId) || [];
    list.push(link.walletId);
    goalLinksByGoalId.set(link.goalId, list);
  }

  // 2. Compute starting snapshot net worth
  let startingSpendable = 0;
  let startingLocked = 0;
  const simulatedBalances = new Map<string, number>();

  for (const w of wallets) {
    simulatedBalances.set(w.walletId, w.walletBalance);
    const converted = convertCurrency(w.walletBalance, w.walletCurrency, cleanBaseCurrency, fxRates.rates);
    if (Number(w.walletIsLocked) === 1) {
      startingLocked += converted;
    } else {
      startingSpendable += converted;
    }
  }

  const startingNetWorth = {
    total: Number((startingSpendable + startingLocked).toFixed(2)),
    spendable: Number(startingSpendable.toFixed(2)),
    locked: Number(startingLocked.toFixed(2)),
  };

  // Group planned transactions by period
  const periodsData: PeriodProjection[] = [];

  for (const periodKey of periodKeys) {
    const [y, m] = periodKey.split("-").map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const periodStart = `${periodKey}-01T00:00:00.000Z`;
    const periodEnd = `${periodKey}-${String(lastDay).padStart(2, "0")}T23:59:59.999Z`;

    // Filter transactions occurring in this month window
    const monthlyTxs = plannedTransactions.filter(
      (tx) => tx.transactionDate >= periodStart && tx.transactionDate <= periodEnd
    );

    let periodIncome = 0;
    let periodExpense = 0;

    for (const tx of monthlyTxs) {
      const srcWallet = walletsById.get(tx.transactionWalletId);
      const srcCurrency = srcWallet ? srcWallet.walletCurrency : cleanBaseCurrency;

      if (tx.transactionType === "income") {
        const netAmt = tx.transactionAmount - (tx.transactionAdminFee || 0);
        const currBal = simulatedBalances.get(tx.transactionWalletId) ?? 0;
        simulatedBalances.set(tx.transactionWalletId, currBal + netAmt);

        const convertedIncome = convertCurrency(netAmt, srcCurrency, cleanBaseCurrency, fxRates.rates);
        periodIncome += convertedIncome;
      } else if (tx.transactionType === "expense") {
        const totalDebit = tx.transactionAmount + (tx.transactionAdminFee || 0);
        const currBal = simulatedBalances.get(tx.transactionWalletId) ?? 0;
        simulatedBalances.set(tx.transactionWalletId, currBal - totalDebit);

        const convertedExpense = convertCurrency(totalDebit, srcCurrency, cleanBaseCurrency, fxRates.rates);
        periodExpense += convertedExpense;
      } else if (tx.transactionType === "transfer" && tx.transactionTargetWalletId) {
        const totalDebit = tx.transactionAmount + (tx.transactionAdminFee || 0);
        const srcBal = simulatedBalances.get(tx.transactionWalletId) ?? 0;
        simulatedBalances.set(tx.transactionWalletId, srcBal - totalDebit);

        const tgtBal = simulatedBalances.get(tx.transactionTargetWalletId) ?? 0;
        simulatedBalances.set(tx.transactionTargetWalletId, tgtBal + tx.transactionAmount);

        // Admin fee on transfer counts towards monthly expense
        if ((tx.transactionAdminFee || 0) > 0) {
          const convertedFee = convertCurrency(tx.transactionAdminFee, srcCurrency, cleanBaseCurrency, fxRates.rates);
          periodExpense += convertedFee;
        }
      }
    }

    // Compute end-of-period net worth
    let periodSpendable = 0;
    let periodLocked = 0;
    const periodWalletBalances: PeriodProjection["walletBalances"] = [];

    for (const w of wallets) {
      const bal = Number((simulatedBalances.get(w.walletId) ?? 0).toFixed(2));
      periodWalletBalances.push({
        walletId: w.walletId,
        walletName: w.walletName,
        balance: bal,
        currency: w.walletCurrency,
        isLocked: Number(w.walletIsLocked) || 0,
      });

      const converted = convertCurrency(bal, w.walletCurrency, cleanBaseCurrency, fxRates.rates);
      if (Number(w.walletIsLocked) === 1) {
        periodLocked += converted;
      } else {
        periodSpendable += converted;
      }
    }

    // Evaluate goals at end of period
    const periodGoals: PeriodProjection["goals"] = [];
    for (const g of goals) {
      const linkedIds = goalLinksByGoalId.get(g.goalId) || [];
      let goalCurrent = 0;

      if (linkedIds.length === 0) {
        goalCurrent = g.goalCurrentAmount;
      } else {
        for (const wid of linkedIds) {
          const w = walletsById.get(wid);
          const bal = simulatedBalances.get(wid) ?? 0;
          const wCurr = w ? w.walletCurrency : g.goalCurrency;
          const converted = convertCurrency(bal, wCurr, g.goalCurrency, fxRates.rates);
          goalCurrent += converted;
        }
      }

      goalCurrent = Number(goalCurrent.toFixed(2));
      const target = g.goalTargetAmount;
      const progress = target > 0 ? Number(((goalCurrent / target) * 100).toFixed(2)) : 0;
      const reached = goalCurrent >= target;

      periodGoals.push({
        goalId: g.goalId,
        name: g.goalName,
        currentAmount: goalCurrent,
        targetAmount: target,
        progressPercentage: progress,
        isReached: reached,
      });
    }

    periodsData.push({
      periodKey,
      startDate: periodStart,
      endDate: periodEnd,
      cashflow: {
        income: Number(periodIncome.toFixed(2)),
        expense: Number(periodExpense.toFixed(2)),
        net: Number((periodIncome - periodExpense).toFixed(2)),
      },
      netWorth: {
        total: Number((periodSpendable + periodLocked).toFixed(2)),
        spendable: Number(periodSpendable.toFixed(2)),
        locked: Number(periodLocked.toFixed(2)),
      },
      walletBalances: periodWalletBalances,
      goals: periodGoals,
    });
  }

  return {
    baseCurrency: cleanBaseCurrency,
    generatedAt: currentIsoTimestamp(),
    startingNetWorth,
    periods: periodsData,
  };
}
