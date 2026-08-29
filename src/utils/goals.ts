/**
 * Goal Pacing and Savings Velocity Calculation Utilities
 */

export interface GoalPacingMetrics {
  targetAmount: number;
  currentAmount: number;
  remainingAmount: number;
  progressPercentage: number;
  isCompleted: boolean;
  targetDate: string | null;
  daysRemaining: number | null;
  monthsRemaining: number | null;
  requiredDailySavings: number | null;
  requiredMonthlySavings: number | null;
  status: 'in_progress' | 'completed' | 'cancelled';
}

export function calculateGoalPacing(
  targetAmount: number,
  currentAmount: number,
  targetDateStr: string | null | undefined,
  currentStatus: string = 'in_progress',
  referenceDate: Date = new Date()
): GoalPacingMetrics {
  const target = Math.max(0, targetAmount);
  const current = Math.max(0, currentAmount);
  const remaining = Math.max(0, target - current);
  const progress = target > 0 ? Math.min(100.0, Math.round((current / target) * 10000) / 100) : 100.0;
  const isCompleted = current >= target || currentStatus === 'completed';

  let daysRemaining: number | null = null;
  let monthsRemaining: number | null = null;
  let requiredDailySavings: number | null = null;
  let requiredMonthlySavings: number | null = null;

  if (targetDateStr && !isCompleted && currentStatus !== 'cancelled') {
    const targetDate = new Date(targetDateStr);
    if (!Number.isNaN(targetDate.getTime())) {
      const diffMs = targetDate.getTime() - referenceDate.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      daysRemaining = Math.max(1, diffDays);
      monthsRemaining = Math.max(0.1, Math.round((daysRemaining / 30.4375) * 100) / 100);

      requiredDailySavings = Math.round((remaining / daysRemaining) * 100) / 100;
      requiredMonthlySavings = Math.round((remaining / monthsRemaining) * 100) / 100;
    }
  }

  const effectiveStatus = (isCompleted ? 'completed' : currentStatus) as 'in_progress' | 'completed' | 'cancelled';

  return {
    targetAmount: target,
    currentAmount: current,
    remainingAmount: remaining,
    progressPercentage: progress,
    isCompleted,
    targetDate: targetDateStr || null,
    daysRemaining,
    monthsRemaining,
    requiredDailySavings,
    requiredMonthlySavings,
    status: effectiveStatus,
  };
}
