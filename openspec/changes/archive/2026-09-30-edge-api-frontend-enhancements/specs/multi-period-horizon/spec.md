## Purpose

Defines the behavioral specification and mathematical simulation contract for the Multi-Period Horizon Board engine (`GET /api/v1/analytics/horizon` and MCP tool `get_horizon_projections`), delivering forward-looking multi-month cashflow projections, point-in-time wallet balance roll-forward accumulation, spendable vs locked net worth trajectory, and goal milestone achievements.

## ADDED Requirements

### Requirement: Multi-Period Horizon Board Computation

The system MUST expose `GET /api/v1/analytics/horizon` and MCP tool `get_horizon_projections` to compute a deterministic multi-period financial roadmap for the authenticated user:

1. **Input Parameters**:
   - `months`: Optional integer between 1 and 24 (default: `6`). Rejects values less than 1 or greater than 24 with HTTP `400 Bad Request` (`VALIDATION`).
   - `periods`: Optional comma-separated list of calendar months formatted as `YYYY-MM` (e.g. `2026-10,2026-11,2026-12`).
   - `baseCurrency`: Optional 3-letter currency code (default: `"IDR"`). All multi-currency assets and transactions SHALL be converted to this base currency using live exchange rates with fallback.

2. **Top-Level Output Structure**:
   The response MUST return a JSON object with:
   - `baseCurrency`: The evaluated base currency code.
   - `generatedAt`: ISO-8601 generation timestamp.
   - `startingNetWorth`: Object containing `total`, `spendable`, and `locked` net worth at the present snapshot.
   - `periods`: Array of chronological monthly period projection objects.

#### Scenario: Generate default 6-month horizon board

- **GIVEN** an authenticated user with active wallets, planned transactions, and goals
- **WHEN** the client invokes `GET /api/v1/analytics/horizon` without parameters
- **THEN** the system MUST respond with HTTP `200 OK`
- **THEN** `periods` MUST contain exactly 6 consecutive calendar month objects starting from the current or subsequent calendar month
- **THEN** each period MUST contain `cashflow`, `netWorth`, `walletBalances`, and `goals`

#### Scenario: Reject out-of-range months parameter

- **WHEN** the client invokes `GET /api/v1/analytics/horizon?months=0` or `?months=25`
- **THEN** the system MUST respond with HTTP `400 Bad Request` and error code `VALIDATION`

---

### Requirement: Deterministic Roll-Forward Balance and Cashflow Accumulator

For each monthly period in the horizon board, the system MUST compute deterministic roll-forward projections by accumulating planned financial movements onto current account balances:

1. **Period Boundaries**:
   Each period SHALL cover exact UTC boundaries:
   - `periodKey`: `YYYY-MM`
   - `startDate`: `YYYY-MM-01T00:00:00.000Z`
   - `endDate`: `YYYY-MM-LastDayT23:59:59.999Z`

2. **Monthly Cashflow**:
   The system MUST compute:
   - `income`: Sum of all planned incomes scheduled within the period window.
   - `expense`: Sum of all planned expenses (including admin fees) scheduled within the period window.
   - `net`: `income - expense`.

3. **Point-in-Time Wallet Balances**:
   Starting from current actual wallet balances at Month 0, the system MUST simulate the end-of-month balance for each wallet by rolling forward planned transactions:
   $$\text{Balance}_{\text{end}} = \text{Balance}_{\text{start}} + \text{Inward Movements} - \text{Outward Movements}$$
   The resulting per-wallet balances at the end of Month $N$ SHALL serve as the starting balances for Month $N+1$.

4. **Net Worth Partitioning**:
   - `spendable`: Sum of projected balances for wallets with `walletIsLocked = 0`, converted to `baseCurrency`.
   - `locked`: Sum of projected balances for wallets with `walletIsLocked = 1`, converted to `baseCurrency`.
   - `total`: `spendable + locked`.

5. **Goal Milestone Projections**:
   For each active goal, the system MUST evaluate its projected progress at the end of each period:
   - If the goal has linked wallets, its projected balance SHALL equal the sum of those linked wallets' projected balances at that period's end.
   - The payload SHALL report `currentAmount`, `progressPercentage`, and `isReached: currentAmount >= targetAmount`.

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
