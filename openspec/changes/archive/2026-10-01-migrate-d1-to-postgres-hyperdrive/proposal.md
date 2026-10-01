## Why

Cloudflare D1 Free Tier enforces a hard daily limit of 5,000,000 scanned row reads per day (`code: 7500`), which causes complete service outages (HTTP 500) once reached by regular daily testing and multi-entity queries. Migrating the persistence layer to self-hosted PostgreSQL 16 on the VPS connected via Cloudflare Hyperdrive and PgBouncer eliminates all daily read/write quotas forever while preserving the serverless Cloudflare Workers edge runtime and sub-millisecond connection pooling.

## What Changes

- **Database Engine Migration**: Migrate persistence from Cloudflare D1 (serverless SQLite at edge) to PostgreSQL 16 (`postgres-primary` container in VPS) connected through PgBouncer (`0.0.0.0:6432`) and Cloudflare Hyperdrive (`vps-pg`, ID: `246e815964a44eed9464752afe346134`).
- **Dedicated Database Creation**: Create dedicated `reedrich` database in PostgreSQL (separate from default `postgres` database) and point Hyperdrive configuration to it.
- **ORM Schema Evolution**: Convert Drizzle ORM definitions in `src/db/schema.ts` from SQLite dialect (`sqliteTable`, `real`, `text`, `integer`) to PostgreSQL dialect (`pgTable`, `numeric`/`doublePrecision`, `text`, `integer`, `timestamp`) with identical table structures, primary keys, and foreign key cascades.
- **Driver Swap**: Install `postgres` (postgres.js) driver and update database instantiation across all routes and services from `drizzle-orm/d1` (`DrizzleD1Database`) to `drizzle-orm/postgres-js` (`PostgresJsDatabase`).
- **Wrangler Configuration**: Replace `[[d1_databases]]` binding in `wrangler.toml` with `[[hyperdrive]]` binding (`binding = "HYPERDRIVE"`).
- **Data Migration (ETL)**: One-time ETL pipeline to extract all existing records (~3,469 rows across 10 tables: `users`, `wallets`, `categories`, `budgets`, `transactions`, `debts_loans`, `feedbacks`, `goals`, `goal_wallets`, `recurring_templates`) from Cloudflare D1 and load them into PostgreSQL `reedrich` preserving all UUIDs and timestamps.
- **Test Suite Modernization**:
  - Update `tests/mcp.test.ts` to run against a dedicated local test database (`reedrich_test`) in PostgreSQL instead of the in-memory SQLite mock (`MockD1Database`).
  - Update `scripts/run-local-integration.sh` and `scripts/run-integration.sh` to configure Hyperdrive local connection strings and execute PostgreSQL-compatible teardown commands.

## Capabilities

### New Capabilities
- `database-migration`: Migration of the database layer and Drizzle ORM schemas from SQLite/D1 to PostgreSQL 16 via Cloudflare Hyperdrive, establishing persistent connection pooling, zero row limits, and multi-tenant RLS parity.

### Modified Capabilities
<!-- None. All external HTTP REST endpoints, OpenAPI schemas, and MCP JSON-RPC tool contracts remain strictly identical with zero breaking changes for clients. -->

## Impact

- **Security & Multi-Tenancy**: Multi-tenant Row-Level Security (RLS) invariant `eq(table.<column>UserId, userId)` remains strictly enforced on every query. Database credentials remain isolated in `.env` and Cloudflare Hyperdrive secrets; PgBouncer enforces transaction-level connection isolation (`pool_mode = transaction`).
- **Performance**: Cloudflare Hyperdrive maintains persistent, warm TCP connection pools from edge PoPs to PgBouncer, mitigating cold-start connection latency. Query execution times remain comparable or faster than D1.
- **Reliability & Quota**: Eliminates 100% of Cloudflare D1 daily row read quota errors.
- **Compatibility**: 100% backward compatible with existing frontend clients (`maniyy2.pages.dev`), MCP tools, and REST API consumers.

## Non-Goals

- Modifying MCP tool contracts, names, or arguments.
- Modifying REST API endpoints, routing patterns, or response envelopes.
- Changing business logic, calculation formulas (safe-to-spend, pacing metrics), or transaction lifecycle states.
- Exposing PostgreSQL directly to the public internet without PgBouncer TLS or SSH tunnel.
