/**
 * Recurring Transaction Templates & Virtual Cashflow Projections
 */

export interface RecurringTemplateInput {
  templateId: string;
  templateName: string;
  templateWalletId: string;
  templateTargetWalletId?: string | null;
  templateCategoryId?: string | null;
  templateAmount: number;
  templateAdminFee?: number;
  templateType: 'expense' | 'income' | 'transfer';
  templateFrequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  templateInterval: number;
  templateStartDate: string;
  templateNextRunDate: string;
  templateEndDate?: string | null;
  templateIsActive: number;
  templateNotes?: string | null;
}

export interface ProjectedEvent {
  templateId: string;
  templateName: string;
  date: string;
  amount: number;
  adminFee: number;
  type: 'expense' | 'income' | 'transfer';
  walletId: string;
  targetWalletId?: string | null;
  categoryId?: string | null;
}

export interface CashflowProjection {
  lookaheadDays: number;
  startDate: string;
  endDate: string;
  projectedIncome: number;
  projectedExpense: number;
  projectedAdminFees: number;
  projectedNetChange: number;
  events: ProjectedEvent[];
}

/**
 * Calculates the next run date based on frequency, interval, and previous date string (YYYY-MM-DD or ISO).
 */
export function calculateNextRunDate(
  currentDateStr: string,
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly',
  interval: number = 1
): string {
  const safeInterval = Math.max(1, interval);
  const parts = currentDateStr.split('T')[0].split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // 0-indexed
  const day = parseInt(parts[2], 10);

  const date = new Date(Date.UTC(year, month, day));

  switch (frequency) {
    case 'daily':
      date.setUTCDate(date.getUTCDate() + safeInterval);
      break;
    case 'weekly':
      date.setUTCDate(date.getUTCDate() + 7 * safeInterval);
      break;
    case 'monthly': {
      const targetMonth = month + safeInterval;
      // Handle day of month clamping (e.g. Jan 31 -> Feb 28)
      date.setUTCFullYear(year, targetMonth, 1);
      const daysInTargetMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
      date.setUTCDate(Math.min(day, daysInTargetMonth));
      break;
    }
    case 'yearly': {
      const targetYear = year + safeInterval;
      date.setUTCFullYear(targetYear, month, 1);
      const daysInTargetMonth = new Date(Date.UTC(targetYear, month + 1, 0)).getUTCDate();
      date.setUTCDate(Math.min(day, daysInTargetMonth));
      break;
    }
  }

  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * In-memory virtual forward cashflow projection.
 * Projects upcoming occurrences within lookaheadDays starting from referenceDate.
 */
export function projectRecurringCashflow(
  templates: RecurringTemplateInput[],
  lookaheadDays: number = 30,
  referenceDate: Date = new Date()
): CashflowProjection {
  const refStart = new Date(Date.UTC(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    referenceDate.getUTCDate()
  ));
  const refEnd = new Date(refStart.getTime() + lookaheadDays * 24 * 60 * 60 * 1000);

  const startStr = refStart.toISOString().split('T')[0];
  const endStr = refEnd.toISOString().split('T')[0];

  const events: ProjectedEvent[] = [];
  let projectedIncome = 0;
  let projectedExpense = 0;
  let projectedAdminFees = 0;

  for (const t of templates) {
    if (t.templateIsActive !== 1) continue;

    let cursor = t.templateNextRunDate.split('T')[0];
    const endDate = t.templateEndDate ? t.templateEndDate.split('T')[0] : null;

    // Safety limit to avoid unbounded while loop
    let iterations = 0;
    while (cursor <= endStr && iterations < 365) {
      iterations++;
      if (cursor >= startStr) {
        if (endDate && cursor > endDate) {
          break;
        }

        events.push({
          templateId: t.templateId,
          templateName: t.templateName,
          date: cursor,
          amount: t.templateAmount,
          adminFee: t.templateAdminFee || 0,
          type: t.templateType,
          walletId: t.templateWalletId,
          targetWalletId: t.templateTargetWalletId,
          categoryId: t.templateCategoryId,
        });

        if (t.templateType === 'income') {
          projectedIncome += t.templateAmount;
        } else if (t.templateType === 'expense') {
          projectedExpense += t.templateAmount;
          projectedAdminFees += t.templateAdminFee || 0;
        } else if (t.templateType === 'transfer') {
          projectedAdminFees += t.templateAdminFee || 0;
        }
      }

      const nextCursor = calculateNextRunDate(
        cursor,
        t.templateFrequency,
        t.templateInterval
      );
      if (nextCursor <= cursor) {
        break;
      }
      cursor = nextCursor;
    }
  }

  // Sort events by date ascending
  events.sort((a, b) => a.date.localeCompare(b.date));

  const totalOutflow = projectedExpense + projectedAdminFees;
  const projectedNetChange = Math.round((projectedIncome - totalOutflow) * 100) / 100;

  return {
    lookaheadDays,
    startDate: startStr,
    endDate: endStr,
    projectedIncome: Math.round(projectedIncome * 100) / 100,
    projectedExpense: Math.round(projectedExpense * 100) / 100,
    projectedAdminFees: Math.round(projectedAdminFees * 100) / 100,
    projectedNetChange,
    events,
  };
}
