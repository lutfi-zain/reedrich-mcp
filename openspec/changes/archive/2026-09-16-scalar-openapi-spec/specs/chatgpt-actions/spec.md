## MODIFIED Requirements

### Requirement: OpenAPI 3.0.0 Manifest
The server SHALL serve an OpenAPI 3.0.0 compliant specification at `GET /openapi.json`.

The OpenAPI specification MUST:
- Specify OpenAPI version `3.0.0`.
- Provide info title `Reedrich Financial Intelligence API` and version `1.0.0`.
- Include dynamic server URL reflecting the current worker origin.
- Declare `bearerAuth` security scheme supporting 15-minute JWT tokens and persistent API keys (`rd_live_...` / `fp_live_...`).
- Include `x-oauth` extension detailing supported OAuth scopes (`financial:read`, `financial:write`, `financial:admin`).
- Set CORS headers (`Access-Control-Allow-Origin: *`) and public caching (`Cache-Control: public, max-age=3600`).
- Declare paths and operations for all active `/api/v1/*` REST endpoints:
  * `GET /api/v1/wallets` (tag: `Wallets`)
  * `GET /api/v1/categories` (tag: `Categories`)
  * `GET /api/v1/budgets` (tag: `Budgets`)
  * `GET /api/v1/transactions` with query filters and pagination (tag: `Transactions`)
  * `GET /api/v1/debts-loans` with status and type filters (tag: `Debts & Loans`)
  * `GET /api/v1/goals` and `POST /api/v1/goals` (tag: `Goals`)
  * `GET /api/v1/recurring-templates`, `POST /api/v1/recurring-templates`, and `POST /api/v1/recurring-templates/{templateId}/apply` (tag: `Recurring Templates`)
  * `GET /api/v1/summary` with date range and base currency filters (tag: `Analytics & Reporting`)
  * `POST /api/v1/feedback` (tag: `Feedback`)
- Declare complete JSON component schemas for all entity models and error responses (`Wallet`, `Category`, `Budget`, `Transaction`, `DebtLoan`, `Goal`, `RecurringTemplate`, `FinancialSummary`, `ErrorResponse`).

#### Scenario: Fetch OpenAPI manifest
- **WHEN** an HTTP `GET /openapi.json` request is received
- **THEN** the response status MUST be `200` with `Content-Type: application/json; charset=utf-8` and a valid OpenAPI 3.0.0 document.

#### Scenario: Fetch OpenAPI manifest with complete endpoint registry
- **WHEN** an HTTP `GET /openapi.json` request is received
- **THEN** the response status MUST be `200` with `Content-Type: application/json; charset=utf-8`
- **THEN** the JSON document SHALL include path entries for `/api/v1/wallets`, `/api/v1/categories`, `/api/v1/budgets`, `/api/v1/transactions`, `/api/v1/debts-loans`, `/api/v1/goals`, `/api/v1/recurring-templates`, `/api/v1/summary`, and `/api/v1/feedback`
- **THEN** all path operations SHALL specify appropriate tags, response codes, and security definitions
