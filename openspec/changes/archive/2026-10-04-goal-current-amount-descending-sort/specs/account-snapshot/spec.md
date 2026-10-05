## MODIFIED Requirements

### Requirement: Unified Budget, Goal, and Obligation Aggregation

The snapshot payload MUST include active budgets with realized spend and pacing status, active goals with calculated progress and linked wallet breakdowns, and outstanding debt/loan obligations:

1. **Budget Window Overlap Filtering**:
   The system MUST only include budgets in `budgets` whose defined interval overlaps with the requested snapshot window `[periodStart, periodEnd]`:
   $$\text{budgetPeriodStart} \le \text{periodEnd} \quad \text{AND} \quad \text{budgetPeriodEnd} \ge \text{periodStart}$$
   Budgets strictly ending before `periodStart` or strictly starting after `periodEnd` SHALL be excluded from the payload.

2. **Active Goal Status Filtering**:
   The system MUST only include goals in `goals` whose status is active:
   $$\text{goalStatus} = \text{'in\_progress'}$$
   Goals marked as `completed` or `cancelled` SHALL be excluded from the active planning snapshot.

3. **Enriched Budget Item Contract**:
   Each item in `budgets` MUST include:
   - `budgetId`: UUID string
   - `budgetName`: string
   - `categoryId`: UUID string or null
   - `categoryName`: string
   - `amount`: number (budgeted spending limit)
   - `periodStart`: ISO timestamp string matching `budgetPeriodStart`
   - `periodEnd`: ISO timestamp string matching `budgetPeriodEnd`
   - `spent`: number (sum of actual realized expense amounts plus admin fees occurring strictly within `[periodStart, periodEnd]`)
   - `remaining`: number (`amount - spent`)
   - `percentUsed`: number (`(spent / amount) * 100`, or 0 if amount is 0)
   - `status`: string enumeration:
     * `"upcoming"`: when the current time is before `periodStart`
     * `"on_track"`: when `periodStart <= now <= periodEnd` and `spent <= 0.8 * amount`
     * `"warning"`: when `periodStart <= now <= periodEnd` and `spent > 0.8 * amount` and `spent <= amount`
     * `"exceeded"`: when `spent > amount`
     * `"completed"`: when current time is after `periodEnd` and `spent <= amount`
   - `daysRemaining`: integer (number of calendar days until `periodEnd`, or 0 if expired)
   - `dailyAllowance`: number (`remaining / daysRemaining`, or 0 if `daysRemaining == 0` or `remaining <= 0`)

4. **Enriched Goal Item Contract**:
   Each item in `goals` MUST include:
   - `goalId`: UUID string
   - `goalName`: string
   - `targetAmount`: number
   - `currentAmount`: number
   - `targetDate`: ISO date string or null
   - `currency`: 3-letter currency code (e.g. `"IDR"`)
   - `status`: string (`"in_progress"`)
   - `progressPercentage`: number
   - `isDerived`: boolean
   - `daysRemaining`: integer or null
   - `requiredMonthlySavings`: number or null
   - `isReached`: boolean (`currentAmount >= targetAmount`)
   - `linkedWalletsBreakdown`: optional array of linked wallet balance details when `isDerived: true`
   The `goals` array MUST be sorted in descending order by each goal's `currentAmount` converted to `baseCurrency`, with raw `currentAmount` descending and `goalId` ascending as deterministic tie-breakers.

5. **Enriched Obligations Contract**:
   Each item in `obligations.activeDebts` and `obligations.activeLoans` MUST include:
   - `debtLoanId`: UUID string
   - `personName`: string
   - `amount`: number (original principal amount)
   - `remainingAmount`: number (unpaid balance)
   - `dueDate`: ISO date string or null
   - `status`: string (`"unpaid"`, `"partially_paid"`, `"paid"`)
   - `type`: string (`"debt"` or `"loan"`)
   - `walletId`: UUID string or null
   - `notes`: string or null

