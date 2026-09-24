## Purpose

Defines the behavioral contract for the comprehensive account snapshot service (`get_account_detail` MCP tool and `GET /api/v1/account-detail` REST endpoint), consolidating multi-currency net worth, partitioned wallet balances with last transaction metadata, monthly cashflows, active budgets, goal pacing, and debt/loan obligations into a single atomic payload.

## ADDED Requirements

### Requirement: Comprehensive Account Snapshot via MCP

The system MUST expose an MCP tool named `get_account_detail` that accepts optional `startDate`, `endDate`, and `baseCurrency` parameters, returning an atomic financial snapshot object for the authenticated user.

If `startDate` is omitted, it SHALL default to the start of the current month (`YYYY-MM-01T00:00:00.000Z`).
If `endDate` is omitted, it SHALL default to the end of the current month (`YYYY-MM-[last_day]T23:59:59.999Z`).
If `baseCurrency` is omitted, it SHALL default to `"IDR"`.

#### Scenario: User queries account snapshot with default parameters
- **GIVEN** an authenticated user with active wallets, monthly transactions, budgets, goals, and debts
- **WHEN** the user invokes `get_account_detail` with no parameters
- **THEN** the system SHALL return a unified JSON payload containing `netWorth`, `wallets`, `monthlyCashFlow`, `budgets`, `goals`, and `obligations`
- **THEN** `monthlyCashFlow.period` SHALL span from the first day to the last day of the current calendar month

#### Scenario: User queries account snapshot with custom date range and base currency
- **GIVEN** an authenticated user
- **WHEN** the user invokes `get_account_detail` with `startDate: "2026-08-01T00:00:00.000Z"`, `endDate: "2026-08-31T23:59:59.999Z"`, and `baseCurrency: "USD"`
- **THEN** the system SHALL calculate net worth and cashflows converted to `USD` using active exchange rates
- **THEN** `monthlyCashFlow.period` SHALL reflect the requested date range

#### Scenario: Validation error on malformed date string
- **GIVEN** an authenticated user
- **WHEN** the user invokes `get_account_detail` with `startDate: "not-a-date"`
- **THEN** the system SHALL reject the request with a `VALIDATION` error specifying that `startDate` must be a valid ISO date or timestamp

---

### Requirement: Partitioned Wallet Balances and Transaction Metadata

The snapshot payload MUST group user wallets into `spendable` (unlocked) and `locked` (protected reserves) categories, with consolidated sub-totals and an embedded `lastTransaction` object on each wallet record.

#### Scenario: Spendable and locked wallets partition with mutation metadata
- **GIVEN** an authenticated user with an unlocked bank wallet (balance Rp 5.000.000) and a locked investment wallet (balance Rp 20.000.000)
- **WHEN** the user queries `get_account_detail`
- **THEN** `wallets.spendable.total` SHALL be `5000000`
- **THEN** `wallets.locked.total` SHALL be `20000000`
- **THEN** each wallet in both groups SHALL include its respective `lastTransaction` object or `null` if no transactions exist

---

### Requirement: Unified Budget, Goal, and Obligation Aggregation

The snapshot payload MUST include active budgets with realized spend and pacing status, active goals with calculated progress and linked wallet breakdowns, and outstanding debt/loan obligations.

#### Scenario: Active budgets, goals, and obligations appear in snapshot
- **GIVEN** an authenticated user with:
  - An active budget for "Food" of Rp 3.000.000 with Rp 1.200.000 spent
  - An active goal "Emergency Fund" linked to a wallet with balance Rp 10.000.000
  - An outstanding debt of Rp 1.500.000 due on "2026-10-15"
- **WHEN** the user invokes `get_account_detail`
- **THEN** `budgets` SHALL contain the "Food" budget with `spent: 1200000`, `remaining: 1800000`, `percentUsed: 40.0`, and `status: "on_track"`
- **THEN** `goals` SHALL contain the "Emergency Fund" goal with `isDerived: true`, `currentAmount: 10000000`, and `linkedWalletsBreakdown`
- **THEN** `obligations.activeDebts` SHALL list the debt with `remainingAmount: 1500000` and `dueDate: "2026-10-15"`

---

### Requirement: REST Endpoint for Account Snapshot

The system MUST expose an HTTP route `GET /api/v1/account-detail` authenticated via JWT Bearer token or API key, producing the identical JSON payload structure as the MCP tool.

#### Scenario: Authenticated HTTP request retrieves account snapshot
- **GIVEN** a valid Bearer token for an authenticated user
- **WHEN** a client sends `GET /api/v1/account-detail`
- **THEN** the server SHALL respond with HTTP status `200` and the snapshot JSON payload

#### Scenario: Unauthenticated HTTP request is rejected
- **WHEN** a client sends `GET /api/v1/account-detail` without credentials
- **THEN** the server SHALL respond with HTTP status `401 Unauthorized`
