## Purpose

Defines the behavioral contracts, data persistence guarantees, zero-quota failure invariants, and multi-tenant isolation requirements for migrating the persistence layer from Cloudflare D1 to PostgreSQL 16 via Cloudflare Hyperdrive.

## ADDED Requirements

### Requirement: Unbounded Read and Mutation Throughput

The system MUST execute all read queries, listings, mutations, and analytics calculations without failing due to daily row scan or read quotas.

#### Scenario: High volume transaction querying succeeds without quota errors
- **GIVEN** an authenticated user with thousands of transactions across multiple accounts
- **WHEN** the client invokes `GET /api/v1/transactions` or MCP tool `list_transactions` repeatedly
- **THEN** the system MUST return HTTP 200 with the correct transaction list and pagination headers
- **AND** the system SHALL NOT return HTTP 500 or error code `INTERNAL` caused by daily read limits

#### Scenario: Rapid sequential PATCH mutations succeed atomically
- **GIVEN** an existing transaction with ID `a8398eb2-1ca5-44f5-b707-858ce23d1ae1`
- **WHEN** the client invokes `PATCH /api/v1/transactions/a8398eb2-1ca5-44f5-b707-858ce23d1ae1` with updated amount and description
- **THEN** the system MUST reconcile wallet balances atomically and return HTTP 200 with the updated transaction representation

### Requirement: Strict Multi-Tenant Data Isolation Parity

The system MUST enforce strict Row-Level Security (RLS) across all entities in PostgreSQL, ensuring no user can read, mutate, or delete data belonging to another tenant.

#### Scenario: Cross-tenant transaction access rejected
- **GIVEN** User A authenticated with valid Bearer token
- **AND** a transaction ID belonging exclusively to User B
- **WHEN** User A invokes `GET /api/v1/transactions/:id` or `PATCH /api/v1/transactions/:id`
- **THEN** the system MUST return HTTP 404 with error code `NOT_FOUND`
- **AND** User A SHALL NOT receive any information regarding User B's transaction

#### Scenario: Cascading entity deletion within tenant boundary
- **GIVEN** User A with a wallet containing transactions, goals, and recurring templates
- **WHEN** User A invokes `DELETE /api/v1/wallets/:id`
- **THEN** the system MUST delete the wallet and handle foreign key constraints according to domain rules
- **AND** entities belonging to other users SHALL NOT be affected

### Requirement: Historic Data Integrity and Referential Parity

The system MUST preserve all existing records, UUID identifiers, foreign key relationships, balances, and ISO-8601 timestamps migrated from the prior persistence store.

#### Scenario: Pre-migration user login and historical transaction access
- **GIVEN** a user registered prior to the database migration
- **WHEN** the user authenticates via `login_user` with their existing API key
- **THEN** the system MUST successfully verify the API key hash and return a valid JWT token
- **AND** previous transactions, budgets, goals, and wallet balances MUST match their pre-migration values exactly

### Requirement: Atomic Financial Balance Reconciliation

The system MUST guarantee ACID transaction semantics for balance updates, fund transfers, and debt/loan repayments in PostgreSQL.

#### Scenario: Internal fund transfer between wallets
- **GIVEN** an authenticated user with source wallet balance of 1,000,000 IDR and target wallet balance of 200,000 IDR
- **WHEN** the user records a transfer of 300,000 IDR with admin fee of 2,500 IDR
- **THEN** the source wallet balance MUST become 697,500 IDR
- **AND** the target wallet balance MUST become 500,000 IDR
- **AND** both mutations MUST commit atomically or roll back completely on failure
