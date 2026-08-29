## Purpose
Provides unified net worth consolidation across multi-currency assets using dynamic real-time exchange rates with resilient edge fallback baselines.

## ADDED Requirements

### Requirement: Currency Exchange Rate Resolution
The system SHALL convert asset amounts across supported fiat currencies into a unified base currency using real-time rates with a deterministic edge fallback baseline.

#### Scenario: Real-time FX rate retrieval succeeds
- **GIVEN** a request to calculate consolidated net worth with base currency "IDR"
- **WHEN** the real-time exchange rate endpoint returns active market quotes for USD, EUR, SGD, JPY, and GBP
- **THEN** the system SHALL convert all wallet balances, debts, and loans into IDR using the retrieved exchange rates and report the consolidated total along with exchange rate metadata.

#### Scenario: Real-time FX rate API fails or times out
- **GIVEN** the external exchange rate provider is unreachable or times out beyond 3 seconds
- **WHEN** the system calculates consolidated net worth
- **THEN** the system SHALL seamlessly fallback to the built-in edge baseline rates, complete the calculation without throwing runtime errors, and indicate fallback status in the summary metadata.

### Requirement: Base Currency Auto-Detection & Selection
The system SHALL auto-detect the user's primary currency based on wallet distribution or accept an explicit base currency override parameter.

#### Scenario: User provides explicit base currency override
- **GIVEN** a user holding wallets in IDR and USD
- **WHEN** the user invokes `financial_summary` with `base_currency: "USD"`
- **THEN** the system SHALL output total consolidated net worth, total income, and total expense converted to USD.

#### Scenario: Auto-detection of base currency
- **GIVEN** a user holding 3 IDR wallets and 1 USD wallet, without specifying `base_currency`
- **WHEN** the user invokes `financial_summary`
- **THEN** the system SHALL select "IDR" as the default base currency based on wallet frequency/asset dominance and consolidate all totals into IDR.
