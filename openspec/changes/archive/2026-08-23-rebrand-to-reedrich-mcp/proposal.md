## Why

The project is evolving from a standard financial tracker (*"Eve Finance / finnplan-mcp"*) into a specialized, edge-native financial intelligence and deterministic planning engine for AI agents. 

Inspired by the comic book lore of **Reed Richards (Mister Fantastic)**—whose true superpower is hyper-cognitive mathematics, multidimensional projection, and the quest to *"Solve Everything"*—the project is rebranding to **`reedrich-mcp`** (*"Reedrich: Give Your AI Agent Mathematical Superpowers for Personal Wealth"*).

This rebranding clarifies product positioning, eliminates naming collisions (avoiding confusion with generic e-readers/RSS apps), aligns MCP resource URIs (`reedrich://...`), standardizes token issuers, updates coding agent snippet generators, and creates a distinctive, memorable identity.

## What Changes

- **Project & Package Identity**:
  - `package.json`: Rename package to `reedrich-mcp` with updated description and repository metadata.
  - `wrangler.toml`: Update Worker service name to `reedrich-mcp`.
- **MCP Server Protocol & Resources**:
  - `src/mcp.ts`: Update Server constructor name to `reedrich-mcp` (v1.0.0).
  - **BREAKING** Resource URIs: Migrate scheme from `finance://` to `reedrich://` (`reedrich://db/schema`, `reedrich://wallets/list`, `reedrich://budgets/active`, `reedrich://debts/active`).
  - Update MCP Prompts playbooks (`onboarding_assistant`, `daily_briefing`, `financial_planning`, `debt_loan_advisor`) to reference `reedrich://` URIs and adopt the Reedrich persona.
- **Authentication & Token Claims**:
  - `src/utils/token.ts`: Update `TOKEN_ISSUER` to `'reedrich-mcp'` and `TOKEN_AUDIENCE` to `'reedrich-client'`.
  - API Key Prefix: Update generation prefix from `fp_live_` to `rd_live_` while preserving SHA-256 hashing and lookup mechanisms.
- **Coding Agent Snippets & Configs**:
  - `scripts/agent-snippet.ts`: Update CLI snippet generator with `reedrich` server name, `https://reedrich-mcp.lutfidmz.workers.dev/mcp` endpoint, and `rd_live_` token examples.
  - `docs/CODING_AGENTS.md`: Full rebranding of integration guides for Claude Code, OpenCode, Pi, OMP, Cursor, and VS Code.
  - `examples/agents/`: Update `claude-code.json`, `cursor-vscode.json`, `omp.mcp.json`, `opencode.json`, and `pi.mcp.json`.
  - `.mcp.json` & `.omp/mcp.json`: Update server key from `eve-finance` / `finnplan` to `reedrich`.
- **Test Suites & Automation Harness**:
  - `tests/mcp.test.ts` & `tests/integration.test.ts`: Update all assertions for `reedrich://` URIs, token issuers, and key prefixes.
  - `scripts/run-local-integration.sh` & `scripts/run-integration.sh`: Update script banners and default worker URLs.
- **Documentation & OpenSpec**:
  - `README.md` & `TOOLS.md`: Full rebranding with Reedrich mathematical superhero theme, architecture diagram, and feature catalog.
  - `openspec/config.yaml`: Update project identity and domain context.

## Capabilities

### Modified Capabilities
- `debt-loan-management`: Migrate active debt resource URI from `finance://debts/active` to `reedrich://debts/active`.
- `mcp-prompts`: Migrate prompt templates and resource references from `finance://` to `reedrich://` and server capability identifier.
- `onboarding`: Update prompt suggestions and tool references under the Reedrich server identity.

## Impact

- **MCP Clients**: Clients reading `finance://` resources must migrate to `reedrich://`.
- **Worker URL**: Cloudflare Worker endpoint changes from `finnplan-mcp.lutfidmz.workers.dev` to `reedrich-mcp.lutfidmz.workers.dev`.
- **Dependencies**: Zero new runtime dependencies; relies strictly on existing Cloudflare Workers + D1 + Drizzle ORM + `@modelcontextprotocol/sdk`.
- **Security & Data**: Existing SQLite D1 schema and production rows remain 100% intact (zero database wipes or column deletions).
