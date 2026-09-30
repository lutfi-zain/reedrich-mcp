## Why

`GET /api/v1/transactions` and MCP `list_transactions` return rows in a hardcoded order (`transactionDate DESC, transactionCreatedAt DESC`) with no client control. Dashboards needing "largest expense first", "oldest first", or alphabetical description views must download full pages and re-sort in the browser, wasting bandwidth and edge latency.

## What Changes

- **Service Layer (`src/services/transaction.ts`)**:
  - Extend `ListTransactionsFilters` with `orderBy?: unknown` (`'date' | 'amount' | 'createdAt' | 'description'`, default `'date'`) and `direction?: unknown` (`'asc' | 'desc'`, case-insensitive, default `'desc'`).
  - Map `orderBy` to columns: `date` ➔ `transactionDate`, `amount` ➔ `transactionAmount`, `createdAt` ➔ `transactionCreatedAt`, `description` ➔ `transactionDescription`.
  - Apply primary sort in the requested direction, always followed by deterministic tiebreaker `transactionCreatedAt DESC`.
  - Reject any other `orderBy`/`direction` value with `VALIDATION` (HTTP 400).
- **REST Route (`src/routes/transactions.ts`)**:
  - Pass `orderBy: q.orderBy` and `direction: q.direction` from query string into `listTransactions`.
- **MCP Tool (`src/mcp.ts`)**:
  - Add `orderBy` (enum `["date", "amount", "createdAt", "description"]`) and `direction` (enum `["asc", "desc"]`) to `list_transactions` input schema.
- **Docs (`src/docs/openapi.ts`, `src/docs/llms.ts`)**:
  - Document `orderBy`/`direction` on `GET /api/v1/transactions`.
- **Tests (`tests/mcp.test.ts`)**:
  - Cover amount ASC/DESC, date ASC, description ordering, defaults, and 400 on invalid values.

## Capabilities

### New Capabilities
- `transaction-sorting`: Client-controlled result ordering for transaction listing via `orderBy` and `direction` across REST and MCP.

### Modified Capabilities
None. Filter, pagination, and envelope semantics remain unchanged.

## Non-Goals

- Multi-column sort expressions or per-field direction tuples.
- Sorting on non-whitelisted columns (`walletId`, `adminFee`, `type`).
- Changing default order (stays `date DESC`).

## Impact & Constraints

- **Multi-Tenant RLS**: Unchanged; ordering applies after tenant-scoped filtering.
- **Zero Breaking Changes**: Omitting both params reproduces today's exact order.
- **SQL Injection**: `orderBy` maps through a fixed column whitelist, never interpolated as raw SQL.
- **Edge Performance**: Sort keys (`transactionDate`, `transactionAmount`, `transactionCreatedAt`) are covered by existing indexes where applicable.
