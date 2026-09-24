## ADDED Requirements

### Requirement: Wallet Listing with Recent Transaction Metadata

The system MUST include a `lastTransaction` object out-of-the-box for each wallet returned by `listWallets` and the `manage_wallet(action: "list")` MCP tool.

For wallets having at least one realized transaction (`is_planned = 0`), `lastTransaction` SHALL contain:
- `transactionId`: UUID of the transaction.
- `date`: ISO timestamp string of the transaction date.
- `type`: transaction type (`expense`, `income`, or `transfer`).
- `direction`: transfer/flow direction (`out` for expenses and outward transfers; `in` for incomes and inward transfers).
- `amount`: transaction monetary amount.
- `description`: transaction description string.
- `category`: classification name string, or `null` if unclassified.

For wallets with zero recorded transactions, `lastTransaction` SHALL be `null`.

#### Scenario: Listing wallets includes last transaction details
- **GIVEN** an authenticated user with a bank wallet having an expense transaction of Rp 150.000 dated "2026-09-23T10:00:00.000Z"
- **WHEN** the user invokes `manage_wallet` with `action: "list"`
- **THEN** the returned wallet object SHALL include `lastTransaction` with `amount: 150000`, `type: "expense"`, `direction: "out"`, and `date: "2026-09-23T10:00:00.000Z"`

#### Scenario: Inward transfer reflects direction in for destination wallet
- **GIVEN** an inward transfer of Rp 500.000 from Wallet A to Wallet B
- **WHEN** the user invokes `manage_wallet` with `action: "list"`
- **THEN** Wallet B's `lastTransaction` SHALL reflect `type: "transfer"` and `direction: "in"`
- **THEN** Wallet A's `lastTransaction` SHALL reflect `type: "transfer"` and `direction: "out"`

#### Scenario: Wallet without transactions returns null lastTransaction
- **GIVEN** a newly created wallet with no transactions recorded
- **WHEN** the user invokes `manage_wallet` with `action: "list"`
- **THEN** the wallet object SHALL include `lastTransaction: null`
