## MODIFIED Requirements

### Requirement: Deterministic Roll-Forward Balance and Cashflow Accumulator

For each period in the horizon board, the system MUST compute deterministic roll-forward projections by chaining ending balances from the preceding period:

1. **Period Boundaries**:
   Each period SHALL cover exact UTC boundaries:
   - `periodKey`: `YYYY-MM` for full calendar months, or `${startDate}_${endDate}` for custom intervals.
   - `startDate`: ISO-8601 UTC timestamp.
   - `endDate`: ISO-8601 UTC timestamp.

2. **Period Cashflow**:
   The system MUST compute:
   - `income`: Sum of all inward movements scheduled within the period window according to the active `filter`.
   - `expense`: Sum of all outward movements (including admin fees) scheduled within the period window according to the active `filter`.
   - `net`: `income - expense`.

3. **Chained Point-in-Time Wallet Balances**:
   - For the initial period ($P_0$), starting balances for each wallet SHALL be computed at $P_0.startDate$ using baseline anchoring (realized balance plus any planned movements prior to $P_0.startDate$).
   - For every subsequent period ($P_N$), the starting balance for each wallet MUST strictly equal the ending balance from period $P_{N-1}$:
     $$\text{Balance}_{\text{start}, P_N} = \text{Balance}_{\text{end}, P_{N-1}}$$
   - Ending balance for each period SHALL equal:
     $$\text{Balance}_{\text{end}} = \text{Balance}_{\text{start}} + \text{Inward Movements} - \text{Outward Movements}$$
   - In every period projection object, the `walletBalances` array MUST be sorted in descending order by each wallet's projected ending balance converted to `baseCurrency`, with raw `balance` descending and `walletId` ascending as deterministic tie-breakers.

4. **Net Worth Partitioning**:
   - `spendable`: Sum of projected balances for wallets with `walletIsLocked = 0`, converted to `baseCurrency`.
   - `locked`: Sum of projected balances for wallets with `walletIsLocked = 1`, converted to `baseCurrency`.
   - `total`: `spendable + locked`.

5. **Goal Milestone Projections**:
   For each active goal, the system MUST evaluate its projected progress at the end of each period:
   - If the goal has linked wallets, its projected balance SHALL equal the sum of those linked wallets' projected balances at that period's end.
   - The payload SHALL report `currentAmount`, `progressPercentage`, and `isReached: currentAmount >= targetAmount`.
   - In every period projection object, the `goals` array MUST be sorted in descending order by each goal's projected `currentAmount` converted to `baseCurrency`, with raw `currentAmount` descending and `goalId` ascending as deterministic tie-breakers.

#### Scenario: Roll-forward simulation accumulates balances over sequential months

- **GIVEN** wallet `w1` has current balance `10000000` IDR
- **GIVEN** a planned income of `5000000` IDR and planned expense of `2000000` IDR in Month 1
- **GIVEN** a planned expense of `1000000` IDR in Month 2
- **WHEN** the client requests a 2-month horizon projection
- **THEN** Month 1 wallet `w1` projected balance MUST equal `13000000` IDR
- **THEN** Month 2 wallet `w1` projected balance MUST equal `12000000` IDR

#### Scenario: Goal is marked reached when projected wallet balance achieves target

- **GIVEN** a goal with target `20000000` IDR linked to locked wallet `w2` having current balance `18000000` IDR
- **GIVEN** a planned deposit of `3000000` IDR into `w2` in Month 1
- **WHEN** the client requests a horizon projection
- **THEN** Month 1 goal projection MUST report `currentAmount: 21000000`, `progressPercentage >= 100`, and `isReached: true`

#### Scenario: Roll-forward simulation across custom non-calendar intervals

- **GIVEN** wallet `w1` has current balance `10000000` IDR
- **GIVEN** planned transactions scheduled in payday cycles
- **WHEN** the client requests horizon projection with 2D intervals `[["2026-09-25", "2026-10-24"], ["2026-10-25", "2026-11-24"]]`
- **THEN** interval 2 starting balance MUST equal interval 1 ending balance
- **THEN** net worth and goal projections MUST evaluate precisely at the end of each payday cycle

#### Scenario: Per-period walletBalances array is sorted by balance descending and updates dynamically across periods

- **GIVEN** wallet `w_low` has current balance `5000000` IDR and wallet `w_high` has current balance `20000000` IDR
- **GIVEN** no planned transactions in Period 1 and a planned income of `30000000` IDR into `w_low` in Period 2
- **WHEN** the client requests a 2-period horizon projection with `baseCurrency=IDR`
- **THEN** in Period 1 `walletBalances[0].walletId` MUST be `w_high` (`20000000`) and `walletBalances[1].walletId` MUST be `w_low` (`5000000`)
- **THEN** in Period 2 `walletBalances[0].walletId` MUST be `w_low` (`35000000`) and `walletBalances[1].walletId` MUST be `w_high` (`20000000`)

#### Scenario: Multi-currency walletBalances sorting uses baseCurrency converted valuation

- **GIVEN** wallet `w_idr` has projected balance `1000000` IDR and wallet `w_usd` has projected balance `500` USD (equivalent to `> 7500000` IDR)
- **WHEN** the client requests `GET /api/v1/analytics/horizon?baseCurrency=IDR`
- **THEN** `walletBalances` in that period MUST place `w_usd` before `w_idr` while preserving `w_usd.balance: 500` and `w_usd.currency: "USD"`

#### Scenario: Per-period goals array is sorted by currentAmount descending and updates dynamically across periods

- **GIVEN** goal `g_low` linked to wallet `w_low` (`5000000` IDR) and goal `g_high` linked to wallet `w_high` (`20000000` IDR)
- **GIVEN** no planned transactions in Period 1 and a planned income of `30000000` IDR into `w_low` in Period 2
- **WHEN** the client requests a 2-period horizon projection with `baseCurrency=IDR`
- **THEN** in Period 1 `goals[0].goalId` MUST be `g_high` (`20000000`) and `goals[1].goalId` MUST be `g_low` (`5000000`)
- **THEN** in Period 2 `goals[0].goalId` MUST be `g_low` (`35000000`) and `goals[1].goalId` MUST be `g_high` (`20000000`)
