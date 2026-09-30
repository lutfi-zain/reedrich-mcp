## Purpose

Defines the behavioral specification and query parameter contracts for enhanced transaction retrieval, including pagination metadata headers, opt-in response envelopes, case-insensitive keyword search, multi-value entity filtering, and client-friendly status aliases.

## ADDED Requirements

### Requirement: Pagination Metadata Headers and Opt-in Envelope

The system MUST support enhanced pagination metadata for `GET /api/v1/transactions` across both HTTP response headers and optional response body envelopes:

1. **HTTP Headers (Universal)**:
   Every successful response from `GET /api/v1/transactions` MUST include the following response headers:
   - `X-Total-Count`: Total number of matching transactions before pagination limits.
   - `X-Limit`: The effective limit applied to the query.
   - `X-Offset`: The pagination offset applied.
   - `X-Has-Next-Page`: `"true"` if `offset + limit < total`, otherwise `"false"`.

2. **Opt-in JSON Envelope**:
   - If query parameter `envelope=true` or `envelope=1` is provided, the system MUST return HTTP `200 OK` with a JSON object payload:
     ```json
     {
       "items": [ /* Transaction objects */ ],
       "pagination": {
         "total": 1420,
         "limit": 50,
         "offset": 0,
         "hasNext": true,
         "totalPages": 29
       }
     }
     ```
   - If `envelope` is omitted or false, the system MUST return the raw JSON array of transaction objects to maintain full backward compatibility with existing clients.

3. **MCP Tool Structure**:
   The MCP tool `list_transactions` MUST return the structured envelope containing `items` and `pagination` to enable autonomous agents to determine record availability and pagination boundaries.

#### Scenario: Default query returns array with pagination headers

- **GIVEN** an authenticated user with 120 recorded transactions
- **WHEN** the client invokes `GET /api/v1/transactions?limit=50&offset=0`
- **THEN** the system MUST respond with HTTP `200 OK`
- **THEN** the response body MUST be a JSON array with 50 items
- **THEN** the response header `X-Total-Count` MUST equal `"120"`
- **THEN** the response header `X-Has-Next-Page` MUST equal `"true"`

#### Scenario: Query with envelope=true returns structured pagination object

- **GIVEN** an authenticated user with 75 recorded transactions
- **WHEN** the client invokes `GET /api/v1/transactions?envelope=true&limit=25&offset=50`
- **THEN** the system MUST respond with HTTP `200 OK`
- **THEN** the response body MUST contain `items` (array of 25 transactions)
- **THEN** the response body MUST contain `pagination` with `total: 75`, `limit: 25`, `offset: 50`, `hasNext: false`, and `totalPages: 3`

---

### Requirement: Case-Insensitive Keyword Search

The system MUST permit searching transaction descriptions using query parameter `q` or `search` on `GET /api/v1/transactions` and the MCP tool `list_transactions`.

The search filter SHALL match substrings within `transactionDescription` case-insensitively. If the search term is empty or consists solely of whitespace, no description filter SHALL be applied.

#### Scenario: Search transactions by keyword

- **GIVEN** an authenticated user with transactions described as "Kopi Kenangan", "Supermarket Groceries", and "KOPI Janji Jiwa"
- **WHEN** the client invokes `GET /api/v1/transactions?q=kopi`
- **THEN** the response MUST return only the 2 transactions containing "Kopi" regardless of character casing

#### Scenario: Search with no matches returns empty list

- **WHEN** the client invokes `GET /api/v1/transactions?q=nonexistentkeywordxyz`
- **THEN** the system MUST respond with HTTP `200 OK` and an empty list of items, with `X-Total-Count: 0`

---

### Requirement: Multi-Value Identifier Filtering

The system MUST permit filtering transactions across multiple identifiers for `walletId`, `targetWalletId`, `categoryId`, and `budgetId` on `GET /api/v1/transactions` and MCP tool `list_transactions`.

The system SHALL accept multi-value filters formatted as:
- A comma-separated string of UUIDs (e.g. `?walletId=uuid1,uuid2,uuid3`).
- Repeated query parameters (e.g. `?walletId=uuid1&walletId=uuid2`).
- An array of UUID strings in JSON tool arguments.

The query SHALL match any transaction whose corresponding column matches any of the provided identifiers (SQL `IN` clause).

#### Scenario: Filter transactions by multiple wallet IDs

- **GIVEN** an authenticated user with transactions in wallet `w1`, wallet `w2`, and wallet `w3`
- **WHEN** the client invokes `GET /api/v1/transactions?walletId=w1,w2`
- **THEN** the system MUST return transactions belonging to either `w1` or `w2`, and MUST NOT return transactions belonging to `w3`

#### Scenario: Filter transactions by multiple category IDs

- **GIVEN** an authenticated user with transactions in categories `c1`, `c2`, and `c3`
- **WHEN** the client invokes `GET /api/v1/transactions?categoryId=c1,c2`
- **THEN** the system MUST return transactions categorized under either `c1` or `c2`

---

### Requirement: Status Alias Filtering

The system MUST support the `status` query parameter on `GET /api/v1/transactions` and MCP tool `list_transactions`:

1. `status=realized`: Matches only realized transactions (`isPlanned = 0`).
2. `status=planned`: Matches only planned/virtual transactions (`isPlanned = 1`).
3. `status=all`: Returns transactions regardless of planned status.

If `status` is supplied with an unsupported value, the system MUST respond with HTTP `400 Bad Request` and error code `VALIDATION`. If `status` is omitted, the system SHALL continue to respect the legacy `isPlanned` boolean filter.

#### Scenario: Filter realized transactions via status alias

- **GIVEN** an authenticated user with both realized and planned transactions
- **WHEN** the client invokes `GET /api/v1/transactions?status=realized`
- **THEN** all returned transactions MUST have `transactionIsPlanned: 0`

#### Scenario: Filter planned transactions via status alias

- **GIVEN** an authenticated user with both realized and planned transactions
- **WHEN** the client invokes `GET /api/v1/transactions?status=planned`
- **THEN** all returned transactions MUST have `transactionIsPlanned: 1`
