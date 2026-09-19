## Purpose

Defines the behavioral contract for wallet lock flag management, liquidity segregation between spendable cash and protected locked capital reserves, and the deterministic Safe-to-Spend runway calculation engine.

## Requirements

### Requirement: Wallet Lock State Management via MCP

The system MUST support marking a wallet as locked (`isLocked: true`) or unlocked (`isLocked: false`) during wallet creation and wallet update via the `manage_wallet` tool.

The `isLocked` parameter SHALL be optional. When omitted during wallet creation, `isLocked` SHALL default to `false`. When updating an existing wallet, omitting `isLocked` SHALL preserve its current lock state.

#### Scenario: Create wallet with isLocked set to true

- **GIVEN** an authenticated user
- **WHEN** the user calls `manage_wallet` with `action: "create"`, `name: "Deposito BCA"`, `balance: 20000000`, and `isLocked: true`
- **THEN** the system SHALL create the wallet with `walletIsLocked` equal to `1` (true)
- **THEN** the returned wallet object SHALL reflect `walletIsLocked: 1`

#### Scenario: Update existing wallet lock state

- **GIVEN** an existing unlocked wallet with ID `"w-123"` owned by the authenticated user
- **WHEN** the user calls `manage_wallet` with `action: "update"`, `walletId: "w-123"`, and `isLocked: true`
- **THEN** the system SHALL update the wallet lock state to locked
- **THEN** the returned wallet object SHALL reflect `walletIsLocked: 1`

#### Scenario: Validation rejects non-boolean isLocked parameter

- **GIVEN** an authenticated user
- **WHEN** the user calls `manage_wallet` with `action: "create"`, `name: "Invalid Wallet"`, and `isLocked: "yes"`
- **THEN** the system SHALL reject the request with a `VALIDATION` error specifying that `isLocked` must be a boolean

---

### Requirement: Liquidity Segregation in Financial Summary

The system MUST partition all user wallet balances in `financial_summary` into segregated liquidity metrics: `spendableCash` and `lockedCash`.

`spendableCash` SHALL aggregate balances exclusively from unlocked wallets (`isLocked: false`). `lockedCash` SHALL aggregate balances exclusively from locked wallets (`isLocked: true`). Both metrics MUST provide breakdowns by currency and consolidated estimated totals in the active `baseCurrency`.

Total `netWorthByCurrency` and `consolidatedNetWorth` SHALL continue to reflect the sum of all wallets regardless of lock state.

#### Scenario: Financial summary segregates spendable and locked cash

- **GIVEN** an authenticated user with:
  - Wallet A (Unlocked, IDR 10,000,000)
  - Wallet B (Locked, IDR 40,000,000)
- **WHEN** the user or client invokes `financial_summary`
- **THEN** the response SHALL include `spendableCash` with total `10000000`
- **THEN** the response SHALL include `lockedCash` with total `40000000`
- **THEN** `consolidatedNetWorth.estimatedTotal` SHALL remain `50000000`

#### Scenario: Financial summary when all wallets are unlocked

- **GIVEN** an authenticated user whose wallets are all unlocked
- **WHEN** `financial_summary` is called
- **THEN** `spendableCash.estimatedTotal` SHALL equal `consolidatedNetWorth.estimatedTotal`
- **THEN** `lockedCash.estimatedTotal` SHALL equal `0`

---

### Requirement: Deterministic Safe-to-Spend Runway Calculation

The system MUST compute `safeToSpend` and `dailySafeToSpend` inside the financial summary engine.

The calculation SHALL be defined deterministically as:
$$\text{safeToSpend} = \text{spendableCash} - (\text{plannedExpenses} + \text{recurringExpenses30Days} + \text{activeDebts})$$

Where:
- `spendableCash` is the consolidated liquid cash in unlocked wallets in `baseCurrency`.
- `plannedExpenses` is the sum of planned expense transactions (`is_planned = 1`) scheduled within the active period.
- `recurringExpenses30Days` is the sum of projected recurring expense cashflows over the forward 30 days.
- `activeDebts` is the sum of outstanding debt obligations (`debt_loan_type = 'debt'` and `status != 'paid'`).

`dailySafeToSpend` SHALL be calculated as `safeToSpend / remainingDaysInPeriod` (where `remainingDaysInPeriod` is the remaining days in the active month or requested date range, minimum 1 day).

#### Scenario: Safe-to-Spend calculation with active obligations

- **GIVEN** an authenticated user with:
  - Spendable cash of IDR 10,000,000
  - Planned expenses of IDR 3,000,000
  - Projected 30-day recurring expenses of IDR 2,000,000
  - Active unpaid debts of IDR 1,000,000
  - 10 days remaining in the current billing period
- **WHEN** `financial_summary` is invoked
- **THEN** `safeToSpend` SHALL equal `4000000`
- **THEN** `dailySafeToSpend` SHALL equal `400000`

#### Scenario: Safe-to-Spend deficit alert when obligations exceed spendable cash

- **GIVEN** an authenticated user with spendable cash of IDR 2,000,000 and total upcoming obligations of IDR 5,000,000
- **WHEN** `financial_summary` is invoked
- **THEN** `safeToSpend` SHALL be `-3000000`
- **THEN** `dailySafeToSpend` SHALL be a negative value reflecting daily shortfall
- **THEN** the summary SHALL include `isDeficit: true` under `safeToSpendDetails`

---

### Requirement: Soft Lock Informational Notice on Locked Wallet Spending

The system SHALL allow recording expenses and outward transfers from locked wallets, but MUST include an explicit informational notice warning that protected reserves are being depleted.

#### Scenario: Expense recorded on locked wallet returns informational notice

- **GIVEN** a locked wallet with ID `"w-locked"` and balance IDR 5,000,000
- **WHEN** the user records an expense of IDR 500,000 on `"w-locked"`
- **THEN** the system SHALL reduce the wallet balance to IDR 4,500,000
- **THEN** the tool output SHALL include an informational notice: `"Notice: Expense recorded on locked wallet 'w-locked'. Protected capital reserve reduced."`

#### Scenario: Inward transfer or income to locked wallet succeeds without warning

- **GIVEN** a locked wallet with ID `"w-locked"`
- **WHEN** the user records an income or inward transfer to `"w-locked"`
- **THEN** the system SHALL increase the wallet balance without attaching a reserve depletion notice
