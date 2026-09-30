## Why

Modern frontend client applications (React/Next.js dashboards, mobile clients) and autonomous AI agents require flexible, low-latency querying and deterministic forward-looking financial forecasting. Currently:
1. `GET /api/v1/transactions` returns an unenveloped raw JSON array without total record counts, preventing clients from calculating total pages without full-table scans.
2. Clients cannot search transactions by description or keyword on the server, forcing memory-heavy in-browser text filtering.
3. Filtering is limited to single UUIDs, preventing modern UI multi-select comboboxes (e.g. viewing transactions across 3 bank accounts simultaneously).
4. Constructing a 6 to 20-month financial horizon board currently forces clients to execute dozens of waterfall HTTP requests or download thousands of transactions to recalculate compound balances and net worth locally.

This change introduces comprehensive transaction query enhancements (pagination headers, opt-in envelope, full-text keyword search, multi-value filters, status aliases) and establishes a high-performance, single-pass Multi-Period Horizon Board projections endpoint (`GET /api/v1/analytics/horizon`) and MCP tool (`get_horizon_projections`).

## What Changes

- **Transaction Query Enhancements (`src/services/transaction.ts`, `src/routes/transactions.ts`, `src/mcp.ts`)**:
  - **Pagination Metadata Headers**: `GET /api/v1/transactions` returns `X-Total-Count`, `X-Limit`, `X-Offset`, and `X-Has-Next-Page` headers on every response.
  - **Opt-in Response Envelope**: When `?envelope=true` is requested, the endpoint wraps results in `{ items: [...], pagination: { total, limit, offset, hasNext, totalPages } }`. Default response without this parameter retains the backward-compatible raw array format.
  - **Full-Text Keyword Search**: Query parameters `q` and `search` filter case-insensitively across transaction descriptions via SQL `LOWER(description) LIKE '%q%'`.
  - **Multi-Value Filtering**: `walletId`, `targetWalletId`, `categoryId`, and `budgetId` accept comma-separated strings (e.g. `?walletId=w1,w2,w3`) and query arrays, translated to SQL `IN (?, ?, ...)`.
  - **Status Filter**: Introduces `status=realized|planned|all`, mapping `realized` to `isPlanned=0`, `planned` to `isPlanned=1`, and `all` to unconstrained planned status, while preserving the legacy `isPlanned` boolean.
  - **MCP `list_transactions`**: Emits the structured envelope `{ items, pagination }` and supports `q`, `status`, and multi-ID parameters.

- **Multi-Period Horizon Board Engine (`src/services/horizon.ts`, `src/routes/horizon.ts`, `src/mcp.ts`)**:
  - **New REST Endpoint**: `GET /api/v1/analytics/horizon` accepting `months` (1-24, default 6), `periods` (comma-separated `YYYY-MM`), and `baseCurrency` (default `IDR`).
  - **Single-Pass Edge Fetch**: Reads wallets, active recurring templates, planned transactions, active goals, and live FX rates in a single atomic pass on Cloudflare D1.
  - **Month-by-Month Roll-Forward Simulation**: For each future month, calculates projected cashflow (incomes, expenses, transfers), point-in-time wallet balance accumulation, spendable vs locked net worth breakdown, and linked goal pacing.
  - **New MCP Tool**: `get_horizon_projections` exposing the horizon board directly to AI planning workflows.

- **Documentation & OpenAPI**:
  - OpenAPI 3.0 specification (`src/docs/openapi.ts`) updated with all new query parameters and the `/api/v1/analytics/horizon` path.
  - Machine-readable manifest (`src/docs/llms.ts`) and `README.md` updated with new endpoints and tools.

## Capabilities

### New Capabilities
- `transaction-query-enhancements`: Specifications for pagination metadata, opt-in envelope, keyword search, multi-value filters, and status aliases on transactions.
- `multi-period-horizon`: Specifications for multi-month financial horizon board simulation, roll-forward wallet balance accumulation, and net worth forecasting.

### Modified Capabilities
None. Existing transaction creation, mutation, and deletion contracts remain unaffected.

## Non-Goals

- Client-side charting or frontend visual rendering components.
- Storing projected future monthly snapshots in persistent D1 database tables (projections are deterministic, point-in-time calculations generated on demand).
- Arbitrary date interval grouping (horizons are strictly calendar-month aligned).

## Impact & Constraints

- **Multi-Tenant RLS**: All queries in transaction filtering and horizon simulation strictly enforce `eq(schema.<table>.<table>UserId, userId)`.
- **Zero Breaking Changes**: Default response format of `GET /api/v1/transactions` remains a raw array unless `?envelope=true` is explicitly requested.
- **Edge Runtime Performance**: Horizon simulation executes in under 20ms on Cloudflare Workers (V8 Isolate) using memory-efficient accumulator loops.
