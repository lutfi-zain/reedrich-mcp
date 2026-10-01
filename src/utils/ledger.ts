import { currentIsoTimestamp, isValidIsoDateOrTimestamp } from "./date";

export type LedgerFilterMode = "realized" | "planned" | "all";

export interface TransactionMovement {
  transactionId?: string;
  walletId: string;
  targetWalletId?: string | null;
  amount: number;
  adminFee?: number | null;
  type: string; // 'income' | 'expense' | 'transfer'
  isPlanned: number; // 0 | 1
  date: string; // ISO-8601 string
}

export interface WalletPeriodSnapshotResult {
  startDate: string;
  endDate: string;
  filter: LedgerFilterMode;
  initialBalance: number;
  totalIn: number;
  totalOut: number;
  periodDelta: number;
  totalBalance: number;
}

export interface HorizonNormalizedPeriod {
  periodKey: string;
  startDate: string;
  endDate: string;
}

/**
 * Normalizes an arbitrary date string (e.g. YYYY-MM-DD or full ISO) to full ISO UTC start or end of day.
 */
export function normalizeDateBoundary(dateStr: string, boundary: "start" | "end"): string {
  const trimmed = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return boundary === "start"
      ? `${trimmed}T00:00:00.000Z`
      : `${trimmed}T23:59:59.999Z`;
  }
  if (isValidIsoDateOrTimestamp(trimmed)) {
    // If it already contains 'T', parse and ensure valid UTC ISO string
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      return d.toISOString();
    }
  }
  throw new Error(`Validation Error: Invalid date string '${dateStr}'`);
}

/**
 * Parses and normalizes horizon periods supporting 2D arrays, JSON string of 2D array,
 * legacy comma-separated YYYY-MM, or default fallback to N consecutive calendar months.
 */
export function normalizeHorizonPeriods(
  input?: unknown,
  defaultMonths: number = 6
): HorizonNormalizedPeriod[] {
  let raw: unknown = input;

  // 1. Try parsing JSON string if input is string
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        raw = JSON.parse(trimmed);
      } catch {
        throw new Error("Validation Error: Invalid JSON format for periods parameter");
      }
    }
  }

  // 2. Case: 2D Array format [[start, end], ...]
  if (Array.isArray(raw)) {
    if (raw.length === 0) {
      throw new Error("Validation Error: At least one period is required for horizon projection");
    }
    if (raw.length > 24) {
      throw new Error("Validation Error: Maximum of 24 periods allowed for horizon projection");
    }

    const result: HorizonNormalizedPeriod[] = [];
    for (let i = 0; i < raw.length; i++) {
      const item = raw[i];
      if (!Array.isArray(item) || item.length !== 2) {
        throw new Error(
          `Validation Error: Period item at index ${i} must be a 2-element array [startDate, endDate]`
        );
      }

      const [startRaw, endRaw] = item;
      if (typeof startRaw !== "string" || typeof endRaw !== "string") {
        throw new Error(
          `Validation Error: Period item at index ${i} must contain valid string date boundaries`
        );
      }

      let startDate: string;
      let endDate: string;
      try {
        startDate = normalizeDateBoundary(startRaw, "start");
        endDate = normalizeDateBoundary(endRaw, "end");
      } catch (err: any) {
        throw new Error(
          `Validation Error: Invalid date in period item at index ${i}: ${err.message}`
        );
      }

      if (startDate > endDate) {
        throw new Error(
          `Validation Error: Period startDate '${startDate}' cannot be after endDate '${endDate}'`
        );
      }

      const sDatePart = startDate.substring(0, 10);
      const eDatePart = endDate.substring(0, 10);
      const periodKey = `${sDatePart}_${eDatePart}`;

      result.push({
        periodKey,
        startDate,
        endDate,
      });
    }

    return result;
  }

  // 3. Case: Legacy comma-separated YYYY-MM string
  if (typeof raw === "string" && raw.trim() !== "") {
    const rawKeys = raw
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    if (rawKeys.length === 0) {
      throw new Error("Validation Error: At least one period is required for horizon projection");
    }
    if (rawKeys.length > 24) {
      throw new Error("Validation Error: Maximum of 24 periods allowed for horizon projection");
    }

    const uniqueKeys: string[] = [];
    for (const k of rawKeys) {
      if (!/^\d{4}-\d{2}$/.test(k)) {
        throw new Error(`Validation Error: Invalid period format '${k}'. Expected YYYY-MM`);
      }
      if (!uniqueKeys.includes(k)) {
        uniqueKeys.push(k);
      }
    }
    uniqueKeys.sort();

    return uniqueKeys.map((k) => {
      const [y, m] = k.split("-").map(Number);
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      return {
        periodKey: k,
        startDate: `${k}-01T00:00:00.000Z`,
        endDate: `${k}-${String(lastDay).padStart(2, "0")}T23:59:59.999Z`,
      };
    });
  }

  // 4. Default: generate N consecutive calendar months starting from current month
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();
  const result: HorizonNormalizedPeriod[] = [];

  for (let i = 0; i < defaultMonths; i++) {
    const d = new Date(Date.UTC(currentYear, currentMonth + i, 1));
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const periodKey = `${yyyy}-${mm}`;
    const lastDay = new Date(Date.UTC(yyyy, d.getUTCMonth() + 1, 0)).getUTCDate();

    result.push({
      periodKey,
      startDate: `${periodKey}-01T00:00:00.000Z`,
      endDate: `${periodKey}-${String(lastDay).padStart(2, "0")}T23:59:59.999Z`,
    });
  }

  return result;
}

