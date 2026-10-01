import { currentIsoTimestamp } from "./date";

export type BudgetSpendingStatus =
  | "upcoming"
  | "on_track"
  | "warning"
  | "exceeded"
  | "completed";

export interface BudgetCalculationResult {
  spent: number;
  remaining: number;
  percentUsed: number;
  status: BudgetSpendingStatus;
  daysRemaining: number;
  dailyAllowance: number;
}

export interface CalculateBudgetMetricsParams {
  amount: number;
  periodStart: string;
  periodEnd: string;
  spent: number;
  nowIso?: string;
}

/**
 * Pure calculation function for budget spending metrics, lifecycle status,
 * and daily spending pacing.
 */
export function calculateBudgetMetrics(
  params: CalculateBudgetMetricsParams
): BudgetCalculationResult {
  const { amount, periodStart, periodEnd, spent, nowIso = currentIsoTimestamp() } = params;

  const roundedSpent = Number(spent.toFixed(2));
  const remaining = Number((amount - roundedSpent).toFixed(2));
  const percentUsed = amount > 0 ? Number(((roundedSpent / amount) * 100).toFixed(2)) : 0;

  // 1. Evaluate Lifecycle & Spending Status
  let status: BudgetSpendingStatus;
  if (nowIso < periodStart) {
    status = "upcoming";
  } else if (nowIso > periodEnd) {
    status = roundedSpent > amount ? "exceeded" : "completed";
  } else {
    // Currently Active
    if (roundedSpent > amount) {
      status = "exceeded";
    } else if (roundedSpent >= 0.8 * amount) {
      status = "warning";
    } else {
      status = "on_track";
    }
  }

  // 2. Evaluate Days Remaining
  const nowMs = Date.parse(nowIso);
  const endMs = Date.parse(periodEnd);
  const msDiff = endMs - nowMs;
  const daysRemaining = msDiff > 0 ? Math.ceil(msDiff / (1000 * 60 * 60 * 24)) : 0;

  // 3. Evaluate Daily Allowance
  const dailyAllowance =
    daysRemaining > 0 && remaining > 0
      ? Number((remaining / daysRemaining).toFixed(2))
      : 0;

  return {
    spent: roundedSpent,
    remaining,
    percentUsed,
    status,
    daysRemaining,
    dailyAllowance,
  };
}
