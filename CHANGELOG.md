# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/): `Added`, `Changed`,
`Deprecated`, `Removed`, `Fixed`, `Security` sections per release.

## [1.18.0] — 2026-10-10

### Added
- **Self-Service API Key Rotation (`src/services/user.ts`, `src/routes/me.ts`, `src/mcp.ts`)**:
  - Implemented transport-agnostic `rotateUserApiKey()` to generate new `rd_live_...` persistent API keys with instant database hash invalidation of previous keys.
  - Added lockout prevention pre-flight guard requiring an active, valid registered email address on the account before allowing key rotation.
  - Guarded rotation requests with mandatory boolean confirmation (`confirm: true`) to prevent unintended execution by autonomous AI agents.
  - Exposed REST endpoints `POST /api/v1/me/api-key/rotate` and alias `POST /api/v1/user/profile/api-key/rotate`.
  - Added MCP tool `rotate_api_key`.
- **User Profile Email Updates & Parity (`src/services/user.ts`, `src/routes/me.ts`, `src/mcp.ts`)**:
  - Enabled self-service email updates on user profiles via `PATCH /api/v1/me` and alias.
  - Enforced lowercase normalization, RFC 5322 regex validation, and case-insensitive uniqueness checks returning HTTP 409 Conflict.
  - Added MCP tool `update_user_profile` providing 1:1 parity with REST profile update capabilities.

## [1.17.0] — 2026-10-02

### Added
- **Account Detail Budget Window Overlap Filtering (`src/services/account-snapshot.ts`)**:
  - Budgets in `get_account_detail` and `GET /api/v1/account-detail` are now filtered by temporal overlap against the requested snapshot window `[periodStart, periodEnd]`: $\text{budgetPeriodStart} \le \text{periodEnd} \land \text{budgetPeriodEnd} \ge \text{periodStart}$.
  - Automatically filters out expired budgets from prior months and unstarted budgets from future planning cycles from cluttering the current situational snapshot.
- **Active In-Progress Goals Filtering (`src/services/account-snapshot.ts`)**:
  - Goals in `get_account_detail` and `GET /api/v1/account-detail` are now filtered strictly to active in-progress milestones (`goalStatus = 'in_progress'`), excluding completed and cancelled goals from situational planning.

## [1.16.0] — 2026-10-01

### Added
- **Enriched Budget Schema & Pacing Engine (`src/utils/budgets.ts`, `src/services/budget.ts`, `src/services/account-snapshot.ts`)**:
  - Implemented pure budget metrics calculator `calculateBudgetMetrics` evaluating lifecycle and spending health status (`upcoming`, `on_track`, `warning`, `exceeded`, `completed`), `daysRemaining`, and `dailyAllowance`.
  - Added `periodStart`, `periodEnd`, `categoryId`, `status`, `daysRemaining`, and `dailyAllowance` to budget objects across `get_account_detail`, `GET /api/v1/account-detail`, `GET /api/v1/budgets`, and MCP tool `manage_budget(action: 'status')`.
  - Standardized budget spending calculations to evaluate transactions strictly within each budget's own `[budgetPeriodStart, budgetPeriodEnd]` window, inclusive of `transactionAdminFee`.
- **Enriched Goal Snapshot DTO (`src/services/account-snapshot.ts`)**:
  - Added `targetDate`, `currency`, `status`, `requiredMonthlySavings`, and `isReached` boolean to goal items in `get_account_detail`.
- **Enriched Obligations Snapshot DTO (`src/services/account-snapshot.ts`)**:
  - Added original principal `amount`, `type` (`debt` vs `loan`), `walletId`, and `notes` to `activeDebts` and `activeLoans` in `get_account_detail`.
- **Cashflow Accounting Hygiene**:
  - Aligned `monthlyCashFlow` in `get_account_detail` to properly account for `transactionAdminFee` across expenses, income, and transfers, and exclude initial balance transactions from operational income.
- **OpenAPI 3.0 Type Fidelity**:
  - Replaced generic `{ type: "object" }` in `AccountDetail` with fully typed schemas for `budgets`, `goals`, and `obligations` in `src/docs/openapi.ts`.

