## Why

Currently, `get_account_detail` and `GET /api/v1/account-detail` fetch every budget in the database without any temporal filtering, causing expired budgets from previous months and unstarted budgets from future cycles to pollute the snapshot payload. Additionally, goals are queried with `goal_status != 'cancelled'`, which loads and computes derived balances for long-completed goals alongside active milestones.

This change aligns `budgets` in `get_account_detail` to only return records that overlap with the requested query window `[startDate, endDate]` ($\text{budgetPeriodStart} \le \text{endDate} \land \text{budgetPeriodEnd} \ge \text{startDate}$) and restricts `goals` to active in-progress milestones (`goalStatus = 'in_progress'`), delivering a clean, focused, situational planning snapshot.

## What Changes

- **Budget Window Overlap Filtering (`src/services/account-snapshot.ts`)**:
  - Update the database query in `getAccountDetail` to filter user budgets by temporal overlap against the snapshot window `[periodStart, periodEnd]`:
    `lte(schema.budgets.budgetPeriodStart, periodEnd)` and `gte(schema.budgets.budgetPeriodEnd, periodStart)`.
  - Automatically isolates active budgets relevant to the evaluated period (e.g. current calendar month), filtering out obsolete budgets from past months and unstarted budgets from future cycles.

- **Active Goal Status Filtering (`src/services/account-snapshot.ts`)**:
  - Update the goal query in `getAccountDetail` to filter by `eq(schema.goals.goalStatus, "in_progress")`, replacing `sql`goal_status != 'cancelled'``.
  - Excludes completed goals from the active situational snapshot, avoiding redundant derived calculations and focusing recommendations on milestones requiring active capital allocation.

- **MCP Tool & REST Route Alignment**:
  - The behavior applies consistently across the `get_account_detail` MCP tool and `GET /api/v1/account-detail` REST route.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `account-snapshot`: Modifies `specs/account-snapshot/spec.md` to specify that budgets are filtered by period overlap with the query window and goals are filtered to active in-progress records.

## Non-Goals

- Modifying the dedicated `GET /api/v1/budgets` or `GET /api/v1/goals` endpoints (which retain their respective query filters and full record listings).
- Adding persistent database columns or running schema migrations.
- Changing the calculation formulas for budget pacing or goal milestone pacing.

## Impact & Constraints

- **Multi-Tenant RLS**: Queries strictly enforce `eq(schema.budgets.budgetUserId, userId)` and `eq(schema.goals.goalUserId, userId)`.
- **Zero-Remote-Deletion Invariant**: Read query enhancement only; no DDL or DML mutations.
- **Payload & Performance**: Reduces response payload size and eliminates unnecessary derived calculation loops for expired budgets and completed goals.
