## Why

Currently, `GET /api/v1/wallets` and MCP tool `manage_wallet(action: 'list')` only expose the current live counter balance (`wallet_balance`), lacking point-in-time historical reconstruction, date-range filtering, and status partitioning (`realized`, `planned`, `all`). Simultaneously, `GET /api/v1/analytics/horizon` and MCP tool `get_horizon_projections` are locked into rigid calendar months (`YYYY-MM`), preventing non-calendar payday cycles (e.g. the 25th-to-24th pay period) or arbitrary timeline intervals. Furthermore, newly created wallets with non-zero starting balances currently bypass the transaction log, creating "ghost balances" without an opening transaction.

This change unifies financial ledger evaluation under a shared core equation: **Wallet List evaluates a single period slice, while Horizon evaluates multi-period chained intervals**. It introduces date range and status filters with an opt-in `snapshot` object to wallet listings, revamps Horizon periods to accept flexible 2D date interval arrays (`[[startDate, endDate]]`), and enforces the Zero Ghost Transaction invariant by guaranteeing every wallet's balance is backed by an opening transaction.

## What Changes

- **Zero Ghost Transaction Invariant**:
  - `createWallet` (`src/services/wallet.ts`) MUST automatically insert a realized opening balance transaction (`isPlanned: 0`, type: `income`, reserved category: `Opening Balance` or `Adjustment`) when initialized with `balance > 0`.
  - Add a one-time data reconciliation / backfill utility ensuring all pre-existing wallets without opening transactions have their starting balances auditable in the ledger.

- **Wallet List Date Range & Status Filtering (`src/services/wallet.ts`, `src/routes/wallets.ts`, `src/mcp.ts`)**:
  - `GET /api/v1/wallets` and `manage_wallet(action: 'list')` accept optional query parameters:
    * `startDate`: Start boundary timestamp (defaults to start of current calendar month if `endDate` is provided without `startDate`).
    * `endDate`: End boundary timestamp (defaults to end of current calendar month if `startDate` is provided without `endDate`).
    * `filter`: Status filter with values `realized` (default for historical reconciliation), `planned` (pure budget/plan delta), or `all` (baseline anchoring: live realized balance rolled forward with planned roadmap).
  - When date parameters are provided, each returned wallet object includes a structured `snapshot` object:
    * `period`: `{ startDate, endDate }`
    * `filter`: `realized` | `planned` | `all`
    * `initialBalance`: Balance at `startDate`
    * `totalIn`: Inflows during the period (incomes + incoming transfers)
    * `totalOut`: Outflows during the period (expenses + outgoing transfers + fees)
    * `periodDelta`: Net cashflow delta (`totalIn - totalOut`)
    * `totalBalance`: Ending balance at `endDate` (`initialBalance + periodDelta`)
  - When no date parameters are provided, the response maintains 100% backward compatibility, returning current `walletBalance` and `lastTransaction`.

- **Multi-Period Horizon Board Revamp (`src/services/horizon.ts`, `src/routes/horizon.ts`, `src/mcp.ts`)**:
  - Revamp `periods` parameter to support a 2D array of date strings: `[[startDate, endDate], ...]` (via JSON payload, query parameter, or MCP arguments).
  - Backward compatibility: Retain support for legacy comma-separated `YYYY-MM` strings and `months` count (defaulting to 6 consecutive calendar months if omitted).
  - For each period in the 2D array, calculate roll-forward `initialBalance`, period cashflows, `endingBalance`, spendable vs locked net worth trajectory, and linked goal milestones.
  - Connect Horizon to the unified ledger math engine, chaining `endingBalance` of period $N$ directly into `initialBalance` of period $N+1$.

- **Documentation & OpenAPI**:
  - Update `src/docs/openapi.ts` with new query parameters on `GET /api/v1/wallets` and the revised 2D array period schema on `GET /api/v1/analytics/horizon`.
  - Update `src/docs/llms.ts` and `README.md` to document single-period wallet snapshots and 2D interval horizon boards.

## Capabilities

### New Capabilities
- `wallet-snapshots`: Behavioral specifications for point-in-time and period balance calculations, `snapshot` response payload on wallet listings, zero-ghost transaction creation on new wallets, and historical ledger reconstruction.

### Modified Capabilities
- `multi-period-horizon`: Modifies `specs/multi-period-horizon/spec.md` to support flexible 2D date intervals (`[[startDate, endDate]]`), chaining from unified ledger snapshots, and arbitrary period projections (e.g. payday cycles).

## Non-Goals

- Deprecating or breaking existing `GET /api/v1/wallets` calls without query parameters (current balance contract is strictly preserved).
- Removing the legacy `months` integer or `YYYY-MM` string parameters from Horizon (both are retained with automatic normalization to 2D date intervals).
- Building frontend visualization charts or datepicker UI components.
- Modifying transaction categorization or budget limits calculation rules.

## Impact & Constraints

- **Multi-Tenant RLS**: All queries for transaction aggregation and wallet filtering strictly enforce `eq(schema.<table>.<table>UserId, userId)`.
- **Zero-Remote-Deletion Invariant**: All migrations and backfill routines are strictly additive (`INSERT INTO transactions`), preserving all remote PostgreSQL data without drops or truncations.
- **Edge Runtime Performance**: Wallet snapshot queries use efficient single-pass PostgreSQL aggregation (`SUM(CASE WHEN ...)` with index on `(user_id, date)`) avoiding in-memory transaction loops.
- **Backward Compatibility**: Fully backward compatible for all existing MCP tools, REST endpoints, and automated tests.
