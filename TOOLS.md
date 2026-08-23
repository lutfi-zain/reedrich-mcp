# MCP Server Specification - Reedrich Database Tools

This document specifies the **Model Context Protocol (MCP)** server architecture, tools, and resource definitions for interacting with the **Reedrich SQLite Database**. 

If you are extending this project into a standalone MCP server (or integrating with Claude Desktop, Antigravity, OpenCode, or any MCP client), this document serves as the authoritative interface contract.

---

## 1. Architecture Overview

- **Protocol**: Model Context Protocol (MCP) over JSON-RPC 2.0 (Streamable HTTP, SSE, or Stdio transport).
- **Backend Database**: Cloudflare D1 (SQLite) with Drizzle ORM and table-prefixed columns (`user_...`, `wallet_...`, `transaction_...`, `category_...`, `budget_...`, `debt_loan_...`).
- **Authentication**: Stateless 15-minute JWT with dual-issuer backward compatibility, persistent API keys (`rd_live_...`), and SHA-256 server-side hashing.
- **Multi-Tenancy**: Built-in Row-Level Security (RLS) ensuring strict isolation across users.

```
┌─────────────────────────┐               ┌─────────────────────────────────┐
│       MCP Client        │               │           MCP Server            │
│ (Claude/OpenCode/Pi/OMP)│  JSON-RPC 2.0 │      (Reedrich MCP Tools)       │
│                         ├──────────────►│                                 │
│  - tools/list           │ Streamable    │  - register_user / login_user   │
│  - tools/call           │ HTTP / SSE    │  - manage_wallet / budget       │
│  - resources/read       │               │  - manage_debt_loan             │
│  - prompts/get          │◄──────────────┤  - record_transaction           │
└─────────────────────────┘               └────────────────┬────────────────┘
                                                           │
                                                           ▼
                                               ┌───────────────────────┐
                                               │ Cloudflare D1: SQLite │
                                               └───────────────────────┘
```

---

## 2. MCP Tools Registry

### 2.1. `register_user`
**Description**: Register a new user account on Reedrich. Generates a server-side UUID, stores SHA-256 hashed API key, signs an ephemeral 15-minute JWT, and evaluates onboarding status.

---

### 2.2. `login_user`
**Description**: Authenticate with an API key (`rd_live_...` or legacy `fp_live_...`). Looks up user via SHA-256 hash, issues fresh 15-minute JWT, and returns live onboarding status.

---

### 2.3. `record_transaction`
**Description**: Record a financial transaction (income or expense) with optional admin fee and automatic atomic wallet balance synchronization. Requires at least one wallet to exist.

---

### 2.4. `transfer_funds`
**Description**: Transfer money between two wallets with optional admin fees and atomic dual-wallet balance adjustment. Requires at least two wallets to exist.

---

### 2.5. `update_transaction`
**Description**: Update transaction amount, admin fee, category, budget, memo, or planned status with automatic wallet balance reconciliation.

---

### 2.6. `manage_wallet`
**Description**: Create a new wallet, list all wallets for the authenticated user, or update wallet balance and details.

---

### 2.7. `manage_category`
**Description**: Create a custom expense/income category, list categories, or bulk-seed 10 standard default categories (`action: "seed_defaults"`).

---

### 2.8. `manage_budget`
**Description**: Create, list, or check spending utilization status against active monthly budgets.

---

### 2.9. `manage_debt_loan`
**Description**: Manage personal debts (*hutang* / payable) and loans given (*piutang* / receivable). Supports creating debts/loans, listing with status/type filters, full/partial repayments, and wallet sync.

---

### 2.10. `list_transactions`
**Description**: Query transactions with structured filters (wallet, category, budget, date range, transfer filters, pagination).

---

### 2.11. `financial_summary`
**Description**: Generate a comprehensive financial summary covering total net worth, liquid balances, total savings, admin fees, category breakdown, total debt, and total receivable.

---

### 2.12. `submit_feedback`
**Description**: Submit user feedback, bug reports, or feature requests directly to GitHub Issues on `lutfi-zain/reedrich-mcp`.

---

## 3. MCP Resources Schema

An MCP server for Reedrich exposes the following URI resources:

| Resource URI | MIME Type | Description |
|---|---|---|
| `reedrich://db/schema` | `application/json` | Returns database DDL schema and table structures |
| `reedrich://wallets/list` | `application/json` | Returns current list of active wallets & balances |
| `reedrich://budgets/active` | `application/json` | Returns currently active budgets and utilization |
| `reedrich://debts/active` | `application/json` | Returns currently active/unpaid debts & loans with summary totals |

---

## 4. MCP Prompts (Workflow Playbooks)

| Prompt Name | Arguments | Description |
|---|---|---|
| `onboarding_assistant` | `currency?` | Interactive step-by-step guidance for setting up initial wallets and standard categories |
| `daily_briefing` | `date?` | Structured daily briefing compiling balances, active budget limits, and due debts |
| `financial_planning` | `goal_description`, `target_amount` | Deterministic mathematical timeline projection for achieving financial goals |
| `debt_loan_advisor` | (none) | Strategy and prioritization guide for personal liabilities and receivables |

---

## 5. MCP Server Implementation Code Snippet

To run this as a standalone MCP server using `@modelcontextprotocol/sdk`:

```ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  { name: "reedrich-mcp", version: "1.0.0" },
  { capabilities: { tools: {}, resources: {}, prompts: {} } }
);

// Register tools, resources, and prompts handlers...
```
