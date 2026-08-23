# ChatGPT Actions & REST API Specification

## Purpose

The ChatGPT Actions capability provides standard REST HTTP endpoints, an automated OpenAPI 3.0 specification manifest, and public legal compliance documents enabling ChatGPT Custom GPTs to interact with the Reedrich financial engine without developer mode.

## Requirements

### Requirement: REST API v1 Operations
The server SHALL expose authenticated REST HTTP endpoints under `/api/v1/*` corresponding to all core financial operations (wallets, transactions, transfers, categories, budgets, debts/loans, financial summary, and feedback submission). Each endpoint MUST authenticate requests via `Authorization: Bearer <jwt_or_api_key>` or `X-API-Key` headers and enforce user-level data isolation.

#### Scenario: Successfully fetching financial summary via REST
- **GIVEN** a valid Bearer JWT or API key for an authenticated user
- **WHEN** a client sends `GET /api/v1/summary`
- **THEN** the server returns HTTP 200 with JSON payload containing `netWorth`, `liquidBalance`, `totalSavings`, `adminFees`, `categoryBreakdown`, `totalDebt`, and `totalReceivable`

#### Scenario: Unauthenticated REST request rejected
- **WHEN** a client sends `GET /api/v1/wallets` without an Authorization header or with an invalid token
- **THEN** the server returns HTTP 401 with `{ "error": "Unauthorized" }`

#### Scenario: Recording an expense transaction via REST
- **GIVEN** an authenticated user with an existing wallet `w-123`
- **WHEN** a client sends `POST /api/v1/transactions` with payload `{ "type": "expense", "amount": 25000, "walletId": "w-123", "description": "Coffee" }`
- **THEN** the server records the transaction, updates wallet balance atomically, and returns HTTP 201 with transaction details

---

### Requirement: OpenAPI 3.0 Specification Endpoint
The server SHALL expose an unauthenticated `GET /openapi.json` endpoint returning a valid OpenAPI 3.0.0 JSON schema. The schema MUST accurately describe all `/api/v1/*` endpoints, JSON request bodies, path and query parameters, error responses, and the `bearerAuth` security scheme.

#### Scenario: Fetching OpenAPI schema
- **WHEN** an external client or ChatGPT Action builder sends `GET /openapi.json`
- **THEN** the server returns HTTP 200 with `Content-Type: application/json` containing valid OpenAPI 3.0 schema with `openapi: "3.0.0"`, `paths`, and `components.securitySchemes.bearerAuth`

---

### Requirement: Public Privacy Policy Compliance
The server SHALL serve an unauthenticated `GET /privacy` endpoint returning a clean HTML document describing user data handling, encryption, and isolation practices to satisfy GPT Store publication requirements.

#### Scenario: Accessing Privacy Policy
- **WHEN** a browser or reviewer accesses `GET /privacy`
- **THEN** the server returns HTTP 200 with `Content-Type: text/html` explaining data retention, zero third-party sharing, and encryption standards