## [1.15.0] — 2026-10-01

### Added
- **Unified Ledger Timeline Engine (`src/utils/ledger.ts`)**:
  - Core mathematical engine unifying single-period wallet snapshots and multi-period horizon chains.
  - Baseline anchoring: Anchors at current live realized balance, rolls back realized transactions for past boundaries, and rolls forward planned roadmaps for future boundaries.
  - Supports `realized`, `planned`, and `all` status filter modes.
- **Wallet Point-in-Time & Date Range Snapshots**:
  - `GET /api/v1/wallets` and MCP tool `manage_wallet(action: 'list')` accept `startDate`, `endDate`, and `filter` (`realized` | `planned` | `all`, default `all`).
  - Returns structured `snapshot` object: `initialBalance`, `totalIn`, `totalOut`, `periodDelta`, and `totalBalance`.
  - Preserves 100% backward compatibility when date parameters are omitted (raw wallet objects without `snapshot`).
- **Flexible 2D Date Interval Horizon Boards**:
  - `GET /api/v1/analytics/horizon` and `POST /api/v1/analytics/horizon` accept 2D array intervals: `[[startDate, endDate], ...]`.
  - Enables custom non-calendar intervals such as monthly payday cycles (e.g. 25th-to-24th) and arbitrary planning sprints.
  - Chains period ending balances directly into subsequent period starting balances ($P_N.\text{start} = P_{N-1}.\text{end}$).
  - MCP tool `get_horizon_projections` updated with 2D array `periods` and `filter` arguments.
- **Zero Ghost Transaction Invariant & Opening Balance Backfill**:
  - `createWallet` automatically inserts an opening transaction (`isPlanned: 0`, `type: 'income'`, description `Initial balance: <walletName>`) whenever `balance > 0`.
  - Idempotent backfill utility `reconcileMissingOpeningBalances(db, userId)` detects and resolves legacy wallets missing transaction backing.

### Changed
- **Operational Income Hygiene in Financial Summary**:
  - `financial_summary` (`src/services/summary.ts`) now excludes `Adjustment` category transactions (initial balances and manual wallet delta adjustments) from `totalIncome` and `totalExpense` calculations, preventing distortion of earned income and savings rate metrics.
- **Wallet Latest Transaction Hygiene**:
  - `fetchLatestTransactionsByWallet` ignores opening balance transactions (`Initial balance%`), ensuring newly created wallets with balances report `lastTransaction: null` until the first real user transaction occurs.

### Breaking Changes & Behavioral Migrations
- **Opening Balance Transaction Creation**: Creating a wallet with `balance > 0` now creates an opening transaction row in `transactions`. Code or assertions expecting `transactions.length === 0` immediately following a non-zero balance wallet creation will now observe exactly 1 initial transaction.
- **Horizon Board Chained Accumulator**: Period roll-forward balances in Horizon now strictly chain from unified ledger snapshots at `period[0].startDate`, ensuring consistency between single-period wallet snapshots and multi-period projections.

## [1.14.0] — 2026-10-01

### Added
- **PostgreSQL 16 Persistence Migration via Cloudflare Hyperdrive**:
  - Migrated entire persistence layer from Cloudflare D1 (SQLite) to self-hosted PostgreSQL 16 on VPS via PgBouncer (`0.0.0.0:6432`) and Cloudflare Hyperdrive (`binding = "HYPERDRIVE"`, ID `246e815964a44eed9464752afe346134`).
  - Created dedicated `reedrich` production database and `reedrich_test` unit/E2E test database in PostgreSQL.
  - Refactored Drizzle ORM schema from `drizzle-orm/sqlite-core` to `drizzle-orm/pg-core` across all 10 domain entities (`users`, `wallets`, `categories`, `budgets`, `recurring_templates`, `transactions`, `debts_loans`, `feedbacks`, `goals`, `goal_wallets`).
  - Replaced `drizzle-orm/d1` with `drizzle-orm/postgres-js` and per-request `postgres` client instantiation (`max: 1`) to preserve Cloudflare Workers request socket lifecycle boundaries.
  - One-time ETL migration (`scripts/migrate-d1-to-pg.ts`) transferred all 3,469 records from remote D1 to PostgreSQL with 100% referential, foreign key, and balance parity. Zero remote D1 records deleted.
  - Modernized unit tests (`tests/mcp.test.ts`) and E2E integration test scripts (`scripts/run-local-integration.sh`, `scripts/run-integration.sh`) to run against PostgreSQL, eliminating mock SQLite dialect discrepancies.
  - Permanently eliminates Cloudflare D1's 5,000,000 scanned row reads/day limit (`code: 7500`) while preserving edge runtime execution and API contracts.

