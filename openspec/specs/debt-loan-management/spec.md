# debt-loan-management Specification

## Purpose

Provides personal debt (liabilities/payable) and loan (receivables) lifecycle management, tracking counterparties, due dates, settlement workflows, and wallet balance adjustments.

## Requirements

### Requirement: Create Debt or Loan Record
The system SHALL allow authenticated users to create debt (*hutang*) and loan (*piutang*) records specifying a counterparty person/institution name, initial principal amount, type (`debt` or `loan`), target wallet ID, optional due date, and optional notes.

#### Scenario: Successfully record a loan given to a counterparty
- **WHEN** an authenticated user calls `manage_debt_loan` with `action: "create"`, `type: "loan"`, `personName: "Budi"`, `amount: 500000`, and a valid `walletId`
- **THEN** the system MUST insert a new record in `debts_loans` with status `unpaid` and `remainingAmount: 500000`, and atomically deduct `500000` from the specified wallet balance

#### Scenario: Successfully record a debt borrowed with wallet funding
- **WHEN** an authenticated user calls `manage_debt_loan` with `action: "create"`, `type: "debt"`, `personName: "Joni"`, `amount: 1000000`, and a valid `walletId`
- **THEN** the system MUST insert a new record in `debts_loans` with status `unpaid` and `remainingAmount: 1000000`, and atomically credit `1000000` to the specified wallet balance

#### Scenario: Successfully record a debt without wallet funding for direct expense coverage
- **WHEN** an authenticated user calls `manage_debt_loan` with `action: "create"`, `type: "debt"`, `personName: "Uang Rumah OCBC"`, `amount: 1000000`, and `adjustWalletBalance: false` (or without `walletId`)
- **THEN** the system MUST insert the debt record for tracking liability without altering any wallet balance

#### Scenario: Validation failure on missing counterparty or non-positive amount
- **WHEN** a user attempts to create a debt or loan with an empty `personName` or an amount `<= 0`
- **THEN** the system MUST reject the request with a descriptive validation error message and leave the database unchanged

#### Scenario: Failure when wallet ID is invalid or belongs to another tenant
- **WHEN** a user specifies a `walletId` that does not exist or belongs to another user
- **THEN** the system MUST reject the request with a 404/unauthorized error and create no debt/loan records

---

### Requirement: List Debts and Loans
The system SHALL allow authenticated users to list their debts and loans with optional filtering by status (`unpaid`, `partially_paid`, `paid`) and type (`debt`, `loan`).

#### Scenario: List all active debts and loans for authenticated user
- **WHEN** an authenticated user calls `manage_debt_loan` with `action: "list"`
- **THEN** the system MUST return all debt and loan records belonging strictly to the authenticated `userId`, sorted by creation date descending

#### Scenario: Filter debts and loans by status and type
- **WHEN** a user calls `manage_debt_loan` with `action: "list"`, `status: "unpaid"`, and `type: "loan"`
- **THEN** the system MUST return only records matching `status = 'unpaid'` and `type = 'loan'` for that user

#### Scenario: Multi-tenant isolation prevents accessing other users records
- **WHEN** a user queries debts and loans
- **THEN** the system MUST NOT include any records belonging to different `userId`s

---

### Requirement: Repay and Settle Debt or Loan
The system SHALL allow authenticated users to record full or partial repayments (*cicilan / pelunasan*) against an existing debt or loan record, updating the remaining balance and adjusting the corresponding wallet balance.

#### Scenario: Full repayment of a loan given to a counterparty
- **WHEN** an authenticated user calls `manage_debt_loan` with `action: "repay"`, a valid `debtLoanId` having `remainingAmount: 500000`, `amount: 500000`, and a valid recipient `walletId`
- **THEN** the system MUST set `remainingAmount: 0`, update status to `paid`, and atomically credit `500000` to the recipient wallet

#### Scenario: Partial repayment of a debt with remaining balance update
- **WHEN** an authenticated user calls `manage_debt_loan` with `action: "repay"`, a valid `debtLoanId` having `remainingAmount: 1000000`, `amount: 400000`, and a valid source `walletId`
- **THEN** the system MUST set `remainingAmount: 600000`, update status to `partially_paid`, and atomically deduct `400000` from the source wallet

#### Scenario: Rejection of repayment exceeding remaining balance
- **WHEN** a user attempts to repay an amount greater than the `remainingAmount`
- **THEN** the system MUST reject the request with a validation error indicating that repayment cannot exceed the remaining balance

#### Scenario: Rejection of repayment on already fully paid debt or loan
- **WHEN** a user attempts to repay a record that already has status `paid`
- **THEN** the system MUST reject the request with an error indicating the debt/loan is already settled

---

### Requirement: Update Debt or Loan Details
The system SHALL allow authenticated users to update the metadata (such as `dueDate`, `personName`, or `notes`) of an existing debt or loan record.

#### Scenario: Update due date and notes for an existing active record
- **WHEN** an authenticated user calls `manage_debt_loan` with `action: "update"`, a valid `debtLoanId`, `dueDate: "2026-09-30"`, and `notes: "Extended repayment deadline"`
- **THEN** the system MUST update the specified fields on the record and return the updated entity

---

### Requirement: Active Debts and Loans Resource
The system SHALL expose an MCP resource at URI `finance://debts/active` returning a JSON list of all active (`unpaid` and `partially_paid`) debts and loans for the authenticated user.

#### Scenario: Read active debts and loans via MCP resource URI
- **WHEN** an authenticated client reads resource `finance://debts/active`
- **THEN** the system MUST return a JSON list containing all unsettled debts and loans with calculated totals for total remaining debt and total outstanding loans

---

### Requirement: Financial Summary Integration
The `financial_summary` tool SHALL include `totalDebt` (sum of remaining amounts for all unpaid/partially paid debts) and `totalReceivable` (sum of remaining amounts for all unpaid/partially paid loans) in its response.

#### Scenario: Summary aggregates total unpaid debts and total outstanding receivables
- **WHEN** an authenticated user calls `financial_summary`
- **THEN** the returned summary JSON MUST include `totalDebt` representing all unsettled liabilities and `totalReceivable` representing all unsettled loans
