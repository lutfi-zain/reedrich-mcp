## MODIFIED Requirements

### Requirement: Financial Summary Endpoint

The system MUST expose `GET /api/v1/summary` that returns the same comprehensive financial summary currently available via the `financial_summary` MCP tool and the existing `GET /api/v1/summary` REST endpoint, extended with segregated liquidity metrics (`spendableCash`, `lockedCash`, `netSpendable`, `netLocked`) and Safe-to-Spend runway.

The endpoint SHALL accept optional query parameters: `startDate`, `endDate`, `baseCurrency`.

The response format SHALL be identical to the current REST endpoint response, with additive properties for liquidity breakdown.

#### Scenario: Summary with date range and base currency

- **WHEN** `GET /api/v1/summary?startDate=2026-09-01&endDate=2026-09-30&baseCurrency=USD` is called
- **THEN** the response SHALL include `consolidatedNetWorth` with `baseCurrency: "USD"`, exchange rate conversion, and all summary fields
- **THEN** the response SHALL additively include `spendableCash`, `lockedCash`, `netSpendable`, `netLocked`, `safeToSpend`, and `dailySafeToSpend`

#### Scenario: Summary decomposes netSavings into netSpendable and netLocked across transfers

- **GIVEN** an authenticated user with an unlocked wallet receiving `15000000` IDR income, spending `5000000` IDR, and transferring `6000000` IDR to a locked wallet
- **WHEN** `GET /api/v1/summary` or `financial_summary` is called
- **THEN** `netSavings` SHALL equal `10000000`, `netSpendable` SHALL equal `4000000`, and `netLocked` SHALL equal `6000000`
