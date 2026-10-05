import type { Database } from "../db";
import * as schema from "../db/schema";
import { eq, and, ne } from "drizzle-orm";
import { currentIsoTimestamp } from "../utils/date";
import { getExchangeRates, convertCurrency } from "../utils/fx";
import { validationError } from "./errors";
import {
  calculateWalletPeriodSnapshot,
  normalizeHorizonPeriods,
  LedgerFilterMode,
  TransactionMovement,
  HorizonNormalizedPeriod,
} from "../utils/ledger";

export interface HorizonProjectionsParams {
  months?: unknown;
  periods?: unknown;
  filter?: unknown;
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
    netSpendable: number;
    netLocked: number;
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
  db: Database,
  userId: string,
  params: HorizonProjectionsParams = {},
  fetchFn?: typeof fetch
): Promise<HorizonProjectionsResult> {
  const { months, periods, filter, baseCurrency } = params;

  let numMonths = 6;
  if (months !== undefined && months !== null && String(months).trim() !== "") {
    const parsed = Number(months);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1 || parsed > 24) {
      validationError("Validation Error: 'months' must be an integer between 1 and 24", "months");
    }
    numMonths = parsed;
  }

  let cleanFilter: LedgerFilterMode = "all";
  if (filter !== undefined && filter !== null && String(filter).trim() !== "") {
    if (typeof filter !== "string") {
      validationError("Validation Error: 'filter' must be 'realized', 'planned', or 'all'", "filter");
    }
    const f = (filter as string).trim().toLowerCase();
    if (f !== "realized" && f !== "planned" && f !== "all") {
      validationError("Validation Error: 'filter' must be 'realized', 'planned', or 'all'", "filter");
    }
    cleanFilter = f as LedgerFilterMode;
  }

  const cleanBaseCurrency =
    typeof baseCurrency === "string" && baseCurrency.trim() !== ""
      ? baseCurrency.trim().toUpperCase()
      : "IDR";

  let normalizedPeriods: HorizonNormalizedPeriod[];
  try {
    normalizedPeriods = normalizeHorizonPeriods(periods, numMonths);
  } catch (err: any) {
    validationError(err.message, "periods");
  }

  // 1. Single-pass concurrent fetch of domain entities
  const [wallets, goals, goalWallets, allTransactions, fxRates] = await Promise.all([
    db.select().from(schema.wallets).where(eq(schema.wallets.walletUserId, userId)),
    db
      .select()
      .from(schema.goals)
      .where(and(eq(schema.goals.goalUserId, userId), ne(schema.goals.goalStatus, "cancelled"))),
    db.select().from(schema.goalWallets),
    db
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
      .where(eq(schema.transactions.transactionUserId, userId)),
    getExchangeRates(fetchFn),
  ]);

  const movements = allTransactions as TransactionMovement[];
  const walletsById = new Map<string, typeof schema.wallets.$inferSelect>();
  for (const w of wallets) {
    walletsById.set(w.walletId, w);
  }

  const goalLinksByGoalId = new Map<string, string[]>();
  for (const link of goalWallets) {
    const list = goalLinksByGoalId.get(link.goalId) || [];
    list.push(link.walletId);
    goalLinksByGoalId.set(link.goalId, list);
  }

  const nowIso = currentIsoTimestamp();
  const firstPeriod = normalizedPeriods[0];

  // 2. Compute starting snapshot balances at firstPeriod.startDate
  let startingSpendable = 0;
  let startingLocked = 0;
  const runningBalances = new Map<string, number>();

  for (const w of wallets) {
    const p0Snapshot = calculateWalletPeriodSnapshot({
      walletId: w.walletId,
      currentLiveBalance: w.walletBalance,
      nowIso,
      startDate: firstPeriod.startDate,
      endDate: firstPeriod.endDate,
      filter: cleanFilter,
      movements,
    });

    const initBal = p0Snapshot.initialBalance;
    runningBalances.set(w.walletId, initBal);

    const converted = convertCurrency(initBal, w.walletCurrency, cleanBaseCurrency, fxRates.rates);
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

  // 3. Roll-forward chained simulation across each period
  const periodsData: PeriodProjection[] = [];

  for (const period of normalizedPeriods) {
    const { periodKey, startDate, endDate } = period;

    // Filter transactions occurring strictly within this period window matching cleanFilter
    const periodTxs = movements.filter((tx) => {
      if (tx.date < startDate || tx.date > endDate) return false;
      if (cleanFilter === "realized" && tx.isPlanned !== 0) return false;
      if (cleanFilter === "planned" && tx.isPlanned !== 1) return false;
      return true;
    });

    let periodIncome = 0;
    let periodExpense = 0;
    let periodNetSpendable = 0;
    let periodNetLocked = 0;

    for (const tx of periodTxs) {
      const srcWallet = walletsById.get(tx.walletId);
      const srcCurrency = srcWallet ? srcWallet.walletCurrency : cleanBaseCurrency;
      const srcIsLocked = srcWallet ? Number(srcWallet.walletIsLocked) === 1 : false;

      if (tx.type === "income") {
        const netAmt = tx.amount - (tx.adminFee || 0);
        const currBal = runningBalances.get(tx.walletId) ?? 0;
        runningBalances.set(tx.walletId, currBal + netAmt);

        const convertedIncome = convertCurrency(netAmt, srcCurrency, cleanBaseCurrency, fxRates.rates);
        periodIncome += convertedIncome;
        if (srcIsLocked) {
          periodNetLocked += convertedIncome;
        } else {
          periodNetSpendable += convertedIncome;
        }
      } else if (tx.type === "expense") {
        const totalDebit = tx.amount + (tx.adminFee || 0);
        const currBal = runningBalances.get(tx.walletId) ?? 0;
        runningBalances.set(tx.walletId, currBal - totalDebit);

        const convertedExpense = convertCurrency(totalDebit, srcCurrency, cleanBaseCurrency, fxRates.rates);
        periodExpense += convertedExpense;
        if (srcIsLocked) {
          periodNetLocked -= convertedExpense;
        } else {
          periodNetSpendable -= convertedExpense;
        }
      } else if (tx.type === "transfer" && tx.targetWalletId) {
        const totalDebit = tx.amount + (tx.adminFee || 0);
        const srcBal = runningBalances.get(tx.walletId) ?? 0;
        runningBalances.set(tx.walletId, srcBal - totalDebit);

        const tgtBal = runningBalances.get(tx.targetWalletId) ?? 0;
        runningBalances.set(tx.targetWalletId, tgtBal + tx.amount);

        const tgtWallet = walletsById.get(tx.targetWalletId);
        const tgtCurrency = tgtWallet ? tgtWallet.walletCurrency : srcCurrency;
        const tgtIsLocked = tgtWallet ? Number(tgtWallet.walletIsLocked) === 1 : false;

        const convertedDebit = convertCurrency(totalDebit, srcCurrency, cleanBaseCurrency, fxRates.rates);
        const convertedCredit = convertCurrency(tx.amount, tgtCurrency, cleanBaseCurrency, fxRates.rates);

        if (srcIsLocked) {
          periodNetLocked -= convertedDebit;
        } else {
          periodNetSpendable -= convertedDebit;
        }

        if (tgtIsLocked) {
          periodNetLocked += convertedCredit;
        } else {
          periodNetSpendable += convertedCredit;
        }

        if ((tx.adminFee || 0) > 0) {
          const convertedFee = convertCurrency(tx.adminFee!, srcCurrency, cleanBaseCurrency, fxRates.rates);
          periodExpense += convertedFee;
        }
      }
    }

    // Compute end-of-period net worth and per-wallet balances
    let periodSpendable = 0;
    let periodLocked = 0;
    const periodWalletEntries: Array<{
      item: PeriodProjection["walletBalances"][number];
      converted: number;
    }> = [];

    for (const w of wallets) {
      const bal = Number((runningBalances.get(w.walletId) ?? 0).toFixed(2));
      const converted = convertCurrency(bal, w.walletCurrency, cleanBaseCurrency, fxRates.rates);
      if (Number(w.walletIsLocked) === 1) {
        periodLocked += converted;
      } else {
        periodSpendable += converted;
      }

      periodWalletEntries.push({
        item: {
          walletId: w.walletId,
          walletName: w.walletName,
          balance: bal,
          currency: w.walletCurrency,
          isLocked: Number(w.walletIsLocked) || 0,
        },
        converted,
      });
    }

    periodWalletEntries.sort((a, b) => {
      const diffConverted = b.converted - a.converted;
      if (Math.abs(diffConverted) > 1e-6) {
        return diffConverted;
      }
      const diffBalance = b.item.balance - a.item.balance;
      if (Math.abs(diffBalance) > 1e-6) {
        return diffBalance;
      }
      return a.item.walletId.localeCompare(b.item.walletId);
    });

    const periodWalletBalances = periodWalletEntries.map((e) => e.item);
    // Evaluate goals at end of period
    const periodGoalEntries: Array<{
      item: PeriodProjection["goals"][number];
      converted: number;
    }> = [];
    for (const g of goals) {
      const linkedIds = goalLinksByGoalId.get(g.goalId) || [];
      let goalCurrent = 0;

      if (linkedIds.length === 0) {
        goalCurrent = g.goalCurrentAmount;
      } else {
        for (const wid of linkedIds) {
          const w = walletsById.get(wid);
          const bal = runningBalances.get(wid) ?? 0;
          const wCurr = w ? w.walletCurrency : g.goalCurrency;
          const converted = convertCurrency(bal, wCurr, g.goalCurrency, fxRates.rates);
          goalCurrent += converted;
        }
      }

      goalCurrent = Number(goalCurrent.toFixed(2));
      const target = g.goalTargetAmount;
      const progress = target > 0 ? Number(((goalCurrent / target) * 100).toFixed(2)) : 0;
      const reached = goalCurrent >= target;
      const convertedCurrent = convertCurrency(
        goalCurrent,
        g.goalCurrency || cleanBaseCurrency,
        cleanBaseCurrency,
        fxRates.rates
      );

      periodGoalEntries.push({
        item: {
          goalId: g.goalId,
          name: g.goalName,
          currentAmount: goalCurrent,
          targetAmount: target,
          progressPercentage: progress,
          isReached: reached,
        },
        converted: convertedCurrent,
      });
    }

    periodGoalEntries.sort((a, b) => {
      const diffConverted = b.converted - a.converted;
      if (Math.abs(diffConverted) > 1e-6) {
        return diffConverted;
      }
      const diffCurrent = b.item.currentAmount - a.item.currentAmount;
      if (Math.abs(diffCurrent) > 1e-6) {
        return diffCurrent;
      }
      return a.item.goalId.localeCompare(b.item.goalId);
    });

    const periodGoals = periodGoalEntries.map((e) => e.item);

    periodsData.push({
      periodKey,
      startDate,
      endDate,
      cashflow: {
        income: Number(periodIncome.toFixed(2)),
        expense: Number(periodExpense.toFixed(2)),
        net: Number((periodIncome - periodExpense).toFixed(2)),
        netSpendable: Number(periodNetSpendable.toFixed(2)),
        netLocked: Number(periodNetLocked.toFixed(2)),
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
