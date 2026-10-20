## Why

Direct IP origin targeting (`43.133.148.181:6432`) in Cloudflare Hyperdrive tightly couples the Cloudflare Workers edge runtime to a mutable host IP, creating an operational failure mode where host firewall policies (UFW `default deny incoming`) and loopback service bindings sever database connectivity. This severed link causes 30-second connection timeouts and unhandled HTTP 500 exceptions (`DrizzleQueryError: Failed query`) on Google OAuth callbacks and MCP tool executions.

Migrating Hyperdrive database connectivity from raw IP addressing to domain routing (`pg.membran.app`) via Cloudflare Tunnel / Access eliminates direct IP exposure, satisfies host hardening invariants (zero open public database ports on the VPS), and restores reliable edge-to-database communications.

## What Changes

- **Hyperdrive Origin Migration**: Reconfigure Cloudflare Hyperdrive (`vps-pg`, ID: `246e815964a44eed9464752afe346134`) origin from `43.133.148.181:6432` to the domain hostname `pg.membran.app`.
- **Zero-Public-Port Invariant Enforcement**: Retain PgBouncer on localhost loopback `127.0.0.1:6432` and PostgreSQL 16 on `127.0.0.1:5432`, routing external requests through Cloudflare Tunnel without exposing port 6432 to public IP space in UFW.
- **Edge Routing & Authentication**: Configure Hyperdrive to authenticate and traverse Cloudflare Tunnel using Cloudflare Access service credentials or Tunnel TCP proxying, ensuring zero public IP exposure.
- **Worker Configuration & Documentation Alignment**: Update `wrangler.toml`, `AGENTS.md`, and deployment verification scripts to document and enforce domain-only database routing.

## Capabilities

### New Capabilities
- `specs/database-connectivity/spec.md`: Behavioral requirements, timeout thresholds, error encapsulation, and invariants for domain-based database connectivity from Cloudflare Workers edge.

### Modified Capabilities
*(None — existing REST API endpoints, MCP tool interfaces, and Drizzle ORM database schemas remain 100% backward compatible.)*

## Impact

- **Affected Components**: Cloudflare Hyperdrive binding (`vps-pg`), Cloudflare Tunnel routing (`pg.membran.app`), Cloudflare Workers database factory (`src/db/index.ts`), and documentation.
- **Breaking Changes**: None. No database migrations, no table schema modifications, and no MCP tool signature changes.
- **Security & Multi-Tenancy**: Enhanced security posture. VPS firewall remains closed (`default deny incoming` without opening public port 6432). All connections strictly enforce TLS and SCRAM-SHA-256 authentication over domain ingress.
- **Performance**: Eliminates 30-second edge socket timeouts, restoring sub-50ms database query response latencies for authenticated user flows and Google OAuth callbacks.
