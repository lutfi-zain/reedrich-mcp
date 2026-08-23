## Context

The server is currently structured around `finnplan-mcp` (code/package name) and `Eve Finance` (legacy brand name) with resource URIs prefixed with `finance://`. To elevate the project into a mathematically deterministic financial intelligence engine for AI agents, we are executing a complete rebranding to `reedrich-mcp` (Reedrich).

All existing table schemas (`users`, `wallets`, `categories`, `budgets`, `transactions`, `debts_loans`) and D1 database records must remain completely intact. The rebranding touches configuration, protocol declarations, resource URIs, JWT claims, key prefixes, snippet generation, test fixtures, and documentation.

## Goals / Non-Goals

**Goals:**
- Unify all package, worker, protocol, and documentation names under `reedrich-mcp` (Reedrich).
- Migrate all MCP resource URIs cleanly from `finance://` to `reedrich://`.
- Update JWT `iss` to `'reedrich-mcp'` and `aud` to `'reedrich-client'`, while supporting dual-issuer backward compatibility in `verifyUserToken` for in-flight tokens.
- Standardize new API key generation to `rd_live_...` prefix while preserving cryptographic SHA-256 storage and lookup compatibility for all existing `fp_live_...` keys.
- Update agent setup snippets (`scripts/agent-snippet.ts`, `docs/CODING_AGENTS.md`, `examples/agents/`).
- Ensure 100% test pass rate across all 14 unit test suites and 29 local/remote integration test steps with zero regressions.

**Non-Goals:**
- No database table drops, column renames, or destructive migrations.
- No changes to financial math formulas or balance reconciliation invariants.
- No removal of existing user tools or endpoints.

## Decisions

### Decision 1: MCP Server & Package Identity
- **Choice**: Rename package and server to `reedrich-mcp`.
- **Rationale**: `reedrich-mcp` uniquely captures the Reed Richards mathematical persona and the core value proposition of financial wealth (*Rich*), with 0% naming collision on npm, GitHub, and MCP registries.
- **Alternatives Considered**: `reedr` (conflicts with RSS/e-reader apps like Reeder), `reed-finance` (less punchy, loses the wordplay).

### Decision 2: MCP Resource URIs Migration
- **Choice**: Migrate all resource URIs to the `reedrich://` scheme:
  - `reedrich://db/schema`: Database schema & entity relations
  - `reedrich://wallets/list`: Live wallet list & balances
  - `reedrich://budgets/active`: Active budgets & spending utilization
  - `reedrich://debts/active`: Active debts & loans summary
- **Rationale**: Standardizing URI schemes to match the server name allows MCP clients (Claude Code, Cursor, Windsurf, OpenCode) to cleanly namespace resources.

### Decision 3: Auth Claims & Key Prefixes (Zero-Breakage Backward Compatibility)
- **Choice**:
  - JWT Claims: `TOKEN_ISSUER = 'reedrich-mcp'`, `TOKEN_AUDIENCE = 'reedrich-client'`.
  - JWT Verification: Support dual-issuer verification in `verifyUserToken` (accepting both `['reedrich-mcp', 'eve-finance-mcp']` and `['reedrich-client', 'eve-finance-client']`) to ensure in-flight JWT tokens remain valid during their 15-minute window.
  - API Key Prefix: Update `generateApiKey()` to return `rd_live_<32 hex chars>`.
  - Key Hashing: Continues using Web Crypto SHA-256 (`crypto.subtle.digest('SHA-256')`). Because only the hash is stored in the database (`user_api_key_hash`), any valid key (existing `fp_live_` or new `rd_live_`) hashes deterministically and authenticates seamlessly without requiring data migration.

### Decision 4: Agent Setup Snippets Architecture
- **Choice**: Update `scripts/agent-snippet.ts` and `docs/CODING_AGENTS.md` to output snippets targeting `reedrich` and `https://reedrich-mcp.lutfidmz.workers.dev/mcp`.
- **Supported Agents**: Claude Code, OpenCode, Pi (`pi-mcp-adapter`), OMP (`.omp/mcp.json`), Cursor (`.cursor/mcp.json`), VS Code (`.vscode/mcp.json`), and Claude Desktop.

### Decision 5: Test Suite Consistency & Zero Regression
- **Choice**: Update all unit tests (`tests/mcp.test.ts`) and end-to-end integration tests (`tests/integration.test.ts`) to assert against `reedrich://` URIs, `reedrich-mcp` issuer, and `rd_live_` key formats.
- **Harness Verification**: Run `npm run typecheck`, `npm test` (unit tests), and `npm run test:local` (D1 local integration) before merging.

### Decision 6: Zero Remote Deletion Invariant
- **Choice**: Rebranding changes are 100% application-level and configuration-level.
- **Safety**: No SQL schema migrations are executed against Cloudflare remote D1; production data is strictly untouched.

## Risks / Trade-offs

- **[Risk] Existing client configs with `finance://` URI scheme**:
  - *Mitigation*: The prompt playbooks and documentation are updated simultaneously. Prompt handlers instruct agents to query `reedrich://` URIs directly.
- **[Risk] Existing JWT tokens signed with old issuer**:
  - *Mitigation*: `verifyUserToken` accepts both old (`eve-finance-mcp`) and new (`reedrich-mcp`) issuers during transition.
- **[Risk] API Key prefix mismatch for existing users**:
  - *Mitigation*: Database stores SHA-256 hashes (`user_api_key_hash`), not raw keys. Both `fp_live_` and `rd_live_` keys hash and verify identically.
