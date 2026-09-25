# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/): `Added`, `Changed`,
`Deprecated`, `Removed`, `Fixed`, `Security` sections per release.

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