## [1.13.3] — 2026-09-30

### Added
- Client-Controlled Transaction Ordering:
  - `GET /api/v1/transactions` and MCP `list_transactions` accept `orderBy` (`date`|`amount`|`createdAt`|`description`, default `date`) and `direction` (`asc`|`desc`, default `desc`).
  - Deterministic `transactionCreatedAt DESC` tiebreaker keeps `limit`/`offset` pagination stable; invalid values rejected with `VALIDATION` (HTTP 400).

## [1.13.2] — 2026-09-30

### Changed
- Recurring Materialization Descriptions:
  - `src/services/recurring.ts` now stores the plain template name as `transactionDescription` at all three insert sites (create materialization, update propagation, apply fallback insert).
  - Template linkage remains structural via `transactionTemplateId` and `transactionOccurrenceDate`; no `[Recurring]` display prefix is written.

## [1.13.1] — 2026-09-30

### Fixed
- Wallet-Inclusive Transfer Filtering:
  - `GET /api/v1/transactions?walletId=<id>` and MCP `list_transactions` now match transfers where the wallet is the destination (`transactionTargetWalletId`), not only the source (`transactionWalletId`).
  - Directed flow preserved: `walletId` + `targetWalletId` narrows to flows from source to destination; `targetWalletId` alone remains destination-only.
  - Multi-wallet union lists cross-wallet transfers exactly once in items and pagination totals.

## [1.13.0] — 2026-09-30

### Added
- Enhanced Transaction Query Engine & Pagination Metadata:
  - **Universal Pagination Headers**: `GET /api/v1/transactions` returns `X-Total-Count`, `X-Limit`, `X-Offset`, and `X-Has-Next-Page` on all requests.
  - **Opt-in Envelope Response**: Supports `?envelope=true` returning `{ items: [...], pagination: { total, limit, offset, hasNext, totalPages } }`, preserving raw array by default.
  - **Keyword Text Search**: Added `?q=` and `?search=` for case-insensitive filtering across transaction descriptions via SQL `LOWER(description) LIKE '%q%'`.
  - **Multi-Value Filtering**: `walletId`, `targetWalletId`, `categoryId`, and `budgetId` support comma-separated UUIDs and arrays via SQL `IN (?, ?, ...)`.
  - **Status Filter Aliases**: Added `status=realized|planned|all` as client-friendly aliases for `isPlanned`.
  - **MCP `list_transactions`**: Emits envelope format and supports all enhanced query filters.
- Multi-Period Horizon Board Projections:
  - **REST Endpoint**: Added `GET /api/v1/analytics/horizon` (and alias `/horizon`) simulating forward-looking financial roadmaps across 1 to 24 future calendar months.
  - **Single-Pass Edge Fetch**: Reads wallets, goals, planned transactions, and exchange rates in a single atomic pass on Cloudflare D1.
  - **Roll-Forward Accumulator**: Calculates month-by-month cashflow, point-in-time wallet balance accumulation, spendable vs locked net worth trajectory, and derived goal milestones.
  - **MCP Tool**: Added `get_horizon_projections` tool in MCP registry and execution handler.
  - **Documentation**: Updated OpenAPI 3.0 specification (`src/docs/openapi.ts`), LLM manifest (`src/docs/llms.ts`), and `README.md` (19 MCP tools).

## [1.12.0] — 2026-09-30

