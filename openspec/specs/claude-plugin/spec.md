# claude-plugin Specification

## Purpose

Defines the packaging, manifest schemas, marketplace discovery, and modular AI skill behaviors required to distribute Reedrich as a native Claude Code Plugin and Claude Desktop connector.

## Requirements

### Requirement: Claude Code Plugin Manifest Specification
The repository SHALL provide a valid, immutable plugin manifest located at `.claude-plugin/plugin.json`. The manifest MUST contain required plugin metadata fields (`name`, `version`, `description`, `author`, `repository`, `homepage`, `license`, `keywords`) and configure the `mcpServers` object targeting the production Cloudflare Workers HTTP endpoint (`https://reedrich-mcp.lutfidmz.workers.dev/mcp`).

#### Scenario: Plugin Manifest Discovery and Loading
- **GIVEN** a Claude Code CLI session
- **WHEN** the plugin is loaded via `--plugin-dir .` or installed from a marketplace
- **THEN** Claude Code SHALL parse `.claude-plugin/plugin.json`, register the `reedrich-finance` plugin namespace, and establish the remote HTTP MCP server connection to `https://reedrich-mcp.lutfidmz.workers.dev/mcp`.

#### Scenario: Environment Variable Authorization Header Resolution
- **GIVEN** a user running Claude Code with an optional `REEDRICH_API_KEY` environment variable
- **WHEN** Claude Code issues tool calls to the `reedrich` MCP server
- **THEN** the client SHALL attach `Authorization: Bearer ${REEDRICH_API_KEY}` if set, or proceed with unauthenticated MCP tools (`register_user`, `login_user`) for in-session authentication.

---

### Requirement: Self-Hosted Marketplace Catalog
The repository SHALL provide a self-hosted marketplace manifest at `.claude-plugin/marketplace.json` enabling direct repository installation without requiring upstream marketplace submission.

#### Scenario: Direct Marketplace Addition and Plugin Installation
- **GIVEN** a developer using Claude Code CLI
- **WHEN** the user executes `/plugin marketplace add lutfi-zain/reedrich-mcp` followed by `/plugin install reedrich-finance@reedrich-marketplace`
- **THEN** Claude Code SHALL register the marketplace and successfully install `reedrich-finance` referencing the root directory plugin manifest.

---

### Requirement: Modular Claude Code Skills
The plugin SHALL expose four dedicated domain skills under `skills/<skill-name>/SKILL.md`:
1. `reedrich-onboarding`: Guided account initialization, wallet setup, and standard category seeding.
2. `reedrich-daily-briefing`: Comprehensive financial status compilation aggregating liquid assets, budget utilization, and upcoming debt/loan deadlines.
3. `reedrich-financial-planner`: Deterministic goal projection and savings timeline feasibility calculations.
4. `reedrich-debt-advisor`: Debt prioritization strategy (Avalanche vs. Snowball) and loan collection management.

Each skill MUST contain valid YAML frontmatter specifying `name` and a trigger-rich `description`, followed by imperative instructions directing Claude to execute the corresponding MCP tools and resources.

#### Scenario: Automatic Onboarding Skill Invocation
- **GIVEN** a newly registered user or an account with `onboarding.isComplete: false`
- **WHEN** the user triggers onboarding via `/reedrich-onboarding` or asks "How do I set up my Reedrich wallets and categories?"
- **THEN** Claude SHALL activate `reedrich-onboarding`, inspect current onboarding status, prompt the user for initial wallet details (`manage_wallet`), and offer to seed default categories (`manage_category` with `action: "seed_defaults"`).

#### Scenario: Daily Briefing Skill Invocation
- **GIVEN** an authenticated user with active transactions, budgets, and debts
- **WHEN** the user runs `/reedrich-daily-briefing` or asks "Give me my daily financial update"
- **THEN** Claude SHALL activate `reedrich-daily-briefing`, read resources `reedrich://wallets/list`, `reedrich://budgets/active`, and `reedrich://debts/active`, call tool `financial_summary`, and produce a structured Markdown briefing.

#### Scenario: Financial Planning Goal Projection Invocation
- **GIVEN** an authenticated user inquiring about a future purchase (e.g. "When can I afford a $1,500 laptop?")
- **WHEN** the user runs `/reedrich-financial-planner` or asks about savings timelines
- **THEN** Claude SHALL activate `reedrich-financial-planner`, gather current monthly surplus from `financial_summary`, evaluate debt obligations from `reedrich://debts/active`, and calculate the deterministic milestone date.

#### Scenario: Debt and Loan Advisory Invocation
- **GIVEN** an authenticated user with active liabilities or receivables
- **WHEN** the user runs `/reedrich-debt-advisor` or asks "How should I pay off my debts?"
- **THEN** Claude SHALL activate `reedrich-debt-advisor`, inspect active debts via `reedrich://debts/active` and `manage_debt_loan`, and construct an optimal debt elimination plan.

---

### Requirement: Claude Desktop and Agent Integration Documentation
The repository SHALL provide a comprehensive guide at `docs/CLAUDE_PLUGIN.md` detailing:
1. Claude Code marketplace and local plugin installation instructions.
2. Claude Desktop manual configuration via `claude_desktop_config.json` with HTTP transport.
3. In-chat authentication lifecycle (`register_user` and `login_user`) without external dependencies.

#### Scenario: Claude Desktop Configuration Validation
- **GIVEN** a Claude Desktop user following `docs/CLAUDE_PLUGIN.md`
- **WHEN** the user copies the provided JSON snippet into `claude_desktop_config.json`
- **THEN** Claude Desktop SHALL connect to the remote Reedrich MCP server and list all 12 tools, 4 resources, and 4 prompts.
