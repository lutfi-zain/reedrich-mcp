## MODIFIED Requirements

### Requirement: Read-Only Wallet Listing

The system MUST expose `GET /api/v1/wallets` that returns all wallets for the authenticated user.
The endpoint SHALL require a valid `Authorization: Bearer <token>` header or `X-API-Key` header. It SHALL respond with HTTP `200` and a JSON array of wallet objects ordered by `walletBalance` descending, then `walletId` ascending. It SHALL respond with HTTP `401` if no valid credential is provided.

#### Scenario: Authenticated user retrieves wallets

- **GIVEN** an authenticated user with 3 wallets
- **WHEN** `GET /api/v1/wallets` is called with a valid Bearer token
- **THEN** the response SHALL be HTTP `200` with a JSON array of 3 wallet objects
- **THEN** each wallet object SHALL contain `walletId`, `walletName`, `walletInstitution`, `walletType`, `walletBalance`, `walletCurrency`, `walletCreatedAt`, and `walletIsLocked` (integer `0` or `1`)

#### Scenario: Wallets are returned sorted by walletBalance descending

- **GIVEN** an authenticated user with wallets having balances `2500000`, `50000000`, and `10000000`
- **WHEN** `GET /api/v1/wallets` is called (even after balance-mutating transactions update rows in the database)
- **THEN** the returned array MUST list the wallets in order `[50000000, 10000000, 2500000]`

#### Scenario: Unauthenticated request is rejected

- **WHEN** `GET /api/v1/wallets` is called without any authentication header
- **THEN** the response SHALL be HTTP `401` with `{ "error": "UNAUTHORIZED", "message": "Authentication required" }`
