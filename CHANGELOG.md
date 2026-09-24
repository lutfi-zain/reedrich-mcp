# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/): `Added`, `Changed`,
`Deprecated`, `Removed`, `Fixed`, `Security` sections per release.

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
