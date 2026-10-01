# wallet-snapshots Specification

## Purpose

Defines the behavioral specification and mathematical ledger contract for point-in-time and period-bounded wallet snapshots, status filtering (realized, planned, all), and zero-ghost transaction creation across the wallet lifecycle.

## Requirements

### Requirement: Zero Ghost Transaction Invariant on Wallet Creation

The system MUST guarantee that every initial non-zero wallet balance is backed by an auditable opening transaction row in the database:

1. When a user creates a wallet via `POST /api/v1/wallets` or MCP tool `manage_wallet(action: 'create')` with `balance > 0`, the system MUST atomically insert an opening transaction row into `transactions`.
2. The opening transaction MUST have `transactionIsPlanned: 0`, `transactionType: "income"`, `transactionAmount: balance`, `transactionAdminFee: 0`, and a description stating the initial balance.
3. The opening transaction MUST be assigned to the system-reserved `Adjustment` or `Opening Balance` category.
4. If `balance` is `0` or omitted, no opening transaction row SHALL be inserted.

#### Scenario: Creating a wallet with positive initial balance inserts an opening transaction

- **GIVEN** an authenticated user
- **WHEN** the user creates a wallet "BCA Savings" with `balance: 5000000`
- **THEN** the wallet MUST be created with `walletBalance: 5000000`
- **THEN** exactly one transaction row MUST be inserted for the new wallet with `amount: 5000000`, `type: "income"`, `isPlanned: 0`, and description "Initial balance: BCA Savings"

#### Scenario: Creating a wallet with zero balance creates no transaction

- **GIVEN** an authenticated user
- **WHEN** the user creates a wallet "Empty Pocket" with `balance: 0`
- **THEN** the wallet MUST be created with `walletBalance: 0`
- **THEN** zero transaction rows SHALL be inserted

---

### Requirement: Wallet Snapshot Querying and Calculation

The system MUST support optional date boundaries and status filtering on `GET /api/v1/wallets` and MCP tool `manage_wallet(action: 'list')`:

1. **Parameters**:
   - `startDate`: Optional ISO date or timestamp string. Defaults to the start of the current calendar month (`YYYY-MM-01T00:00:00.000Z`) if `endDate` or `filter` is provided without `startDate`.
   - `endDate`: Optional ISO date or timestamp string. Defaults to the end of the current calendar month (`YYYY-MM-LastDayT23:59:59.999Z`) if `startDate` or `filter` is provided without `endDate`.
   - `filter`: Optional string enumeration with values `realized`, `planned`, or `all`. Defaults to `all` when date parameters are supplied.
2. **Snapshot Calculation Semantics**:
   - `initialBalance`: Sum of all transactions before `startDate` adhering to the filter semantics.
     * When `filter = "realized"`: Sums realized transactions (`isPlanned = 0`) before `startDate`.
     * When `filter = "all"`: Baseline anchoring: sums all realized transactions (`isPlanned = 0`) up to the present anchor plus any planned transactions (`isPlanned = 1`) scheduled before `startDate`.
     * When `filter = "planned"`: Sums only planned transactions (`isPlanned = 1`) before `startDate` with a zero baseline.
   - `totalIn`: Sum of incoming transactions (income net of fee, incoming transfers) strictly within `[startDate, endDate]`.
   - `totalOut`: Sum of outgoing transactions (expenses inclusive of fee, outgoing transfers inclusive of fee) strictly within `[startDate, endDate]`.
   - `periodDelta`: `totalIn - totalOut`.
   - `totalBalance`: Ending snapshot balance at `endDate`, computed as `initialBalance + periodDelta`.
3. **Response Envelope**:
   - If any of `startDate`, `endDate`, or `filter` is provided, each wallet item in the array MUST include a nested `snapshot` object containing `startDate`, `endDate`, `filter`, `initialBalance`, `totalIn`, `totalOut`, `periodDelta`, and `totalBalance`.
   - If neither `startDate`, `endDate`, nor `filter` is provided, the returned wallet objects SHALL NOT contain a `snapshot` object and SHALL preserve the existing `walletBalance` and `lastTransaction` shape.

#### Scenario: Querying wallet list without date parameters preserves legacy contract

- **GIVEN** an authenticated user with active wallets
- **WHEN** the user invokes `GET /api/v1/wallets` without date or filter parameters
- **THEN** the response SHALL be HTTP `200` with an array of wallet objects
- **THEN** each wallet object MUST contain `walletId`, `walletName`, `walletBalance`, and `lastTransaction`
- **THEN** no `snapshot` field SHALL be present in the wallet objects

#### Scenario: Querying wallet list with date range and all filter computes snapshot

- **GIVEN** a wallet with initial realized balance of `10000000` IDR
- **GIVEN** a planned income of `4000000` IDR on `2026-10-10`
- **GIVEN** a planned expense of `1500000` IDR on `2026-10-20`
- **WHEN** the user calls `GET /api/v1/wallets?startDate=2026-10-01&endDate=2026-10-31&filter=all`
- **THEN** the response SHALL contain a `snapshot` object on each wallet
- **THEN** for that wallet, `snapshot.initialBalance` MUST equal `10000000`
- **THEN** `snapshot.totalIn` MUST equal `4000000`
- **THEN** `snapshot.totalOut` MUST equal `1500000`
- **THEN** `snapshot.periodDelta` MUST equal `2500000`
- **THEN** `snapshot.totalBalance` MUST equal `12500000`

#### Scenario: Querying wallet list with realized filter isolates actual transactions

- **GIVEN** a wallet with realized balance of `10000000` IDR
- **GIVEN** a planned expense of `3000000` IDR in the current month
- **WHEN** the user calls `GET /api/v1/wallets?startDate=2026-10-01&endDate=2026-10-31&filter=realized`
- **THEN** `snapshot.totalOut` MUST NOT include the planned expense of `3000000`
- **THEN** `snapshot.totalBalance` MUST reflect only realized movements

#### Scenario: Reject invalid filter value

- **WHEN** the user calls `GET /api/v1/wallets?filter=invalid_filter`
- **THEN** the response SHALL be HTTP `400` with error code `VALIDATION`
