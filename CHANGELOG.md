# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/): `Added`, `Changed`,
`Deprecated`, `Removed`, `Fixed`, `Security` sections per release.

## [Unreleased]

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
