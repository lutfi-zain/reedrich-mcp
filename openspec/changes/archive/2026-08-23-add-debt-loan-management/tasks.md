## 1. Database Schema & Migrations

- [x] 1.1 Add `debtsLoans` table definition in `src/db/schema.ts` with UUID primary keys, foreign key constraints to `users` and `wallets`, and indexes on status and due date
- [x] 1.2 Generate D1 migration SQL file (`drizzle/0002_add_debts_loans.sql`) using `drizzle-kit generate` or manual migration script ensuring non-destructive table creation
- [x] 1.3 Update mock database initialization in `tests/mcp.test.ts` to include the `debts_loans` table schema

## 2. Core MCP Tool Implementation

- [x] 2.1 Register `manage_debt_loan` tool schema in `src/mcp.ts` with actions `create`, `list`, `repay`, and `update`
- [x] 2.2 Implement `manage_debt_loan` action `create` handler with input validations (counterparty name, positive amount, type), RLS scoping, and atomic wallet balance synchronization
- [x] 2.3 Implement `manage_debt_loan` action `list` handler supporting filtering by `status` (`unpaid`, `partially_paid`, `paid`) and `type` (`debt`, `loan`)
- [x] 2.4 Implement `manage_debt_loan` action `repay` handler with partial/full settlement math, status transitions, remaining balance updates, and atomic wallet balance adjustments
- [x] 2.5 Implement `manage_debt_loan` action `update` handler for modifying `dueDate`, `personName`, and `notes`

## 3. MCP Resource & Summary Integration

- [x] 3.1 Register and implement `finance://debts/active` MCP resource in `src/mcp.ts` returning active/unpaid debts and loans with summary totals
- [x] 3.2 Update `finance://db/schema` MCP resource content to document the `debts_loans` table schema and relationship model
- [x] 3.3 Update `financial_summary` tool handler in `src/mcp.ts` to compute and include `totalDebt` and `totalReceivable`

## 4. Test Suite & Verification

- [x] 4.1 Add comprehensive unit tests in `tests/mcp.test.ts` covering `manage_debt_loan` `create` (loan and debt), wallet balance deductions and additions, and RLS tenant isolation
- [x] 4.2 Add unit tests in `tests/mcp.test.ts` for `repay` (full and partial repayments, balance updates, overpayment error handling, and already-paid rejections)
- [x] 4.3 Add unit tests in `tests/mcp.test.ts` for `finance://debts/active` resource reading and `financial_summary` debt/receivable aggregation metrics
- [x] 4.4 Run `npm run typecheck` and `npm test` locally to ensure zero regressions and 100% passing tests

## 5. Documentation & Release Readiness

- [x] 5.1 Update `README.md` and `TOOLS.md` with documentation and examples for `manage_debt_loan` tool and `finance://debts/active` resource
- [x] 5.2 Validate OpenSpec artifacts with `openspec validate --strict` to verify full coherence
