## Why

The Reedrich MCP server provides deterministic personal finance tools on Cloudflare Workers, but currently requires manual MCP configuration across different agent environments. Adding first-class Claude Code Plugin and Claude Desktop support allows developers and users to install Reedrich directly into Claude Code via `/plugin install` and leverage automated AI skills (onboarding, daily briefing, financial planning, and debt repayment advisory) natively within their chat sessions.

## What Changes

- Add `.claude-plugin/plugin.json`: Official Claude Code Plugin manifest specifying immutable plugin identity, version, metadata, and remote MCP HTTP endpoint binding (`https://reedrich-mcp.lutfidmz.workers.dev/mcp`).
- Add `.claude-plugin/marketplace.json`: Self-hosted marketplace descriptor allowing direct installation from `lutfi-zain/reedrich-mcp` via `/plugin marketplace add`.
- Add Claude Code Skills under `skills/`:
  - `skills/reedrich-onboarding/SKILL.md`: Guided wallet and category initialization workflow with default seeding.
  - `skills/reedrich-daily-briefing/SKILL.md`: Daily financial digest covering net worth, budget utilization, and upcoming debt/loan due dates.
  - `skills/reedrich-financial-planner/SKILL.md`: Mathematical goal feasibility analysis and savings timeline projection.
  - `skills/reedrich-debt-advisor/SKILL.md`: Debt repayment prioritization (Avalanche/Snowball) and loan collection management.
- Add `docs/CLAUDE_PLUGIN.md`: Comprehensive installation and configuration guide for Claude Code CLI and Claude Desktop (`claude_desktop_config.json`).
- Update `package.json` with plugin metadata, tags, and script shortcuts.

## Capabilities

### New Capabilities
- `claude-plugin`: Claude Code plugin manifest, marketplace catalog, modular skill definitions, and Claude Desktop integration guidelines.

### Modified Capabilities
<!-- None: existing MCP tools, database schemas, and endpoints remain unchanged and backward-compatible. -->

## Impact

- **Developer Experience**: Claude Code users can install Reedrich in one command (`/plugin marketplace add lutfi-zain/reedrich-mcp` and `/plugin install reedrich-finance@reedrich-marketplace`).
- **Claude Desktop Support**: Clear step-by-step configuration for desktop users with copy-pasteable JSON snippets.
- **Agent Interactivity**: Claude automatically recognizes personal finance trigger phrases and executes domain-specific skills with progressive disclosure.
- **Zero Breaking Changes**: Existing MCP endpoints (`/mcp`, `/sse`) and tools continue to function identically across other clients (OMP, OpenCode, Pi, Cursor).

## Non-Goals

- Modifying the underlying Cloudflare Worker routing or D1 database schema.
- Creating a local Node.js stdio daemon (remote HTTP Cloudflare Workers endpoint remains the primary transport).
- Altering core authentication algorithms or token expiration rules.
