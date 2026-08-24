## 1. Claude Plugin Manifest & Marketplace Scaffold

- [x] 1.1 Create `.claude-plugin/plugin.json` manifest with official Anthropic metadata, immutable `reedrich-finance` slug, and remote MCP HTTP endpoint binding (`https://reedrich-mcp.lutfidmz.workers.dev/mcp`).
- [x] 1.2 Create `.claude-plugin/marketplace.json` self-hosted catalog enabling direct Git repository installation via `/plugin marketplace add`.

## 2. Claude Code Domain Skills

- [x] 2.1 Create `skills/reedrich-onboarding/SKILL.md` with trigger-rich YAML frontmatter and step-by-step wallet creation and category default seeding instructions.
- [x] 2.2 Create `skills/reedrich-daily-briefing/SKILL.md` aggregating balances, budget utilization percentages, and due debt/loan obligations into a structured summary.
- [x] 2.3 Create `skills/reedrich-financial-planner/SKILL.md` providing mathematical goal timeline projections and savings feasibility calculations.
- [x] 2.4 Create `skills/reedrich-debt-advisor/SKILL.md` guiding users through Avalanche/Snowball debt payoff strategies and receivable tracking.

## 3. Documentation & Verification

- [x] 3.1 Create `docs/CLAUDE_PLUGIN.md` covering Claude Code CLI `/plugin` installation, Claude Desktop `claude_desktop_config.json` configuration, and in-chat authentication.
- [x] 3.2 Update `README.md` and `package.json` with Claude Plugin badges, installation shortcuts, and marketplace documentation.
- [x] 3.3 Validate `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` JSON syntax and verify `npm run typecheck && npm test`.
