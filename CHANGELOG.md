# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/): `Added`, `Changed`,
`Deprecated`, `Removed`, `Fixed`, `Security` sections per release.

## [Unreleased]

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