### Changed
- Contract & Documentation Hygiene:
  - **Dead Route Removal**: Removed inoperative `POST /api/v1/goals/:goalId/contribute` route from `src/routes/goals.ts` and OpenAPI specification (`src/docs/openapi.ts`). Endpoint now consistently returns HTTP 404 Not Found.
  - **OpenAPI Schema Alignment**: Corrected `adjustWalletBalance` property to `default: true` on `POST /api/v1/debts-loans` and `POST /api/v1/debts-loans/{id}/repay` in `src/docs/openapi.ts`, matching service implementation.
  - **Alias Route Documentation**: Documented `PATCH /api/v1/user/profile` alias in OpenAPI alongside `/api/v1/me`.
  - **LLM Manifest Updates**: Added `GET /api/v1/account-detail` documentation under Analytics & Summary in `src/docs/llms.ts`. Corrected `manage_recurring_template` actions to `(create, list, update, delete)` and documented `apply_recurring_template` as an autonomous top-level tool.
  - **README Updates**: Updated MCP tool count to 18 tools, listed all registered tools, and removed obsolete `contributeGoal` reference from architecture tree.

## [1.11.0] — 2026-09-30

### Added
- In-Place Transaction Type Mutation (`expense` ↔ `income` ↔ `transfer`):
  - **Service Layer**: Extended `UpdateTransactionParams` with optional `type?: unknown` in `src/services/transaction.ts`. Added validation restricting types to `'expense' | 'income' | 'transfer'`.
  - **Target Wallet Invariants**: Enforces `targetWalletId` as mandatory when switching to `'transfer'` (and asserts `targetWalletId !== walletId`), while rejecting and nullifying `targetWalletId` for `'expense'` and `'income'`.
  - **Budget Auto-Unlinking**: Automatically unlinks `transactionBudgetId: null` when an expense transaction is mutated to income or transfer.
  - **Two-Phase Atomic Balance Reconciliation**: Reverses original transaction balance using `existingTx.transactionType` with multiplier `-1` (Phase 1), then applies new transaction balance using `newType` with multiplier `+1` (Phase 2), with guards preserving planned transaction balances.
  - **MCP Tool**: Updated `update_transaction` tool schema in `src/mcp.ts` with `type` property (`expense`, `income`, `transfer`).
  - **REST API**: Documented `type` parameter for `PATCH /api/v1/transactions/{transactionId}` in OpenAPI (`src/docs/openapi.ts`) and LLM manifest (`src/docs/llms.ts`).
  - **Tests**: Added full unit test suite in `tests/mcp.test.ts` (all 6 state transitions, validation errors, planned transactions, budget unlinking) and E2E assertions in `tests/integration.test.ts`.

## [1.10.0] — 2026-09-28

### Added
- Comprehensive CRUD Lifecycle & Entity Parity:
  - **Single-Resource Retrieval (`GET /:id`)**: Implemented direct item lookup across all 7 domain resources (`GET /api/v1/wallets/:id`, `GET /api/v1/categories/:id`, `GET /api/v1/budgets/:id`, `GET /api/v1/transactions/:id`, `GET /api/v1/debts-loans/:id`, `GET /api/v1/goals/:id`, `GET /api/v1/recurring-templates/:id`).
  - **Entity Mutation (`PATCH`)**:
    * `PATCH /api/v1/categories/:id` & `manage_category(action: "update")` to update category name and icon (with system Adjustment category protection).
    * `PATCH /api/v1/budgets/:id` & `manage_budget(action: "update")` to update budget amount, period dates, name, or category with live utilization recalculation.
    * `PATCH /api/v1/me` to update authenticated user's first name, last name, or WhatsApp contact number.
  - **Entity Deletion (`DELETE`) & Financial Integrity Guards**:
    * `DELETE /api/v1/wallets/:id` & `manage_wallet(action: "delete")`: Protected by balance zero-guard (`walletBalance == 0`) and active link guards (rejects deletion if linked to in-progress goals or active recurring templates).
    * `DELETE /api/v1/categories/:id` & `manage_category(action: "delete")`: Protected system category guard (cannot delete internal "Adjustment" category; existing transactions/budgets retain history with category set to null).
    * `DELETE /api/v1/budgets/:id` & `manage_budget(action: "delete")`: Deletes budget definitions cleanly without transaction data loss.
    * `DELETE /api/v1/debts-loans/:id` & `manage_debt_loan(action: "delete")`: Deletes liability or receivable records.
  - **Documentation**: Documented all 14 new endpoints in OpenAPI specification (`src/docs/openapi.ts`), updated LLM manifest (`src/docs/llms.ts`), and updated `README.md`.
  - **Tests**: Added full unit test suite `Comprehensive CRUD Lifecycle Parity Suite` in `tests/mcp.test.ts` and E2E assertions in `tests/integration.test.ts`.

