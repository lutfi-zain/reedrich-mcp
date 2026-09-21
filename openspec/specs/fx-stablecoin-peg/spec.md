## Purpose

Defines the behavioral contract for normalizing USD-pegged stablecoin balances to USD before fiat conversion, so crypto-pocket wallets convert with live fiat rates instead of stale hardcoded fallbacks.

## Requirements

### Requirement: Stablecoin Peg Normalization Before Conversion

The system MUST normalize the currency codes `USDT`, `USDC`, and `DAI` to `USD` before performing any currency conversion. Converted amounts derived via this normalization SHALL carry a `usedPeg: true` marker in per-wallet breakdowns and summary payloads where currency conversion metadata is exposed.

#### Scenario: USDT wallet converts with live USD rate

- **GIVEN** a wallet holding 1000 USDT and a live USD→IDR rate of 17800
- **WHEN** the balance is converted to IDR
- **THEN** the result SHALL be 17800000 and the breakdown entry SHALL include `usedPeg: true`

#### Scenario: Non-pegged currencies convert without peg marker

- **GIVEN** a wallet holding 100 USD converted to IDR
- **WHEN** the balance is converted to IDR
- **THEN** the result SHALL use the live USD→IDR rate and the breakdown entry SHALL include `usedPeg: false`

#### Scenario: Peg normalization is case-insensitive

- **GIVEN** a wallet with currency code `"usdt"` in lowercase
- **WHEN** the balance is converted to IDR
- **THEN** the system SHALL treat it identically to `"USDT"` and apply the peg normalization

---

### Requirement: Unchanged Provider Chain and Offline Fallback

The system MUST keep the existing FX provider chain, 3-second timeout, and `FALLBACK_RATES_USD_BASE` offline fallback behavior unchanged. Peg normalization SHALL apply equally to live and fallback rates.

#### Scenario: Offline fallback still converts pegged currencies

- **GIVEN** the FX provider is unreachable and the system falls back to `FALLBACK_RATES_USD_BASE`
- **WHEN** a 500 USDT balance is converted to IDR
- **THEN** the result SHALL equal 500 × fallback USD→IDR rate with `usedPeg: true`
