## Purpose

Defines the behavioral contract for the shared service layer: typed error handling, service function signatures, transport-agnostic business logic, and unified authentication resolution. Ensures both MCP tools and REST routes produce identical results for identical inputs.

## Requirements

### Requirement: Typed Service Error Codes

The system MUST define a finite set of error codes that service functions use to signal error conditions. Each error code MUST map deterministically to an HTTP status code for REST and an error content type for MCP.

The error codes SHALL be:
- `VALIDATION` — invalid input, missing required field, or constraint violation
- `NOT_FOUND` — requested entity does not exist or is not owned by the authenticated user
- `UNAUTHORIZED` — no valid authentication credential provided
- `FORBIDDEN` — authenticated user is not permitted to perform the requested action
- `CONFLICT` — operation conflicts with current state (e.g. duplicate unique value)
- `INTERNAL` — unexpected system error

#### Scenario: Service function throws VALIDATION error for invalid wallet name

- **WHEN** a service function receives `name` as an empty string
- **THEN** it SHALL throw an error with code `VALIDATION` and a message describing the constraint

#### Scenario: Service function throws NOT_FOUND for missing entity

- **WHEN** a service function queries for a wallet by ID and no wallet with that ID exists for the authenticated user
- **THEN** it SHALL throw an error with code `NOT_FOUND`

#### Scenario: REST adapter maps error code to HTTP status

- **GIVEN** a service function throws an error with code `VALIDATION`
- **WHEN** the REST transport adapter catches the error
- **THEN** it SHALL respond with HTTP status `400` and a JSON body containing `{ "error": "VALIDATION", "message": "<error message>" }`

#### Scenario: MCP adapter maps error to MCP content

- **GIVEN** a service function throws an error with code `NOT_FOUND`
- **WHEN** the MCP transport adapter catches the error
- **THEN** it SHALL return `{ content: [{ type: "text", text: "<error message>" }], isError: true }`

#### Scenario: Realize rejects double realization with VALIDATION

- **GIVEN** a planned transaction row already flipped to `isPlanned=0` with `realizedAt` set
- **WHEN** the realize operation is invoked again for that row
- **THEN** it SHALL throw an error with code `VALIDATION` and change nothing

#### Scenario: Reserved system category deletion is forbidden

- **GIVEN** the reserved `Adjustment` system category owned by the authenticated user
- **WHEN** the user attempts to delete it
- **THEN** it SHALL throw an error with code `FORBIDDEN` and preserve the category
### Requirement: Service Function Transport Neutrality

Service functions MUST NOT import, reference, or depend on any HTTP framework (Hono, Request, Response), MCP SDK types, or transport-specific constructs. Service functions SHALL accept only: a database handle, a user identifier, and typed input parameters. Service functions SHALL return plain TypeScript objects or throw `ServiceError`.

#### Scenario: Service function callable without HTTP context

- **WHEN** a test invokes `listWallets(db, userId)` without any Hono context or MCP server instance
- **THEN** it SHALL return an array of wallet objects from the database

### Requirement: Unified Authentication Resolution

The system MUST provide a single authentication resolution function that replaces all existing redundant implementations. The function SHALL accept credential candidates from multiple sources and resolve them in priority order:

1. Bearer token from `Authorization` header
2. API key from `X-API-Key` or `mcp-api-key` header
3. Token from `?apiKey` or `?token` query parameter
4. API key or token from MCP tool arguments (`args.apiKey`, `args.token`)

For each candidate, resolution SHALL attempt in order:
1. API key prefix match (`rd_live_` or `fp_live_`) → SHA-256 hash → D1 lookup
2. OAuth access token verification (stateless HS256 JWT, no D1 query)
3. Legacy Reedrich JWT verification
4. Fallback raw hash lookup

The function SHALL return the first successfully resolved user ID, or `null` if no candidate resolves.

#### Scenario: Bearer token with API key prefix resolves via hash lookup

