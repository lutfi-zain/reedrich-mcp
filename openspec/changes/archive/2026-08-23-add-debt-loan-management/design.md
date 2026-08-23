## Context

The Eve Finance MCP Server operates as a stateless service on Cloudflare Workers (`workerd` runtime) with Cloudflare D1 (SQLite) and Drizzle ORM. The system currently manages users, wallets, categories, budgets, and transactions, enforcing multi-tenant Row-Level Security (RLS) via `userId`.

See `proposal.md` for motivation and scope context.

## Goals / Non-Goals

**Goals:**
- Provide a dedicated, lightweight data model for tracking debts (*hutang*) and loans (*piutang*).
- Maintain 100% accurate wallet cash balances upon debt/loan creation and repayments.
- Support both external lending/borrowing and internal self-borrowing (*talangan antar-pos / uang rumah*).
- Expose an intuitive MCP tool `manage_debt_loan` and a dedicated resource `finance://debts/active`.
- Enhance `financial_summary` with `totalDebt` and `totalReceivable` aggregations.
- Ensure all schema changes and migrations are completely non-destructive to existing D1 data.

**Non-Goals:**
- Dynamic compound interest calculations or complex loan amortization tables.
- Automatic recurring direct debits or external payment gateway integrations.
- Multi-party group expense splitting algorithms.

## Decisions

### 1. Dedicated `debts_loans` Table vs. Overloading `transactions`
- **Decision**: Create a dedicated `debts_loans` table in `src/db/schema.ts` rather than overloading `transaction_type` or creating negative virtual wallets.
- **Rationale**: Tracking loan lifecycle (counterparty name, due date, remaining unpaid balance, settlement status) requires stateful contract attributes that do not belong in single-event transaction rows.
- **Schema Design**:
  ```typescript
  export const debtsLoans = sqliteTable("debts_loans", {
    debtLoanId: text("debt_loan_id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    debtLoanUserId: text("debt_loan_user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
    debtLoanPersonName: text("debt_loan_person_name").notNull(),
    debtLoanType: text("debt_loan_type").notNull().default("loan"), // "debt" | "loan"
    debtLoanAmount: real("debt_loan_amount").notNull(),
    debtLoanRemainingAmount: real("debt_loan_remaining_amount").notNull(),
    debtLoanWalletId: text("debt_loan_wallet_id").references(() => wallets.walletId, { onDelete: "set null" }),
    debtLoanDueDate: text("debt_loan_due_date"), // YYYY-MM-DD or ISO string
    debtLoanStatus: text("debt_loan_status").notNull().default("unpaid"), // "unpaid" | "partially_paid" | "paid"
    debtLoanNotes: text("debt_loan_notes"),
    debtLoanCreatedAt: text("debt_loan_created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  }, (table) => [
    index("debts_loans_user_status_idx").on(table.debtLoanUserId, table.debtLoanStatus),
    index("debts_loans_user_due_date_idx").on(table.debtLoanUserId, table.debtLoanDueDate),
    index("debts_loans_wallet_id_idx").on(table.debtLoanWalletId),
  ]);
  ```

### 2. Single Unified MCP Tool: `manage_debt_loan`
- **Decision**: Implement a single unified tool with actions (`create`, `list`, `repay`, `update`) instead of separate tools for every action.
- **Rationale**: Keeps the tool registry clean (12 total tools) and enables AI coding agents to reason about debt/loan lifecycle within a cohesive tool schema.

### 3. Atomic Balance Synchronization & Flexibility Flag
- **Decision**: When creating or repaying a debt/loan, update wallet balances atomically using SQL delta expressions. Provide an optional `adjustWalletBalance` boolean flag (default: `true`).
- **Balance Calculation Rules**:
  - `create` + `loan` (giving loan): Deduct amount from `walletId` (`wallet_balance - amount`).
  - `create` + `debt` (borrowing): Credit amount to `walletId` (`wallet_balance + amount`), or leave unchanged if `adjustWalletBalance: false` (e.g. when tracking an internal expense talangan already paid via `record_transaction`).
  - `repay` + `loan` (debtor pays us): Credit amount to `walletId` (`wallet_balance + amount`).
  - `repay` + `debt` (we pay creditor): Deduct amount from `walletId` (`wallet_balance - amount`).
  - If `remainingAmount` reaches `0`, update status to `paid`. If `0 < remainingAmount < amount`, update status to `partially_paid`.

### 4. Zero Remote Deletion & Migration Strategy
- **Decision**: The D1 migration SQL script (`drizzle/0002_add_debts_loans.sql`) performs only `CREATE TABLE` and `CREATE INDEX` operations.
- **Rationale**: Fully adheres to our zero-remote-deletion invariant, preserving all existing live production data.

## Risks / Trade-offs

- **[Risk] Floating Point Precision Loss in Repayments** → **Mitigation**: Use 2-decimal rounded precision helpers (`Number(val.toFixed(2))`) across all balance additions, subtractions, and comparisons.
- **[Risk] Double-Deduction on Self-Debt Expenses** → **Mitigation**: Document clear usage patterns for `adjustWalletBalance` and provide clear documentation examples so AI assistants don't double-charge wallets when linking expenses to internal debt tracking.
- **[Risk] Deleted Wallets Nullifying References** → **Mitigation**: Use `ON DELETE SET NULL` on `debt_loan_wallet_id` so deleting a historic wallet does not cascade-delete the user's active debt/loan contracts.
