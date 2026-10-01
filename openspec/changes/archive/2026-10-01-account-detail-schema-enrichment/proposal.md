## Why

The `get_account_detail` MCP tool and `GET /api/v1/account-detail` REST endpoint serve as the primary atomic financial snapshot for user interfaces and AI planning agents. However, multiple critical domain properties and calculation invariants are currently missing or truncated:
1. `budgets` omit start/end date boundaries (`periodStart`, `periodEnd`), category identifiers (`categoryId`), days remaining, and are constrained to a simplistic binary status (`on_track` | `exceeded`). Furthermore, budget spending currently filters from the account-wide query window instead of each budget's actual period, and ignores transaction admin fees.
2. `goals` omit deadline dates (`targetDate`), original currency (`currency`), goal status (`status`), pacing milestones (`requiredMonthlySavings`), and completion flags (`isReached`).
3. `obligations` omit original principal amounts (`amount`), type indicators (`type`), linked wallets (`walletId`), and notes (`notes`).
4. `monthlyCashFlow` ignores transaction admin fees and improperly counts opening balances as operational income.

This change enriches the account detail snapshot across budgets, goals, obligations, and cashflows, aligning it with the deterministic financial intelligence contract of the platform.

## What Changes

- **Enriched Budget Schema & Accurate Period Spending (`src/services/account-snapshot.ts`, `src/services/budget.ts`)**:
  - Expose `periodStart` (ISO timestamp) and `periodEnd` (ISO timestamp) on every budget item in `account-detail`.
  - Expose `categoryId` (UUID string or null) alongside `categoryName`.
  - Expand budget `status` from a crude binary check to a rich lifecycle & health enumeration:
    * `"upcoming"`: Current time is before `periodStart`.
    * `"on_track"`: Budget is active (`periodStart <= now <= periodEnd`) and spent $\le 80\%$ of budget amount.
    * `"warning"`: Budget is active and spent is between $80\%$ and $100\%$ of budget amount.
    * `"exceeded"`: Realized spent exceeds $100\%$ of budget amount (`spent > amount`).
    * `"completed"`: Current time is after `periodEnd` and budget did not exceed limit (`spent <= amount`).
  - Add pacing fields: `daysRemaining` (integer days until `periodEnd`, or 0 if expired) and `dailyAllowance` (remaining allowance divided by days remaining, or 0 if expired/exceeded).
  - Calculate budget spending strictly against each budget's own `budgetPeriodStart` and `budgetPeriodEnd`, inclusive of `transactionAdminFee`.
  - Add `status`, `periodStart`, `periodEnd`, `daysRemaining`, and `dailyAllowance` to `GET /api/v1/budgets` and MCP tool `manage_budget(action: 'status')` for complete consistency.

- **Enriched Goals Snapshot (`src/services/account-snapshot.ts`)**:
  - Expose `targetDate` (`goalTargetDate`), `currency` (`goalCurrency`), and `status` (`goalStatus`) on all goal items.
  - Expose `requiredMonthlySavings` from the pacing calculation.
  - Expose `isReached` boolean (`currentAmount >= targetAmount`).

- **Enriched Obligations Snapshot (`src/services/account-snapshot.ts`)**:
  - Expose original principal `amount` (`debtLoanAmount`), `type` (`debtLoanType`: `"debt"` | `"loan"`), `walletId` (`debtLoanWalletId`), and `notes` (`debtLoanNotes`) on both `activeDebts` and `activeLoans`.

- **Cashflow Calculation Hygiene (`src/services/account-snapshot.ts`)**:
  - Include `transactionAdminFee` in `totalExpense` for expense transactions.
  - Net out `transactionAdminFee` from `totalIncome` for income transactions.
  - Capture transfer fees in `totalExpense`.
  - Exclude opening balance transactions (`Initial balance:`) from operational `totalIncome`.

- **OpenAPI 3.0 Documentation (`src/docs/openapi.ts`)**:
  - Define concrete JSON schema properties for `budgets`, `goals`, and `obligations` inside `AccountDetail`, replacing generic `{ type: "object" }`.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `account-snapshot`: Modifies `specs/account-snapshot/spec.md` to specify the enriched budget, goal, obligation, and cashflow payload contracts and calculations.

## Non-Goals

- Changing database schema or adding new columns to `budgets`, `goals`, or `debts_loans` (all added fields exist in the database or are derived mathematically).
- Altering existing goal derivation formulas or FX conversion math.
- Modifying write operations (`POST`, `PATCH`, `DELETE`) for budgets, goals, or debts.

## Impact & Constraints

- **Multi-Tenant RLS**: All queries for budget transactions and obligations strictly enforce `eq(table.userId, authenticatedUserId)`.
- **Zero-Remote-Deletion Invariant**: No DDL migrations or data deletions; this change is purely additive and computational.
- **Backward Compatibility**: All existing keys in `AccountDetailResult` are preserved. Newly added fields are purely additive, preventing breaking changes for existing client dashboards.
- **Edge Performance**: Budget spending queries are batched or evaluated in memory using already-fetched domain transactions to prevent N+1 database round trips.
