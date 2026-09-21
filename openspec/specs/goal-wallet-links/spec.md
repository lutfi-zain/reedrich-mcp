## Purpose

Defines the behavioral contract for many-to-many goal-to-wallet linking, derived goal progress computed as the sum of linked wallet balances, per-wallet contribution breakdowns, and graceful fallback for goals without links.

## Requirements

### Requirement: Goal Wallet Link Management

The system MUST support linking multiple wallets to a single goal and unlinking them, scoped strictly to the authenticated user. A link SHALL be rejected with `NOT_FOUND` when either the goal or the wallet does not exist or is not owned by the authenticated user. Linking an already-linked wallet SHALL be idempotent and succeed without duplication.

#### Scenario: Link multiple wallets to a goal

- **GIVEN** an authenticated user with a goal `"g-1"` and wallets `"w-A"`, `"w-B"`, `"w-C"` all owned by the user
- **WHEN** the user links `"w-A"`, `"w-B"`, and `"w-C"` to `"g-1"`
- **THEN** the system SHALL record three links and return the goal with `linkedWallets` containing three entries

#### Scenario: Link wallet belonging to another user is rejected

- **GIVEN** an authenticated user A with goal `"g-1"` and a wallet `"w-X"` owned by user B
- **WHEN** user A attempts to link `"w-X"` to `"g-1"`
- **THEN** the system SHALL return a `NOT_FOUND` error and SHALL NOT create the link

#### Scenario: Unlink wallet from a goal

- **GIVEN** a goal `"g-1"` with linked wallets `"w-A"` and `"w-B"`
- **WHEN** the user unlinks `"w-A"` from `"g-1"`
- **THEN** the system SHALL remove only that link and return the goal with `linkedWallets` containing only `"w-B"`

---

### Requirement: Derived Goal Progress from Linked Wallets

The system MUST compute `currentAmount` for a linked goal (one or more wallet links) as the sum of the linked wallets' balances converted to the goal currency, evaluated at read time. The stored `goalCurrentAmount` column SHALL be ignored whenever at least one link exists. The goal payload SHALL include `isDerived: true` and a per-wallet breakdown with `walletId`, `walletName`, `balance`, `currency`, `convertedAmount`, and `usedPeg` per entry.

#### Scenario: Derived progress sums linked wallet balances

- **GIVEN** a goal `"g-1"` in IDR with target 50000000 linked to wallet `"w-A"` (IDR 10000000) and wallet `"w-B"` (IDR 15000000)
- **WHEN** the user reads the goal
- **THEN** the response SHALL contain `currentAmount: 25000000`, `isDerived: true`, and `linkedWallets` with two entries reflecting each wallet's contribution

#### Scenario: Transaction on a linked wallet automatically moves goal progress

- **GIVEN** a goal `"g-1"` linked to wallet `"w-A"` with balance IDR 10000000
- **WHEN** the user records an income of IDR 2000000 into `"w-A"`
- **THEN** the next goal read SHALL reflect `currentAmount` increased by 2000000 without any explicit goal update call

#### Scenario: Locked linked wallet still counts in full

- **GIVEN** a goal `"g-1"` linked to wallet `"w-L"` with `walletIsLocked = 1` and balance IDR 20000000
- **WHEN** the user reads the goal
- **THEN** the response SHALL include the full 20000000 in `currentAmount`, since lock governs spendability, not ownership

---

### Requirement: Unlinked Goal Fallback to Stored Counter

The system MUST preserve legacy behavior for goals with zero wallet links: `currentAmount` SHALL be read from the stored `goalCurrentAmount` column and the payload SHALL include `isDerived: false` with an empty `linkedWallets` array.

#### Scenario: Unlinked goal uses stored counter

- **GIVEN** a goal `"g-1"` with no wallet links and stored `goalCurrentAmount` of 3000000
- **WHEN** the user reads the goal
- **THEN** the response SHALL contain `currentAmount: 3000000`, `isDerived: false`, and `linkedWallets: []`

#### Scenario: Linking the first wallet switches a goal to derived mode

- **GIVEN** a goal `"g-1"` with stored `goalCurrentAmount` of 3000000 and no links
- **WHEN** the user links wallet `"w-A"` (balance IDR 10000000) to `"g-1"`
- **THEN** the next goal read SHALL contain `currentAmount: 10000000` and `isDerived: true`, ignoring the stored 3000000
