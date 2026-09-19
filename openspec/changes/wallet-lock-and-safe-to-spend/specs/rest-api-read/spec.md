## MODIFIED Requirements

### Requirement: Read-Only Wallet Listing

The system MUST expose `GET /api/v1/wallets` that returns all wallets for the authenticated user.

The endpoint SHALL require a valid `Authorization: Bearer <token>` header or `X-API-Key` header. It SHALL respond with HTTP `200` and a JSON array of wallet objects. It SHALL respond with HTTP `401` if no valid credential is provided.

#### Scenario: Authenticated user retrieves wallets

- **GIVEN** an authenticated user with 3 wallets
- **WHEN** `GET /api/v1/wallets` is called with a valid Bearer token
- **THEN** the response SHALL be HTTP `200` with a JSON array of 3 wallet objects
- **THEN** each wallet object SHALL contain `walletId`, `walletName`, `walletInstitution`, `walletType`, `walletBalance`, `walletCurrency`, `walletCreatedAt`, and `walletIsLocked` (integer `0` or `1`)

#### Scenario: Unauthenticated request is rejected

- **WHEN** `GET /api/v1/wallets` is called without any authentication header
- **THEN** the response SHALL be HTTP `401` with `{ "error": "UNAUTHORIZED", "message": "Authentication required" }`

---

### Requirement: Financial Summary Endpoint

The system MUST expose `GET /api/v1/summary` that returns the same comprehensive financial summary currently available via the `financial_summary` MCP tool and the existing `GET /api/v1/summary` REST endpoint, extended with segregated liquidity metrics and Safe-to-Spend runway.

The endpoint SHALL accept optional query parameters: `startDate`, `endDate`, `baseCurrency`.

The response format SHALL be identical to the current REST endpoint response, with additive properties for liquidity breakdown.

#### Scenario: Summary with date range and base currency

- **WHEN** `GET /api/v1/summary?startDate=2026-09-01&endDate=2026-09-30&baseCurrency=USD` is called
- **THEN** the response SHALL include `consolidatedNetWorth` with `baseCurrency: "USD"`, exchange rate conversion, and all summary fields
- **THEN** the response SHALL additively include `spendableCash`, `lockedCash`, `safeToSpend`, and `dailySafeToSpend`