6. **Monthly Cashflow Integrity**:
   - `totalExpense` SHALL sum `transactionAmount + transactionAdminFee` for all expenses within the period, plus `transactionAdminFee` for transfer transactions.
   - `totalIncome` SHALL sum `transactionAmount - transactionAdminFee` for income transactions within the period, excluding opening balance transactions (`Initial balance:`).
   - `netSavings` SHALL equal `totalIncome - totalExpense`.

#### Scenario: Active budgets, goals, and obligations appear in snapshot
- **GIVEN** an authenticated user with:
  - An active budget for "Food" of Rp 3.000.000 with Rp 1.200.000 spent
  - An active goal "Emergency Fund" linked to a wallet with balance Rp 10.000.000
  - An outstanding debt of Rp 1.500.000 due on "2026-10-15"
- **WHEN** the user invokes `get_account_detail`
- **THEN** `budgets` SHALL contain the "Food" budget with `spent: 1200000`, `remaining: 1800000`, `percentUsed: 40.0`, and `status: "on_track"`
- **THEN** `goals` SHALL contain the "Emergency Fund" goal with `isDerived: true`, `currentAmount: 10000000`, and `linkedWalletsBreakdown`
- **THEN** `obligations.activeDebts` SHALL list the debt with `remainingAmount: 1500000` and `dueDate: "2026-10-15"`

#### Scenario: Budget item exposes period boundaries, categoryId, daysRemaining, and warning status
- **GIVEN** an active budget with amount `1000000`, period `2026-10-01` to `2026-10-31`, and spent `850000`
- **WHEN** the user invokes `get_account_detail`
- **THEN** the budget item MUST include `periodStart: "2026-10-01T00:00:00.000Z"`
- **THEN** the budget item MUST include `periodEnd: "2026-10-31T23:59:59.999Z"`
- **THEN** `status` MUST equal `"warning"`
- **THEN** `daysRemaining` MUST be an integer greater than or equal to 0
- **THEN** `dailyAllowance` MUST equal `remaining / daysRemaining`

#### Scenario: Goal item exposes targetDate, currency, requiredMonthlySavings, and isReached
- **GIVEN** an active goal with target `20000000` IDR and currentAmount `25000000`
- **WHEN** the user invokes `get_account_detail`
- **THEN** the goal item MUST contain `targetDate`, `currency: "IDR"`, `isReached: true`, and `requiredMonthlySavings: 0`

#### Scenario: Obligation item exposes original principal amount, type, walletId, and notes
- **GIVEN** an active debt with principal `5000000` and remaining `2000000` linked to wallet `w1`
- **WHEN** the user invokes `get_account_detail`
- **THEN** the obligation item MUST contain `amount: 5000000`, `remainingAmount: 2000000`, `type: "debt"`, and `walletId: "w1"`

#### Scenario: Exclude expired and future budgets outside query window
- **GIVEN** a budget "September Food" ending on `2026-09-30T23:59:59.999Z`
- **GIVEN** an active budget "October Food" spanning `2026-10-01` to `2026-10-31`
- **GIVEN** an upcoming budget "November Food" starting on `2026-11-01T00:00:00.000Z`
- **WHEN** the user queries `get_account_detail` for October (`2026-10-01` to `2026-10-31`)
- **THEN** `budgets` MUST include "October Food"
- **THEN** `budgets` MUST NOT include "September Food" or "November Food"

#### Scenario: Exclude completed goals from active snapshot
- **GIVEN** an in-progress goal "Emergency Fund" with status `"in_progress"`
- **GIVEN** an achieved goal "Paid Off Laptop" with status `"completed"`
- **WHEN** the user invokes `get_account_detail`
- **THEN** `goals` MUST include "Emergency Fund"
- **THEN** `goals` MUST NOT include "Paid Off Laptop"

#### Scenario: Active goals in snapshot are ordered by converted currentAmount descending
- **GIVEN** an authenticated user with two active goals: Goal A (`currentAmount: 5000000` IDR) and Goal B (`currentAmount: 25000000` IDR)
- **WHEN** the user queries `GET /api/v1/account-detail` or invokes `get_account_detail`
- **THEN** `goals` MUST be ordered as `[Goal B, Goal A]`
