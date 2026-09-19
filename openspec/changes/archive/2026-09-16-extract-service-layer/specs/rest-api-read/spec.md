## Purpose

Defines the behavior contract for read-only REST API endpoints that expose financial data to web app consumers. These endpoints provide proper HTTP semantics (status codes, pagination, filtering) while delegating all business logic to the shared service layer.

## ADDED Requirements

### Requirement: Read-Only Wallet Listing

The system MUST expose `GET /api/v1/wallets` that returns all wallets for the authenticated user.

The endpoint SHALL require a valid `Authorization: Bearer <token>` header. It SHALL respond with HTTP `200` and a JSON array of wallet objects. It SHALL respond with HTTP `401` if no valid credential is provided.

#### Scenario: Authenticated user retrieves wallets

- **GIVEN** an authenticated user with 3 wallets
- **WHEN** `GET /api/v1/wallets` is called with a valid Bearer token
- **THEN** the response SHALL be HTTP `200` with a JSON array of 3 wallet objects
- **THEN** each wallet object SHALL contain `walletId`, `walletName`, `walletInstitution`, `walletType`, `walletBalance`, `walletCurrency`, `walletCreatedAt`

#### Scenario: Unauthenticated request is rejected

- **WHEN** `GET /api/v1/wallets` is called without any authentication header
- **THEN** the response SHALL be HTTP `401` with `{ "error": "UNAUTHORIZED", "message": "Authentication required" }`

### Requirement: Read-Only Transaction Listing with Filters

The system MUST expose `GET /api/v1/transactions` that returns transactions for the authenticated user with optional filtering and pagination.

Supported query parameters:
- `walletId` — filter by source wallet
- `categoryId` — filter by category
- `budgetId` — filter by budget
- `type` — filter by transaction type (`expense`, `income`, `transfer`)
- `startDate` — filter transactions on or after this ISO date
- `endDate` — filter transactions on or before this ISO date
- `limit` — maximum results (default 50, max 200)
- `offset` — pagination offset (default 0)

Results SHALL be ordered by `transactionDate` descending, then `transactionCreatedAt` descending.

#### Scenario: Filtered transaction listing

- **GIVEN** an authenticated user with expense and income transactions
- **WHEN** `GET /api/v1/transactions?type=expense&limit=10` is called
- **THEN** the response SHALL be HTTP `200` with at most 10 expense transaction objects
- **THEN** results SHALL be ordered by date descending

#### Scenario: Date range filtering

- **WHEN** `GET /api/v1/transactions?startDate=2026-09-01&endDate=2026-09-30` is called
- **THEN** the response SHALL include only transactions with dates within the specified range inclusive

#### Scenario: Invalid date parameter

- **WHEN** `GET /api/v1/transactions?startDate=not-a-date` is called
- **THEN** the response SHALL be HTTP `400` with error code `VALIDATION`

### Requirement: Read-Only Category Listing

The system MUST expose `GET /api/v1/categories` that returns all categories for the authenticated user.

#### Scenario: Authenticated user retrieves categories

- **GIVEN** an authenticated user with seeded default categories
- **WHEN** `GET /api/v1/categories` is called with a valid Bearer token
- **THEN** the response SHALL be HTTP `200` with a JSON array of category objects containing `categoryId`, `categoryName`, `categoryType`, `categoryIcon`, `categoryCreatedAt`

### Requirement: Read-Only Budget Listing with Utilization

The system MUST expose `GET /api/v1/budgets` that returns all budgets for the authenticated user with spending utilization calculated.

Each budget object SHALL include `spent`, `remaining`, and `percentUsed` fields computed from actual transactions within the budget period.

#### Scenario: Budget with spending utilization

- **GIVEN** an authenticated user with a budget of 1,000,000 IDR for "Makanan" category and 600,000 IDR spent
- **WHEN** `GET /api/v1/budgets` is called
- **THEN** the response SHALL include the budget with `spent: 600000`, `remaining: 400000`, `percentUsed: 60`

### Requirement: Read-Only Debts and Loans Listing

The system MUST expose `GET /api/v1/debts-loans` that returns all debts and loans for the authenticated user.

#### Scenario: User retrieves active debts and loans

- **GIVEN** an authenticated user with 2 debts and 1 loan
- **WHEN** `GET /api/v1/debts-loans` is called
- **THEN** the response SHALL be HTTP `200` with a JSON array of 3 debt/loan objects

### Requirement: Read-Only Goals Listing with Pacing

The system MUST expose `GET /api/v1/goals` that returns goals for the authenticated user with pacing information. An optional `status` query parameter SHALL filter by goal status (`in_progress`, `completed`, `cancelled`).

#### Scenario: Goals with pacing data

- **GIVEN** an authenticated user with an in-progress goal targeting 10,000,000 IDR with 3,000,000 IDR saved
- **WHEN** `GET /api/v1/goals` is called
- **THEN** the response SHALL include the goal with pacing data (progress percentage, estimated completion)

### Requirement: Read-Only Recurring Templates Listing

The system MUST expose `GET /api/v1/recurring-templates` that returns all recurring templates for the authenticated user.

#### Scenario: User retrieves recurring templates

- **WHEN** `GET /api/v1/recurring-templates` is called with a valid Bearer token
- **THEN** the response SHALL be HTTP `200` with a JSON array of recurring template objects

### Requirement: Financial Summary Endpoint

The system MUST expose `GET /api/v1/summary` that returns the same comprehensive financial summary currently available via the `financial_summary` MCP tool and the existing `GET /api/v1/summary` REST endpoint.

The endpoint SHALL accept optional query parameters: `startDate`, `endDate`, `baseCurrency`.

The response format SHALL be identical to the current REST endpoint response.

#### Scenario: Summary with date range and base currency

- **WHEN** `GET /api/v1/summary?startDate=2026-09-01&endDate=2026-09-30&baseCurrency=USD` is called
- **THEN** the response SHALL include `consolidatedNetWorth` with `baseCurrency: "USD"`, exchange rate conversion, and all summary fields

### Requirement: Consistent Authentication Across All REST Endpoints

All `GET /api/v1/*` endpoints MUST accept the same authentication methods: OAuth2 Bearer access tokens, legacy Reedrich JWT tokens, and persistent API keys (`rd_live_*` / `fp_live_*`). The credential SHALL be provided via the `Authorization: Bearer <token>` header or the `X-API-Key` header.

Query parameter authentication (`?apiKey`, `?token`) SHALL NOT be supported on REST endpoints — it is reserved for MCP/OAuth flows only.

#### Scenario: OAuth access token authenticates REST request

- **GIVEN** a valid OAuth2 access token obtained via PKCE flow
- **WHEN** `GET /api/v1/wallets` is called with `Authorization: Bearer <oauth-access-token>`
- **THEN** the request SHALL be authenticated and return the user's wallets

#### Scenario: API key authenticates REST request via X-API-Key header

- **GIVEN** a valid API key `rd_live_abc123`
- **WHEN** `GET /api/v1/wallets` is called with `X-API-Key: rd_live_abc123`
- **THEN** the request SHALL be authenticated and return the user's wallets