## [1.9.0] — 2026-09-25

### Added
- Transaction Deletion with Atomic Balance Reversal:
  - **Service**: Added `deleteTransaction(db, userId, transactionId)` in `src/services/transaction.ts` with multi-tenant row-level verification (`eq(transactionUserId, userId)`) and atomic balance reversal via `applyBalanceDelta(..., -1)` for realized transactions (expenses refunded, income debited, transfers restored). Planned transactions are removed without balance mutation.
  - **REST Route**: `DELETE /api/v1/transactions/:transactionId` returning HTTP `200 OK` with confirmation message.
  - **MCP Tool**: Added `delete_transaction` in `src/mcp.ts` tool registry and execution handler with required `transactionId` parameter.
  - **OpenAPI**: Documented `delete` operation on `/api/v1/transactions/{transactionId}` in `src/docs/openapi.ts`.
  - **LLM Manifest**: Updated `src/docs/llms.ts` with transaction delete route and tool reference.
  - **Tests**: Added full unit test suite `Delete Transaction & Balance Reversal Parity` in `tests/mcp.test.ts` and E2E verification in `tests/integration.test.ts`.

## [1.8.0] — 2026-09-25

### Added
- Authenticated User Profile & Identity endpoints:
  - **REST API**: `GET /api/v1/me` (and semantic alias `GET /api/v1/user/profile`) returns sanitized user profile (`userId`, `firstName`, `lastName`, `fullName`, `email`, `whatsappNumber`, `createdAt`) while strictly omitting `userApiKeyHash`.
  - **MCP Tool**: `get_user_profile` allows AI agents to inspect the active authenticated user's profile with zero required arguments.
  - **MCP Resource**: `reedrich://user/profile` exposes readable user profile data.
  - **OpenAPI**: Documented `/api/v1/me` and `/api/v1/user/profile` under new `User Profile` tag with `UserProfile` schema.
  - **LLM Manifest**: Updated `src/docs/llms.ts` with User Profile section and tools/resources reference.

## [1.7.0] — 2026-09-25

### Added
- Complete 1:1 REST API parity with MCP tool write operations:
  - **Wallets**: `POST /api/v1/wallets` (create wallet) and `PATCH /api/v1/wallets/:walletId` (update wallet).
  - **Categories**: `POST /api/v1/categories` (create custom category) and `POST /api/v1/categories/seed` (seed standard default categories).
  - **Budgets**: `POST /api/v1/budgets` (create budget limit for category and date range).
  - **Transactions**: `POST /api/v1/transactions` (record expense/income with atomic wallet balance updates) and `PATCH /api/v1/transactions/:transactionId` (update transaction and reconcile balance delta). Accepts both `date` and `transactionDate`.
  - **Transfers**: `POST /api/v1/transfers` (dedicated endpoint to atomically debit source wallet and credit target wallet with optional fee).
  - **Debts & Loans**: `POST /api/v1/debts-loans` (create liability/receivable), `POST /api/v1/debts-loans/:debtLoanId/repay` (record partial/full repayment), and `PATCH /api/v1/debts-loans/:debtLoanId` (update record).
  - **Goals**: `PATCH /api/v1/goals/:goalId` (update goal), `DELETE /api/v1/goals/:goalId` (delete goal), `POST /api/v1/goals/:goalId/contribute` (returns validation error guiding callers to linked wallets), `POST /api/v1/goals/:goalId/wallets` (link dedicated wallet), and `DELETE /api/v1/goals/:goalId/wallets/:walletId` (unlink wallet).
  - **Recurring Templates**: `PATCH /api/v1/recurring-templates/:templateId` (update template) and `DELETE /api/v1/recurring-templates/:templateId` (delete template).
