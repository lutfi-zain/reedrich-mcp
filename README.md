# Reedrich MCP Server (Cloudflare Workers + D1)

Stateless Model Context Protocol (MCP) server for personal finance & deterministic wealth planning, inspired by **Reed Richards (Mister Fantastic)**—giving AI Agents mathematical superpowers to project, optimize, and solve user finances on **Cloudflare Workers** with **Cloudflare D1** (SQLite) and **Drizzle ORM**.

---

## 🚀 Features

- **Stateless HTTP Transport**: Implements Web Standard Streamable HTTP & SSE (`/mcp` and `/sse`) via `@modelcontextprotocol/sdk`.
- **Pure MCP-Native Authentication**: Register and login directly using MCP tools (`register_user` & `login_user`) without external REST endpoints.
- **15-Minute Self-Contained JWT**: Cryptographic token verification with **zero database queries** required for auth on finance tool calls.
- **Multi-Tenant Row-Level Security (RLS)**: Automatically isolates user data via `userId` extracted directly from JWT token payload.
- **12 MCP Tools**:
  - `register_user`: Register with `firstName`, `lastName`, `email`, and `whatsappNumber` (with country code `+...`) → returns persistent `apiKey` (`rd_live_...`), 15-minute JWT, and dynamic `onboarding` status.
  - `login_user`: Authenticate with `apiKey` → returns fresh 15-minute JWT and dynamic `onboarding` status.
  - `submit_feedback`: Submit user feedback, bug reports, or feature requests → automatically creates a formatted GitHub Issue on `lutfi-zain/reedrich-mcp`.
  - `manage_wallet`: Create, list, update wallets.
  - `manage_category`: Create, list, and bulk-seed standard expense and income categories (`action: "seed_defaults"`).
  - `manage_budget`: Create, list, and compute real-time budget utilization status.
  - `manage_debt_loan`: Manage debts (*hutang*) and loans given (*piutang*), counterparty tracking, full/partial repayments, and wallet sync.
  - `record_transaction`: Record income/expenses with optional admin fee, automatic atomic wallet balance sync, and walletless guardrails.
  - `transfer_funds`: Transfer money between wallets with optional admin fees, atomic dual-wallet balance adjustment, and walletless guardrails.
  - `update_transaction`: Update transactions (amount, fee, wallet, category, budget, date, memo, planned status) with automatic balance reconciliation.
  - `list_transactions`: Dynamic filtering across date ranges, wallets, categories, budgets, and planning status.
  - `financial_summary`: Aggregate net worth, income, expense, savings, admin fees, category breakdowns, total debt, and total receivable.
- **4 MCP Resources**:
  - `reedrich://db/schema`: Database schema and relationship documentation.
  - `reedrich://wallets/list`: Live list of authenticated user wallets and balances.
  - `reedrich://budgets/active`: Current active budgets with spending utilization percentages.
  - `reedrich://debts/active`: Active liabilities and receivables with total remaining balances.
- **4 MCP Prompts (AI Workflow Playbooks)**:
  - `onboarding_assistant`: Step-by-step guidance for setting up initial wallets and standard categories.
  - `daily_briefing`: Comprehensive financial health overview (balances, active budgets, upcoming debt/loan due dates).
  - `financial_planning`: Goal timeline projection (e.g. "Kapan bisa beli laptop Rp 15jt?") with deterministic math based on net savings and debt commitments.
  - `debt_loan_advisor`: Prioritization and repayment strategy for active debts and loan collections.

---
## ⚡ Quick Install: Claude Code Plugin & Desktop

Install Reedrich directly in **Claude Code CLI** or connect with **Claude Desktop**:

### Claude Code Plugin (One-Command Install):
```bash
/plugin marketplace add lutfi-zain/reedrich-mcp
/plugin install reedrich-finance@reedrich-marketplace
```

