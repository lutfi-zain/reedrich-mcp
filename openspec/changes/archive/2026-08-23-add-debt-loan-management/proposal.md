## Why

Users need a straightforward, reliable way to record and track debts (*hutang* / liabilities) and loans given (*piutang* / receivables), including internal self-borrowing (*talangan antar-pos / uang rumah*), without corrupting operational income and expense metrics. Currently, users must either record debts as artificial expenses/incomes (which falsely distorts monthly savings and cash flow summaries) or track them manually outside the system.

This change introduces a unified, pragmatic debt and loan management system that answers the core personal finance questions:
1. **Who owes us money?** (Piutang / Loans given)
2. **Whom do we owe money to?** (Hutang / Debts borrowed)
3. **When is it due?** (Due dates / *jatuh tempo*)
4. **Which wallet was used?** (Source/destination wallet balance sync)
5. **How much is left unpaid?** (Remaining balance and installment/repayment tracking)

## What Changes

- **Database Schema**: Add a new `debts_loans` table in `src/db/schema.ts` with multi-tenant row-level security (`debt_loan_user_id` FK -> `users.user_id`), UUID primary keys, and foreign keys to `wallets`.
- **New MCP Tool (`manage_debt_loan`)**: Add a new tool to create debts/loans, list commitments with status/type filtering, record full or partial repayments (*pelunasan / cicilan*), and update notes/due dates.
- **Wallet Balance Synchronization**:
  - Creating a `loan` (lending money) deducts from the specified wallet balance.
  - Creating a `debt` (borrowing money) credits the specified wallet balance (with an option to skip wallet credit if funding an immediate expense directly).
  - Repaying a `loan` (debtor pays us back) credits the recipient wallet.
  - Repaying a `debt` (we pay back the creditor) deducts from the payer wallet.
- **New MCP Resource (`finance://debts/active`)**: Expose live active/unpaid debts and receivables to AI agents.
- **Financial Summary Updates (`financial_summary`)**: Extend the summary payload to report `totalDebt` (unpaid liabilities) and `totalReceivable` (uncollected loans).
- **Resource Documentation (`finance://db/schema`)**: Include `debts_loans` table schema in the database schema resource.

## Capabilities

### New Capabilities
- `debt-loan-management`: Comprehensive management of personal debts (payable) and loans (receivable), tracking counterparties, principal amounts, remaining balances, due dates, settlement workflows, and wallet balance adjustments.

### Modified Capabilities
<!-- None: this is a new capability that extends the MCP server without breaking existing tool contracts. -->

## Non-Goals

- **Complex Amortization Schedules**: We do not implement dynamic interest rate compounding, variable APR calculations, or formal banking loan amortization schedules. The system focuses on principal amounts, optional admin fees, and explicit remaining balances.
- **Direct Bank Integration / Auto-Debiting**: The system does not connect to external banking APIs for automatic debiting; settlements are recorded through MCP tool calls.
- **Multi-Party Debt Splitting / Bill Splitting Engine**: Group debt splitting (like Splitwise algorithms) is out of scope for this baseline capability.

## Impact

- **Affected Code**: `src/db/schema.ts`, `src/mcp.ts`, `tests/mcp.test.ts`, `drizzle/` migrations.
- **API / Contract Impact**: Non-breaking addition of 1 new tool (`manage_debt_loan`) and 1 new resource (`finance://debts/active`).
- **Security & Multi-Tenancy**: All debt/loan records are strictly isolated by `userId`. All queries enforce `eq(debts_loans.debtLoanUserId, authenticatedUserId)`.
- **Performance**: High-performance edge queries on Cloudflare D1 with indexes on `(user_id, status)` and `(user_id, due_date)`.