- Added `Transfers` tag and all 14 new write endpoints to OpenAPI specification (`src/docs/openapi.ts`).
- Updated REST API directory in LLM manifest (`src/docs/llms.ts`).
- Added `Step 34` E2E user journey to `tests/integration.test.ts` covering all REST write operations.

## [1.6.0] — 2026-09-24

### Added
- Direct Google OAuth 2.0 Identity Federation bypass: `GET /oauth/authorize` accepts `provider=google` (and alias `idp=google`) to trigger an immediate `302 Found` redirect directly to Google Sign-In with signed state JWT, bypassing the intermediate HTML consent UI for zero-click login from Claude Web/Desktop, ChatGPT Actions, and frontend apps.
- Unsupported identity providers (e.g. `provider=github`) return a clean HTTP 400 Bad Request with `invalid_request`.
- Documented `OAuth 2.0 PKCE` tag and `/oauth/authorize` path in `src/docs/openapi.ts` and `src/docs/llms.ts`.

## [1.5.0] — 2026-09-24

### Added
- Comprehensive Account Snapshot tool `get_account_detail` and REST route `GET /api/v1/account-detail`:
  delivers an atomic, single-payload snapshot consolidating multi-currency net worth (live FX),
  partitioned spendable vs locked cash reserves, monthly cashflows with category breakdown,
  active budgets with spent/remaining tracking, active goals with derived balances and pacing,
  and active debt/loan obligations.
- Wallet mutation metadata (`lastTransaction`): `listWallets` and `manage_wallet(action: "list")`
  now return the latest realized non-planned mutation out-of-the-box (date, type, transfer direction
  `in`/`out`, amount, description, category).
- Single-roundtrip SQLite CTE window function: `ROW_NUMBER() OVER (PARTITION BY wallet_id ORDER BY transaction_date DESC)`
  unpivots source and destination wallets to batch-resolve mutations for all user wallets in one query (< 50ms).

## [1.4.0] — 2026-09-22

### Added
- Recurring planned materialization (migration `drizzle/0008_recurring_linkage.sql`):
  templates print bounded `isPlanned=1` rows at create (max 100, `endDate`-truncated)
  with `template_id` / `occurrence_date` linkage; `apply_recurring_template` realizes
  by flipping one row (`1→0`, `realizedAt` stamp, optional `actualAmount` override with
  variance record); template update accepts `propagateScope` (`future_only` default /
  `cancel`) rewriting future unrealized rows only; deactivate/delete preserves overdue
  + realized rows. New reserved `Adjustment` system category for ledger-complete balance
  corrections.

### Changed
- `financial_summary`: virtual recurring projection removed from the Safe-to-Spend
  deduction (display-only, flagged `recurringProjectionInformationalOnly`); stored planned
  rows are the sole obligation source. `manage_wallet update(balance)` now prints one
  income/expense adjustment transaction instead of silently overwriting (zero delta = no-op).

## [1.3.0] — 2026-09-21

### Added
- Goal↔wallet many-to-many links (`goal_wallets` junction table, migration
  `drizzle/0007_goal_wallet_links.sql`): `manage_goal` gains `link_wallet` /
  `unlink_wallet` actions and accepts `walletIds` on `create`.
- Derived goal progress: linked goals report `currentAmount` as the live sum of
  linked wallet balances (converted to goal currency) with per-wallet
  `linkedWallets[]` breakdown and `isDerived: true`. Unlinked goals keep the
  stored-counter behavior with `isDerived: false`.
- FX stablecoin peg: `USDT` / `USDC` / `DAI` normalize 1:1 to `USD` before
  conversion (case-insensitive), with `usedPeg` marking on converted entries.

### Removed — **BREAKING**
- `manage_goal` action `contribute` is removed. Calls now fail with a
  `VALIDATION` error directing users to the new flow.
- **Migration path (manual):** for each goal, link its funding wallets via
  `manage_goal(action: "link_wallet", goalId, walletId)` (repeat per wallet),
  then discard hand-maintained counter values — progress is derived from live
  balances on every read. Record top-ups with `record_transaction` or
  `transfer_funds` against the linked wallets; no explicit goal update is needed.