/**
 * Calculates net delta of a transaction movement for a specific wallet.
 * Returns positive number for inflow, negative for outflow, or 0 if not touching the wallet.
 */
export function getWalletMovementDelta(walletId: string, tx: TransactionMovement): number {
  const isSource = tx.walletId === walletId;
  const isTarget = tx.targetWalletId === walletId;
  const adminFee = tx.adminFee || 0;

  if (tx.type === "income" && isSource) {
    return tx.amount - adminFee;
  }
  if (tx.type === "expense" && isSource) {
    return -(tx.amount + adminFee);
  }
  if (tx.type === "transfer") {
    if (isSource && isTarget) {
      // Intra-wallet transfer: only deduct admin fee
      return -adminFee;
    }
    if (isSource) {
      return -(tx.amount + adminFee);
    }
    if (isTarget) {
      return tx.amount;
    }
  }
  return 0;
}

/**
 * Pure calculation function for single-period wallet snapshot.
 */
export function calculateWalletPeriodSnapshot(params: {
  walletId: string;
  currentLiveBalance: number;
  nowIso?: string;
  startDate: string;
  endDate: string;
  filter: LedgerFilterMode;
  movements: TransactionMovement[];
}): WalletPeriodSnapshotResult {
  const {
    walletId,
    currentLiveBalance,
    nowIso = currentIsoTimestamp(),
    startDate,
    endDate,
    filter,
    movements,
  } = params;

  // 1. Calculate Initial Balance using Baseline Anchoring
  let initialBalance = 0;

  if (filter === "planned") {
    // Pure budget / planned delta: baseline is 0, sum all planned movements prior to startDate
    for (const tx of movements) {
      if (tx.isPlanned === 1 && tx.date < startDate) {
        initialBalance += getWalletMovementDelta(walletId, tx);
      }
    }
  } else if (filter === "realized") {
    // Realized balance at startDate:
    // If startDate <= nowIso: reverse rollback realized transactions between startDate and nowIso
    // If startDate > nowIso: since no future realized transactions exist, equals current live balance
    if (startDate <= nowIso) {
      let realizedBetween = 0;
      for (const tx of movements) {
        if (tx.isPlanned === 0 && tx.date >= startDate && tx.date <= nowIso) {
          realizedBetween += getWalletMovementDelta(walletId, tx);
        }
      }
      initialBalance = currentLiveBalance - realizedBetween;
    } else {
      initialBalance = currentLiveBalance;
    }
  } else {
    // filter === 'all': Baseline Anchoring (live realized capital + planned roadmap)
    let realizedRollback = 0;
    if (startDate <= nowIso) {
      for (const tx of movements) {
        if (tx.isPlanned === 0 && tx.date >= startDate && tx.date <= nowIso) {
          realizedRollback += getWalletMovementDelta(walletId, tx);
        }
      }
    }

    let plannedPrior = 0;
    for (const tx of movements) {
      if (tx.isPlanned === 1 && tx.date < startDate) {
        plannedPrior += getWalletMovementDelta(walletId, tx);
      }
    }

    initialBalance = currentLiveBalance - realizedRollback + plannedPrior;
  }

  // 2. Calculate period movements within [startDate, endDate]
  let totalIn = 0;
  let totalOut = 0;

  for (const tx of movements) {
    if (tx.date >= startDate && tx.date <= endDate) {
      // Check filter match
      if (filter === "realized" && tx.isPlanned !== 0) continue;
      if (filter === "planned" && tx.isPlanned !== 1) continue;

      const isSource = tx.walletId === walletId;
      const isTarget = tx.targetWalletId === walletId;
      const adminFee = tx.adminFee || 0;

      if (tx.type === "income" && isSource) {
        totalIn += tx.amount - adminFee;
      } else if (tx.type === "expense" && isSource) {
        totalOut += tx.amount + adminFee;
      } else if (tx.type === "transfer") {
        if (isSource && isTarget) {
          totalOut += adminFee;
        } else {
          if (isSource) {
            totalOut += tx.amount + adminFee;
          }
          if (isTarget) {
            totalIn += tx.amount;
          }
        }
      }
    }
  }

  const roundedInitial = Number(initialBalance.toFixed(2));
  const roundedIn = Number(totalIn.toFixed(2));
  const roundedOut = Number(totalOut.toFixed(2));
  const periodDelta = Number((roundedIn - roundedOut).toFixed(2));
  const totalBalance = Number((roundedInitial + periodDelta).toFixed(2));

  return {
    startDate,
    endDate,
    filter,
    initialBalance: roundedInitial,
    totalIn: roundedIn,
    totalOut: roundedOut,
    periodDelta,
    totalBalance,
  };
}
