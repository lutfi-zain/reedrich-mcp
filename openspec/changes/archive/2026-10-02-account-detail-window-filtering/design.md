## Context

See `proposal.md` for motivation and background.

Currently, `getAccountDetail` (`src/services/account-snapshot.ts`) executes parallel queries for all domain entities. While `monthlyCashFlow` is properly constrained by `periodStart` and `periodEnd`, the query for `budgets` selects all records for the user without date filtering (`eq(schema.budgets.budgetUserId, userId)`), and `goals` selects all non-cancelled records (`sql`goal_status != 'cancelled'``).

This design applies window overlap filtering to `budgets` and in-progress status filtering to `goals` within `src/services/account-snapshot.ts`.

## Goals / Non-Goals

**Goals:**
- Constrain budgets in `getAccountDetail` to only records overlapping the requested window `[periodStart, periodEnd]`.
- Constrain goals in `getAccountDetail` to only active `in_progress` goals.
- Maintain full multi-tenant RLS and edge runtime performance.

**Non-Goals:**
- Modifying dedicated budget listing (`src/services/budget.ts`) or goal listing (`src/services/goal.ts`).
- Altering database schema or indexes.

## Decisions

### 1. Mathematical Period Overlap Filter for Budgets

- **Context**: Users can define budgets covering calendar months, weeks, or payday cycles. The query window `[periodStart, periodEnd]` represents the snapshot evaluation period.
- **Decision**: Update the budget select query in `src/services/account-snapshot.ts`:
  ```ts
  db.select()
    .from(schema.budgets)
    .where(
      and(
        eq(schema.budgets.budgetUserId, userId),
        lte(schema.budgets.budgetPeriodStart, periodEnd),
        gte(schema.budgets.budgetPeriodEnd, periodStart)
      )
    )
  ```
- **Rationale**:
  Two intervals $[S_1, E_1]$ and $[S_2, E_2]$ overlap if and only if $S_1 \le E_2 \land E_1 \ge S_2$.
  This guarantees that:
  * Active monthly budgets in the current window are included.
  * Partial-overlap budgets (e.g. bi-weekly or payday cycles crossing month boundaries) are included.
  * Expired budgets from prior months and upcoming budgets from future months are excluded.

### 2. Status Filtering for Active Goals

- **Context**: `account-detail` provides situational awareness for forward-looking liquidity and savings planning. Goals marked `completed` have already achieved their savings target and no longer require monthly savings allocations.
- **Decision**: Refine the goals query in `src/services/account-snapshot.ts`:
  ```ts
  db.select()
    .from(schema.goals)
    .where(
      and(
        eq(schema.goals.goalUserId, userId),
        eq(schema.goals.goalStatus, "in_progress")
      )
    )
  ```
- **Rationale**: Eliminates computational overhead of re-deriving balances and pacing metrics for completed or cancelled goals.

## Risks / Trade-offs

- **[Risk: Existing tests expecting all budgets/goals to appear regardless of date/status]** ➔ *Mitigation*: Update unit tests in `tests/mcp.test.ts` to ensure test fixtures provide dates overlapping the queried window and active status, and add explicit regression test scenarios verifying that non-overlapping budgets and completed goals are filtered out.
- **[Risk: Index utilization on composite date bounds]** ➔ *Mitigation*: The `budgets` table already has composite index `budgets_user_period_idx` on `(budget_user_id, budget_period_start, budget_period_end)`, ensuring edge queries execute in < 2ms.
