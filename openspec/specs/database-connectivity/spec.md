# database-connectivity Specification

## Purpose

Defines the behavioral contracts, domain routing guarantees, connection reliability ceilings, and zero-public-IP exposure invariants for database connectivity from the Cloudflare Workers edge.

## Requirements

### Requirement: Domain-Routed Database Ingress

The system MUST establish all edge-to-database connections exclusively via fully qualified domain names and Cloudflare-managed ingress, and SHALL NOT initiate direct TCP socket connections to raw VPS public IPv4 or IPv6 addresses.

#### Scenario: Edge query resolves through domain origin without raw IP exposure
- **GIVEN** a deployed Cloudflare Worker handling an authenticated MCP or REST API request
- **WHEN** the runtime executes a database query via the Hyperdrive connection binding
- **THEN** the network connection MUST route to the origin domain `pg.membran.app` over Cloudflare Tunnel
- **AND** the Worker runtime SHALL NOT attempt direct TCP connections to `43.133.148.181`

#### Scenario: Google OAuth callback completes profile query without timeout
- **GIVEN** a user completing Google OAuth authentication with valid Google profile credentials
- **WHEN** the callback endpoint queries the user profile by email in PostgreSQL
- **THEN** the query MUST execute successfully and return the user identity within 500 milliseconds
- **AND** the response SHALL NOT result in HTTP 500 or `DrizzleQueryError: Failed query` caused by database unreachable timeouts

### Requirement: Zero-Public-Port Ingress Isolation

The system MUST preserve host-level network perimeter isolation, requiring that PostgreSQL and PgBouncer reject all unauthenticated and non-tunneled external traffic without opening host ports on public network interfaces.

#### Scenario: External TCP probe to database ports rejected
- **GIVEN** an external probe originating outside Cloudflare edge ingress
- **WHEN** attempting a direct TCP connection to port `5432` or port `6432` on the VPS host IP
- **THEN** the connection MUST be rejected or dropped by firewall policy
- **AND** the database service SHALL remain unreachable from the public internet

### Requirement: Transparent Connection Failure Handling

The system MUST handle transient database connection disruptions gracefully, emitting structured, sanitized domain error responses rather than leaking raw database stack traces or SQL parameter strings to external clients.

#### Scenario: Database connection failure returns sanitized internal error
- **GIVEN** an unexpected upstream database network interruption
- **WHEN** a client calls an authenticated endpoint or MCP tool requiring database access
- **THEN** the system MUST respond with HTTP 500 or JSON-RPC internal error code `-32603`
- **AND** the error response message SHALL NOT expose database credentials, connection strings, or raw SQL parameter bindings
