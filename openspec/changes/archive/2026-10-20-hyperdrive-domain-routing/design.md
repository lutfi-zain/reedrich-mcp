## Context

See `proposal.md` for background and motivation.

The persistence architecture connects Cloudflare Workers at the edge to self-hosted PostgreSQL 16 on the VPS via PgBouncer and Cloudflare Hyperdrive (`id: 246e815964a44eed9464752afe346134`, binding: `HYPERDRIVE`). Currently, the Hyperdrive origin is hardcoded to the raw public IPv4 address `43.133.148.181:6432`. However, host-level security hardening binds PgBouncer exclusively to `127.0.0.1:6432` and enforces a strict `default deny incoming` firewall policy on the host VPS. This prevents any external TCP packets from reaching port 6432 directly, severing database queries and causing 30-second socket timeouts during user profile checks and transaction queries.

Cloudflare Tunnel (`cloudflared`) is actively running on the host VPS, already routing the domain `pg.membran.app` to local `tcp://127.0.0.1:6432`.

## Goals / Non-Goals

**Goals:**
- Eliminate direct IPv4 addressing (`43.133.148.181`) from Cloudflare Hyperdrive configuration.
- Reconfigure Hyperdrive origin to target the domain `pg.membran.app`.
- Route database traffic through Cloudflare Tunnel / Access to reach `127.0.0.1:6432` without opening port 6432 in UFW or binding PgBouncer to `0.0.0.0`.
- Restore sub-second database query execution for Google OAuth callback and all MCP tools.

**Non-Goals:**
- Modifying PostgreSQL database schema, DDL, table structures, or Drizzle ORM definitions in `src/db/schema.ts`.
- Altering the business logic or balance reconciliation mathematics in `src/services/*`.
- Modifying MCP tool schemas, resource URIs, or REST API endpoints.
- Executing destructive operations on the remote PostgreSQL database.

## Decisions

### 1. Reconfigure Cloudflare Hyperdrive to Domain Origin (`pg.membran.app`)
- **Decision**: Update the existing Hyperdrive configuration `vps-pg` (`246e815964a44eed9464752afe346134`) via Wrangler to point its origin host to `pg.membran.app`.
- **Mechanics**:
  ```bash
  npx wrangler hyperdrive update 246e815964a44eed9464752afe346134 \
    --host pg.membran.app \
    --database reedrich \
    --user postgres \
    --password "<POSTGRES_PASSWORD>" \
    --scheme postgres \
    --sslmode require
  ```
  Or, if leveraging Cloudflare Zero Trust Access authentication:
  ```bash
  npx wrangler hyperdrive update 246e815964a44eed9464752afe346134 \
    --host pg.membran.app \
    --access-client-id "<CF_ACCESS_CLIENT_ID>" \
    --access-client-secret "<CF_ACCESS_CLIENT_SECRET>" \
    --database reedrich \
    --user postgres \
    --password "<POSTGRES_PASSWORD>" \
    --scheme postgres
  ```
- **Rationale**: Eliminates hardcoded VPS IP addresses from edge configuration. Cloudflare Hyperdrive resolves the domain name dynamically and routes connections over encrypted Cloudflare infrastructure.

### 2. Maintain Host Perimeter Isolation (Zero Public Database Ports)
- **Decision**: Keep PgBouncer bound strictly to loopback `127.0.0.1:6432` in `/home/ubuntu/infra/postgres/docker-compose.yml` and keep PostgreSQL bound to `127.0.0.1:5432`. Do NOT expose port 6432 to `0.0.0.0` or open port 6432 in UFW.
- **Rationale**: Direct database port exposure to the public internet presents a vulnerability surface for brute-force attacks and scans. Cloudflare Tunnel encapsulates inbound TCP traffic within established outbound HTTPS/QUIC tunnels, allowing secure ingestion without open inbound firewall ports.

### 3. Verification & Deployment Pipeline
- **Decision**: Validate the domain routing fix end-to-end using:
  1. Wrangler dry-run and deployment to Cloudflare Workers.
  2. Direct health verification via `curl https://reedrich-mcp.lutfidmz.workers.dev/health`.
  3. Single-flight probe of the Google OAuth profile query path and MCP tool `register_user` to prove the 30-second timeout is eliminated.
  4. Full non-destructive integration test suite via `npm run test:remote`.

## Risks / Trade-offs

- **[Risk] Cloudflare Tunnel TCP Latency Overhead** → Cloudflare Tunnel encapsulates TCP packets over outbound HTTP/2 or QUIC connections to the nearest Cloudflare edge PoP.
  - *Mitigation*: PgBouncer transaction-mode pooling (`POOL_MODE=transaction`) and Hyperdrive query caching keep persistent connections warm and eliminate TCP handshake overhead on repeated queries.
- **[Risk] Hyperdrive DNS Caching of Domain Origin** → If the tunnel endpoint DNS records change, Hyperdrive connection pools might retain stale routing temporarily.
  - *Mitigation*: Cloudflare Anycast IPs for `pg.membran.app` are managed globally with automatic failover and low TTL.
