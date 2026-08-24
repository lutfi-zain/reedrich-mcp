## Context

See `proposal.md` for motivation.

The Reedrich MCP server runs as a stateless Cloudflare Worker exposing 12 tools, 4 resources, and 4 prompts over Web Standard Streamable HTTP (`/mcp` and `/sse`). Claude Code now provides a formal plugin specification (`.claude-plugin/plugin.json`, `marketplace.json`, and `skills/`) that packages MCP server connections alongside automated agent skills and slash commands.

## Goals / Non-Goals

**Goals:**
- Provide an Anthropic-compliant `.claude-plugin/plugin.json` manifest binding the remote Cloudflare Worker HTTP endpoint.
- Provide a self-hosted `.claude-plugin/marketplace.json` catalog enabling direct Git-based installation (`/plugin marketplace add lutfi-zain/reedrich-mcp`).
- Define four modular, trigger-rich Claude Code skills under `skills/` that translate Reedrich workflows into guided AI agent execution.
- Create clear integration documentation for both Claude Code CLI and Claude Desktop (`claude_desktop_config.json`).

**Non-Goals:**
- Modifying Cloudflare Worker runtime code, Drizzle schemas, or D1 database migrations.
- Building a local Node.js stdio bridge executable (remote HTTP is the primary transport).
- Changing tool names, input schemas, or authentication protocols.

## Decisions

### 1. Remote HTTP Endpoint Binding as Default
*Decision*: Configure `plugin.json` to connect directly to the deployed Cloudflare Worker at `https://reedrich-mcp.lutfidmz.workers.dev/mcp` with optional `${REEDRICH_API_KEY}` header injection.
*Rationale*: Eliminates local dependencies (no Node runtime, Wrangler, or SQLite binaries required on user machines). Fast, zero-maintenance setup across macOS, Linux, and Windows.
*Alternatives Considered*: Local stdio server via `wrangler dev` (rejected: adds Node.js/Wrangler prerequisites and port conflicts).

### 2. Self-Hosted Marketplace Catalog (`marketplace.json`)
*Decision*: Include `.claude-plugin/marketplace.json` mapping `reedrich-finance` to the local repository root (`./`).
*Rationale*: Enables immediate distribution and testing via `/plugin marketplace add lutfi-zain/reedrich-mcp` without waiting for upstream Anthropic marketplace PR approvals.

### 3. Prefixed Domain Skills (`reedrich-*`)
*Decision*: Name the four skills with the `reedrich-` prefix:
- `skills/reedrich-onboarding/SKILL.md`
- `skills/reedrich-daily-briefing/SKILL.md`
- `skills/reedrich-financial-planner/SKILL.md`
- `skills/reedrich-debt-advisor/SKILL.md`
*Rationale*: Prevents name collisions with other installed financial skills in Claude Code while clearly establishing the Reedrich brand and domain scope.

### 4. Progressive Disclosure & Trigger Architecture in `SKILL.md`
*Decision*: Each `SKILL.md` uses rich YAML frontmatter descriptions with trigger phrases (e.g. "financial plan", "afford purchase", "daily briefing", "budget status", "debt payoff") and structured Markdown instructions referencing MCP tools (`manage_wallet`, `manage_category`, `manage_budget`, `manage_debt_loan`, `record_transaction`, `financial_summary`) and resources (`reedrich://wallets/list`, `reedrich://budgets/active`, `reedrich://debts/active`).
*Rationale*: Enables both explicit slash-command execution (e.g. `/reedrich-daily-briefing`) and implicit natural-language triggering during normal user chats.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CLAUDE HOST RUNTIME                              │
│                                                                             │
│  ┌───────────────────────────┐         ┌─────────────────────────────────┐  │
│  │   Claude Code Skills      │         │     Claude Desktop / Connect    │  │
│  │ (skills/reedrich-*)       │         │ (claude_desktop_config.json)    │  │
│  └─────────────┬─────────────┘         └────────────────┬────────────────┘  │
│                │                                        │                   │
│                └───────────────────┬────────────────────┘                   │
│                                    ▼                                        │
│                     ┌─────────────────────────────┐                         │
│                     │  .claude-plugin/plugin.json │                         │
│                     │  (HTTP Transport Connector) │                         │
│                     └──────────────┬──────────────┘                         │
└────────────────────────────────────┼────────────────────────────────────────┘
                                     │ JSON-RPC 2.0 (Streamable HTTP / SSE)
                                     ▼
                      ┌─────────────────────────────┐
                      │ Cloudflare Workers Runtime  │
                      │ (reedrich-mcp.workers.dev)  │
                      └──────────────┬──────────────┘
                                     │
                                     ▼
                      ┌─────────────────────────────┐
                      │    Cloudflare D1 (SQLite)   │
                      └─────────────────────────────┘
```

## Risks / Trade-offs

- **[Network Connectivity Dependency]** -> Requires internet access to reach the Cloudflare Workers endpoint. Mitigation: Cloudflare Workers edge network provides sub-50ms global latency and 99.99% uptime.
- **[Ephemeral JWT Session Expiration]** -> 15-minute JWT tokens expire. Mitigation: Skills include explicit fallback instructions guiding Claude to call `login_user` with the user's persistent `rd_live_...` API key when token expiration occurs.
- **[Plugin Schema Drift]** -> Claude Code plugin manifest schema may evolve. Mitigation: Follow strict Anthropic official manifest reference (`manifest-reference.md`) with minimal required fields and valid semantic versioning.