### Claude Desktop (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "reedrich": {
      "type": "http",
      "url": "https://reedrich-mcp.lutfidmz.workers.dev/mcp"
    }
  }
}
```

👉 **Full Claude Plugin Guide & Slash Commands**: See [docs/CLAUDE_PLUGIN.md](docs/CLAUDE_PLUGIN.md).

---


## 🔄 Authentication & Onboarding Workflow via MCP

1. **Register User via MCP Tool**:
   Call tool `register_user`:
   ```json
   {
     "firstName": "Budi",
     "lastName": "Setiawan",
     "email": "budi@example.com",
     "whatsappNumber": "+6281234567890"
   }
   ```
   **Response:**
   ```json
   {
     "userId": "usr_k8f9a2...",
     "name": "Budi Setiawan",
     "email": "budi@example.com",
     "whatsappNumber": "+6281234567890",
     "apiKey": "rd_live_8f3d9b2c...",
     "token": "eyJhbGciOi...",
     "tokenType": "Bearer",
     "expiresIn": 900,
     "onboarding": {
       "isComplete": false,
       "needs": ["wallet", "categories"],
       "suggestions": ["budget"],
       "message": "Please set up: wallet, categories. Use the onboarding_assistant prompt for guidance."
     }
   }
   ```

2. **Seed Default Categories (On User Confirmation)**:
   Call tool `manage_category` with `action: "seed_defaults"`:
   ```json
   {
     "action": "seed_defaults"
   }
   ```
   Populates 10 standard categories: Makanan & Minuman 🍔, Transportasi 🚗, Belanja 🛍️, Tagihan & Utilitas 💡, Hiburan 🎬, Kesehatan 💊, Gaji 💼, Investasi & Bunga 📈, Usaha / Freelance 💻, Pemasukan Lainnya 🎁.

3. **Call Finance Tools**:
   Set `Authorization: Bearer <token>` or `Authorization: Bearer <apiKey>` in your MCP client headers to execute `manage_wallet`, `record_transaction`, etc.

4. **Re-Login when Token Expires (after 15 minutes)**:
   When a token expires, call tool `login_user`:
   ```json
   {
     "apiKey": "rd_live_8f3d9b2c..."
   }
   ```
   **Response:** Fresh 15-minute JWT token with live `onboarding` status.

---

## 🛠️ Project Setup & Local Development

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Tests
Runs the complete test suite covering all 12 tools, 4 resources, 4 prompts, RLS tenant isolation, input validations, and pure MCP lifecycle:
```bash
npm test
```

### 3. Type Checking & Build Dry-Run
```bash
npm run typecheck
npm run build
```

---

## 🤖 Coding Agents Quick Start (Claude Code, OpenCode, Pi, OMP)

Connect Reedrich MCP to your AI coding agents in seconds. For comprehensive configuration and example prompts, see the **[Coding Agents Setup Guide](docs/CODING_AGENTS.md)**.

### 1. Claude Code
```bash
claude mcp add --transport http reedrich https://reedrich-mcp.lutfidmz.workers.dev/mcp
```

### 2. OpenCode
In `opencode.json`:
```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "reedrich": {
      "type": "remote",
      "url": "https://reedrich-mcp.lutfidmz.workers.dev/mcp"
    }
  }
}
```

### 3. Pi (`pi-mcp-adapter`)
```bash
# 1. Install adapter
pi install npm:pi-mcp-adapter

# 2. Add to .mcp.json
{
  "mcpServers": {
    "reedrich": {
      "url": "https://reedrich-mcp.lutfidmz.workers.dev/mcp"
    }
  }
}
```

### 4. OMP (Oh My Pi)
In `.omp/mcp.json` or `.mcp.json`:
```json
{
  "$schema": "https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/coding-agent/src/config/mcp-schema.json",
  "mcpServers": {
    "reedrich": {
      "url": "https://reedrich-mcp.lutfidmz.workers.dev/mcp"
    }
  }
}
```

### ⚡ Print Agent Snippets via CLI
```bash
npm run agent:snippet [claude|opencode|pi|omp|all]
```

---

## 💾 Local D1 Setup & Migrations

Apply migrations to your local D1 database:

```bash
# 1. Execute database migrations locally
npx wrangler d1 execute finance_db --local --file=./drizzle/0002_table_prefixed_schema_and_tz.sql
npx wrangler d1 execute finance_db --local --file=./drizzle/0003_add_debts_loans.sql

# 2. Start local development server
npm run dev
```

---

## 🔌 Connecting with MCP Clients

- **Endpoint**: `http://localhost:8787/mcp` (or your deployed `https://reedrich-mcp.lutfidmz.workers.dev/mcp`)
- **Initial Connection**: No headers required to call `register_user` or `login_user`.
- **Authenticated Calls**:
  ```json
  {
    "Authorization": "Bearer <YOUR_15_MIN_JWT_TOKEN_OR_rd_live_API_KEY>"
  }
  ```

---

## 🚢 Production Deployment

```bash
# 1. Set your production JWT secret (if not set)
npx wrangler secret put JWT_SECRET

# 2. Apply migrations to remote D1 database
npx wrangler d1 execute finance_db --remote --file=./drizzle/0003_add_debts_loans.sql

# 3. Deploy worker
npm run deploy
```

