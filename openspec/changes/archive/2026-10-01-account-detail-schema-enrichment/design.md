## Context

See `proposal.md` for motivation and background.

Currently, `GET /api/v1/account-detail` and MCP tool `get_account_detail` aggregate multiple financial domains into a single atomic payload. However:
1. `budgets` omit start/end dates, category IDs, days remaining, daily allowance, and utilize a crude binary status (`on_track` | `exceeded`). Moreover, budget spending is computed against the request's global date filter rather than each budget's specific `budgetPeriodStart` and `budgetPeriodEnd`, omitting transaction admin fees.
2. `goals` omit target dates, currencies, original statuses, required monthly savings, and completion flags (`isReached`).
3. `obligations` omit principal amounts, type indicators, linked wallets, and notes.
4. `monthlyCashFlow` omits transaction admin fees and improperly counts opening balance transactions as operational income.

This design introduces a pure, deterministic budget status and pacing calculator in `src/utils/budgets.ts`, unifies budget evaluation between `budget.ts` and `account-snapshot.ts`, enriches domain DTOs with full schema fidelity, and documents concrete types in OpenAPI 3.0.

## Goals / Non-Goals

**Goals:**
- Create `src/utils/budgets.ts` with pure mathematical functions for budget status (`upcoming`, `on_track`, `warning`, `exceeded`, `completed`), days remaining, and daily allowance.
- Standardize budget spending calculations to evaluate transactions strictly within each budget's own `[budgetPeriodStart, budgetPeriodEnd]` window, inclusive of admin fees.
- Expose all missing domain attributes across `budgets`, `goals`, `obligations`, and `monthlyCashFlow` in `AccountDetailResult`.
- Replace generic `{ type: "object" }` schemas in `src/docs/openapi.ts` with fully typed properties for `budgets`, `goals`, and `obligations`.

**Non-Goals:**
- Adding or altering PostgreSQL database columns or migrations (all required attributes already exist in the database or are derived).
- Modifying budget creation or mutation validation logic.
- Breaking backward compatibility for existing client dashboards.

## Decisions

### 1. Pure Budget Status & Pacing Calculator (`src/utils/budgets.ts`)

- **Context**: Budget status calculation is currently scattered and simplistic (`spent > amount ? "exceeded" : "on_track"`). Pacing metrics are absent.
- **Decision**: Create `src/utils/budgets.ts` following the Gold Standard pure utility pattern (like `src/utils/goals.ts`):
  ```ts
  export type BudgetSpendingStatus = "upcoming" | "on_track" | "warning" | "exceeded" | "completed";

  export interface BudgetCalculationResult {
    spent: number;
    remaining: number;
    percentUsed: number;
    status: BudgetSpendingStatus;
    daysRemaining: number;
    dailyAllowance: number;
  }

  export function calculateBudgetMetrics(params: {
    amount: number;
    periodStart: string;
    periodEnd: string;
    spent: number;
    nowIso?: string;
  }): BudgetCalculationResult
  ```
- **Status Evaluation Logic**:
  * If `nowIso < periodStart`: `"upcoming"`
  * If `nowIso > periodEnd`: `spent > amount ? "exceeded" : "completed"`
  * If active (`periodStart <= nowIso <= periodEnd`):
    - `spent > amount`: `"exceeded"`
    - `spent >= 0.8 * amount`: `"warning"`
    - otherwise: `"on_track"`
- **Pacing Metrics**:
  * `daysRemaining`: `Math.max(0, Math.ceil((Date.parse(periodEnd) - Date.parse(nowIso)) / (1000 * 60 * 60 * 24)))`.
  * `dailyAllowance`: `daysRemaining > 0 && remaining > 0 ? Number((remaining / daysRemaining).toFixed(2)) : 0`.
- **Rationale**: Reusable across `src/services/account-snapshot.ts`, `src/services/budget.ts` (`budgetStatus`, `getBudgetById`), and MCP tool `manage_budget(action: 'status')`.

### 2. Accurate Per-Budget Transaction Querying

- **Context**: Currently, `account-snapshot.ts` filters budget spending from `txs` (the query window of `account-detail`, e.g. current calendar month). Budgets spanning custom periods (e.g. weekly or payday cycles) receive incorrect transactions.
- **Decision**: In `account-snapshot.ts`, fetch all realized expense transactions for the user within the overarching bounds of all user budgets, and evaluate each budget against transactions matching:
  ```ts
  t.transactionDate >= b.budgetPeriodStart &&
  t.transactionDate <= b.budgetPeriodEnd &&
  (b.budgetCategoryId ? t.transactionCategoryId === b.budgetCategoryId : t.transactionBudgetId === b.budgetId)
  ```
  And sum `t.transactionAmount + (t.transactionAdminFee || 0)`.
- **Rationale**: Eliminates date bleeding and ensures weekly or multi-month budgets calculate mathematically correct spending.

### 3. Enriched DTO Contracts

- **Budgets in `AccountDetailResult["budgets"]`**:
  * `budgetId`: string (UUID)
  * `budgetName`: string
  * `categoryId`: string | null
  * `categoryName`: string
  * `amount`: number
  * `periodStart`: string (ISO)
  * `periodEnd`: string (ISO)
  * `spent`: number
  * `remaining`: number
  * `percentUsed`: number
  * `status`: `"upcoming"` | `"on_track"` | `"warning"` | `"exceeded"` | `"completed"`
  * `daysRemaining`: number
  * `dailyAllowance`: number
- **Goals in `AccountDetailResult["goals"]`**:
  * `targetDate`: string | null
  * `currency`: string
  * `status`: string
  * `requiredMonthlySavings`: number | null
  * `isReached`: boolean
- **Obligations in `AccountDetailResult["obligations"]`**:
  * `amount`: number (original principal)
  * `type`: `"debt"` | `"loan"`
  * `walletId`: string | null
  * `notes`: string | null

### 4. Cashflow Accounting Alignment

- **Context**: `monthlyCashFlow` in `account-snapshot.ts` ignored admin fees and included initial balance transactions.
- **Decision**: Update the loop in `account-snapshot.ts`:
  * Expense: `totalExpense += t.transactionAmount + (t.transactionAdminFee || 0)`
  * Income: Exclude `Initial balance:` transactions; subtract `transactionAdminFee`.
  * Transfer: Count `transactionAdminFee > 0` towards `totalExpense`.

## Risks / Trade-offs

- **[Risk: Breaking existing client code expecting binary status ("on_track" | "exceeded")]** ➔ *Mitigation*: `"on_track"` and `"exceeded"` remain the primary states; new states (`"warning"`, `"upcoming"`, `"completed"`) refine edge cases. All existing fields remain present and typed.
- **[Risk: Additional CPU time for per-budget transaction filtering]** ➔ *Mitigation*: Evaluated in memory across the user's realized transactions. Number of active budgets is typically < 20 and transactions < 500, executing in < 1ms on Cloudflare Workers edge runtime.
