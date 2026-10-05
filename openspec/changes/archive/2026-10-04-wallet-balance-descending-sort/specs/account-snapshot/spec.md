## MODIFIED Requirements

### Requirement: Partitioned Wallet Balances and Transaction Metadata

The snapshot payload MUST group user wallets into `spendable` (unlocked) and `locked` (protected reserves) categories, with consolidated sub-totals and an embedded `lastTransaction` object on each wallet record.

Within both `wallets.spendable.items` and `wallets.locked.items`, wallet records MUST be sorted in descending order by their balance converted to `baseCurrency`, with raw `balance` descending and `walletId` ascending as deterministic tie-breakers.

#### Scenario: Spendable and locked wallets partition with mutation metadata
- **GIVEN** an authenticated user with an unlocked bank wallet (balance Rp 5.000.000) and a locked investment wallet (balance Rp 20.000.000)
- **WHEN** the user queries `get_account_detail`
- **THEN** `wallets.spendable.total` SHALL be `5000000`
- **THEN** `wallets.locked.total` SHALL be `20000000`
- **THEN** each wallet in both groups SHALL include its respective `lastTransaction` object or `null` if no transactions exist

#### Scenario: Spendable and locked wallet items are ordered by converted balance descending
- **GIVEN** an authenticated user with three unlocked wallets: Wallet A (`1000000` IDR), Wallet B (`25000000` IDR), and Wallet C (`500` USD, equivalent to `> 7500000` IDR)
- **WHEN** the user queries `GET /api/v1/account-detail?baseCurrency=IDR` or invokes `get_account_detail`
- **THEN** `wallets.spendable.items` MUST be ordered as `[Wallet B, Wallet C, Wallet A]`
