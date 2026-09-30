# transaction-sorting Specification

## Purpose

Defines the externally observable contract for client-controlled ordering of transaction listings via `orderBy` and `direction` on `GET /api/v1/transactions` and MCP `list_transactions`, defaulting to date descending with deterministic tiebreaking.

## Requirements

### Requirement: Client-Controlled Transaction Ordering

The system MUST support `orderBy` and `direction` on `GET /api/v1/transactions` and MCP tool `list_transactions`:

1. **Accepted `orderBy` values** (case-insensitive; surrounding whitespace ignored):
   - `date` ➔ order by transaction date.
   - `amount` ➔ order by transaction amount.
   - `createdAt` ➔ order by record creation timestamp.
   - `description` ➔ order by transaction description.
   - Omitted ➔ defaults to `date`.
2. **Accepted `direction` values** (case-insensitive; surrounding whitespace ignored):
   - `asc` ➔ ascending primary sort.
   - `desc` ➔ descending primary sort.
   - Omitted ➔ defaults to `desc`.
3. **Deterministic tiebreaker**: every ordered result MUST apply `transactionCreatedAt DESC` after the primary sort key so pagination (`limit`/`offset`) is stable across pages.
4. Any other `orderBy` or `direction` value MUST be rejected with HTTP `400 Bad Request` and error code `VALIDATION`.

#### Scenario: Default order is date descending

- **GIVEN** an authenticated user with transactions dated 2026-09-01, 2026-09-10, and 2026-09-20
- **WHEN** the client invokes `GET /api/v1/transactions` with no ordering params
- **THEN** the system MUST return items newest-date first

#### Scenario: Order by amount ascending

- **GIVEN** an authenticated user with transactions of amounts 50000, 10000, and 30000
- **WHEN** the client invokes `GET /api/v1/transactions?orderBy=amount&direction=asc`
- **THEN** the system MUST return items ordered 10000, 30000, 50000

#### Scenario: Order by amount descending explicitly

- **GIVEN** an authenticated user with transactions of amounts 50000, 10000, and 30000
- **WHEN** the client invokes `GET /api/v1/transactions?orderBy=amount&direction=desc`
- **THEN** the system MUST return items ordered 50000, 30000, 10000

#### Scenario: Order by description ascending

- **GIVEN** an authenticated user with descriptions "Zebra", "Apple", and "Mango"
- **WHEN** the client invokes `GET /api/v1/transactions?orderBy=description&direction=asc`
- **THEN** the system MUST return items ordered Apple, Mango, Zebra

#### Scenario: Reject invalid orderBy value

- **WHEN** the client invokes `GET /api/v1/transactions?orderBy=walletBalance`
- **THEN** the system MUST respond with HTTP `400 Bad Request` and error code `VALIDATION`

#### Scenario: Reject invalid direction value

- **WHEN** the client invokes `GET /api/v1/transactions?orderBy=amount&direction=sideways`
- **THEN** the system MUST respond with HTTP `400 Bad Request` and error code `VALIDATION`

#### Scenario: MCP list_transactions mirrors ordering params

- **WHEN** an agent calls `list_transactions` with `{ orderBy: "amount", direction: "asc", envelope: true }`
- **THEN** `items` MUST be ordered by amount ascending with the same deterministic tiebreaker