- **GIVEN** a request with header `Authorization: Bearer rd_live_abc123`
- **WHEN** the auth resolver processes the credential
- **THEN** it SHALL hash the key with SHA-256 and look up the user by `user_api_key_hash` in D1
- **THEN** it SHALL return the matching `userId` if found, or `null` if not

#### Scenario: OAuth access token resolves without D1 query

- **GIVEN** a request with header `Authorization: Bearer <valid-oauth-jwt>`
- **WHEN** the auth resolver processes the credential
- **THEN** it SHALL verify the JWT signature with HS256 and extract `sub` as `userId` without querying D1

#### Scenario: MCP tool argument fallback resolves when HTTP headers are absent

- **GIVEN** an MCP tool call with no `Authorization` header but with `args.apiKey = "rd_live_xyz"`
- **WHEN** the auth resolver processes with `toolArgs` source
- **THEN** it SHALL resolve the user ID via API key hash lookup

#### Scenario: All candidates fail

- **GIVEN** a request with an expired JWT in the `Authorization` header and no other credentials
- **WHEN** the auth resolver processes all candidates
- **THEN** it SHALL return `null`

### Requirement: Service-MCP Output Equivalence

For every MCP tool that delegates to a service function, the MCP transport adapter MUST produce output compatible with downstream consumers while incorporating new liquidity segregation fields. The JSON structure, field names, field order, and error messages MUST NOT change, except for backward-compatible additive properties for wallet locking and liquidity analytics.

#### Scenario: financial_summary produces identical output after refactor

- **GIVEN** a user with wallets, transactions, budgets, goals, debts, and recurring templates
- **WHEN** the `financial_summary` MCP tool is called with `startDate` and `endDate` parameters
- **THEN** the response JSON SHALL contain the same fields in the same structure as the current implementation: `netWorthByCurrency`, `netWorthByInstitution`, `consolidatedNetWorth`, `totalIncome`, `totalExpense`, `totalAdminFees`, `netSavings`, `totalDebt`, `totalReceivable`, `activeGoals`, `cashflowProjections`, `walletsCount`, `transactionsCount`, `transfersCount`, `categoryBreakdown`
- **THEN** the response JSON SHALL additively include `spendableCash`, `lockedCash`, `safeToSpend`, and `dailySafeToSpend`

#### Scenario: manage_wallet list produces identical output after refactor

- **WHEN** the `manage_wallet` MCP tool is called with `action: "list"`
- **THEN** the response SHALL be identical in structure and content to the current implementation, with each wallet object additively containing `walletIsLocked` (integer `0` or `1`)

### Requirement: Ledger-Complete Wallet Balance Adjustment

Every wallet balance change initiated through `updateWallet(balance)` MUST print exactly one adjustment transaction row (income when the delta is positive, expense when negative) against the reserved `Adjustment` system category, then move the balance through the existing atomic path. A zero delta SHALL be a no-op returning the existing wallet with no new row. Direct silent overwrites SHALL NOT occur.

#### Scenario: Balance correction prints an adjustment transaction

- **GIVEN** a wallet with balance Rp 10.000.000 owned by the authenticated user
- **WHEN** the user updates the wallet balance to Rp 12.000.000
- **THEN** the system SHALL print one income adjustment transaction of Rp 2.000.000 against the reserved `Adjustment` category and set the wallet balance to Rp 12.000.000

#### Scenario: Zero-delta update prints nothing

- **GIVEN** a wallet with balance Rp 10.000.000
- **WHEN** the user updates the wallet balance to Rp 10.000.000
- **THEN** the system SHALL return the existing wallet unchanged with zero new transaction rows

#### Scenario: Adjustment on another user's wallet is rejected

- **GIVEN** an authenticated user A and a wallet belonging to user B
- **WHEN** user A attempts a balance adjustment on that wallet
- **THEN** the system SHALL return a 404 Not Found error and print no transaction row
