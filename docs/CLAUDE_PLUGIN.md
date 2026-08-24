# ⚡ Reedrich Plugin for Claude

Turn Claude into a **deterministic personal financial planning and mathematical wealth management agent**. 

Reedrich connects Claude natively to your multi-currency accounts, budgets, debt payoff timelines, and financial goal projections via the **Model Context Protocol (MCP)** and **Claude Code Plugin** architecture.

---

## 🌟 Capabilities

- 🏦 **Multi-Currency Wallets**: Manage bank accounts, e-wallets, cash, and investment portfolios.
- 🍔 **Smart Budgeting**: Monitor real-time spending utilization against dynamic monthly budgets.
- 🛡️ **Debt & Loan Engine**: Track personal debts (*hutang*) and loans given (*piutang*) with Avalanche and Snowball payoff strategies.
- 🎯 **Mathematical Goal Planner**: Deterministic timeline calculations (e.g., *"When can I afford a Rp 15M laptop?"*).
- 📊 **Daily Financial Briefing**: Executive overview of net worth, cash flow, and upcoming obligations.
- 🔐 **Pure MCP Authentication**: Register and login directly inside Claude chat without external REST portals.

---

## 🚀 Option 1: Claude Code CLI Plugin

### Method A: Install via Self-Hosted Marketplace (Recommended)

1. Open your terminal and start a Claude Code session:
   ```bash
   claude
   ```
2. Add the Reedrich marketplace:
   ```bash
   /plugin marketplace add lutfi-zain/reedrich-mcp
   ```
3. Install the Reedrich plugin:
   ```bash
   /plugin install reedrich-finance@reedrich-marketplace
   ```

### Method B: Local Plugin Development & Testing

Clone this repository and launch Claude Code with `--plugin-dir`:
```bash
git clone https://github.com/lutfi-zain/reedrich-mcp.git
cd reedrich-mcp
claude --plugin-dir .
```

---

## 💻 Option 2: Claude Desktop Integration

Connect Claude Desktop (macOS / Windows) directly to the high-performance Cloudflare Workers MCP server.

### 1. Open your Claude Desktop Configuration:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

### 2. Add the `reedrich` MCP Server:
```json
{
  "mcpServers": {
    "reedrich": {
      "type": "http",
      "url": "https://reedrich-mcp.lutfidmz.workers.dev/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_REEDRICH_API_KEY_OR_JWT"
      }
    }
  }
}
```
*(Note: If you do not have an API key yet, omit the `headers` block. You can register directly via the `register_user` tool in chat!)*

### 3. Restart Claude Desktop
You will see the 🔨 hammer icon in Claude Desktop displaying 12 tools, 4 resources, and 4 prompts.

---

## 🤖 Claude Code Skills & Slash Commands

Once installed in Claude Code, the following domain skills are available automatically or via slash commands:

| Command / Skill | Trigger Phrases | Description |
| :--- | :--- | :--- |
| `/reedrich-onboarding` | *"set up my finances"*, *"initialize reedrich"*, *"create initial wallet"* | Step-by-step account onboarding, wallet creation, and 10 default category seeding. |
| `/reedrich-daily-briefing` | *"daily briefing"*, *"financial update"*, *"how are my finances today"* | Synthesizes net worth, liquid balances, budget health, and due debt/loan obligations. |
| `/reedrich-financial-planner` | *"when can I buy a laptop"*, *"can I afford a vacation"*, *"financial planning"* | Projects exact milestone dates and multi-scenario savings plans based on monthly net surplus. |
| `/reedrich-debt-advisor` | *"how to pay off debt"*, *"debt snowball vs avalanche"*, *"track loans"* | Evaluates active liabilities and receivables, formulating optimal debt elimination roadmaps. |

---

## 🔑 Authentication Lifecycle

1. **Register in Chat**:
   Tell Claude: *"I want to register a new Reedrich account with Name: [Your Name], Email: [Your Email], WhatsApp: [+628123456789]"*.
   Claude calls `register_user` and receives your persistent API Key (`rd_live_...`) and 15-minute JWT session token.

2. **Persistent API Key**:
   Store your `rd_live_...` key in your environment variable:
   ```bash
   export REEDRICH_API_KEY="rd_live_..."
   ```

3. **In-Session Token Refresh**:
   If your 15-minute session token expires, Claude automatically calls `login_user` with your `rd_live_...` key to issue a fresh token without interrupting your workflow.

---

## 📦 MCP Registry Reference

### Tools (12)
- `register_user`: Register account and generate API key.
- `login_user`: Authenticate with API key.
- `submit_feedback`: Submit bug reports or feature requests to GitHub Issues.
- `manage_wallet`: Create, list, and update wallets.
- `manage_category`: Create categories or seed default presets (`seed_defaults`).
- `manage_budget`: Create and check real-time budget spending utilization.
- `manage_debt_loan`: Manage debts (*hutang*) and loans given (*piutang*), record repayments.
- `record_transaction`: Record income and expenses with automatic wallet balance sync.
- `transfer_funds`: Atomic dual-wallet transfers with optional admin fees.
- `update_transaction`: Update transaction details with automatic balance reconciliation.
- `list_transactions`: Multi-criteria transaction queries.
- `financial_summary`: Multi-currency financial health digest and category breakdowns.

### Resources (4)
- `reedrich://db/schema`: Database schema and relations.
- `reedrich://wallets/list`: Live wallet balances.
- `reedrich://budgets/active`: Active budgets and utilization.
- `reedrich://debts/active`: Active liabilities and receivables.

### Prompts (4)
- `onboarding_assistant`: Account initialization playbook.
- `daily_briefing`: Daily financial health check.
- `financial_planning`: Goal milestone projection engine.
- `debt_loan_advisor`: Debt freedom and loan repayment strategy.
