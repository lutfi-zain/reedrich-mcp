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
  - `submit_feedback`: Submit user feedback, bug reports, questions, or feature requests → directly recorded in Cloudflare D1 internal database with submitter tracking.
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

## 🔐 Stateless OAuth 2.1 for Perplexity & ChatGPT (RFC 8414/9728, PKCE S256)

Reedrich MCP now exposes **100% stateless** OAuth discovery and token endpoints for **Perplexity Pro Connectors** and **ChatGPT Custom Actions** (Streamable HTTP `/mcp` with RFC 9728 protected-resource discovery). All state is encoded in **HMAC-SHA256 JWTs** via Web Crypto — **zero D1 tables, zero D1 writes, zero KV/DO**.

> **Backward Compatibility:** Existing `Authorization: Bearer rd_live_...` / `fp_live_...` and 15-minute `reedrich-mcp` JWTs remain fully functional on `/mcp` and `/sse` alongside new OAuth access tokens. No migration required.

### Discovery (Public, `Cache-Control: public, max-age=3600`)

```bash
# Authorization Server Metadata (RFC 8414)
curl https://reedrich-mcp.lutfidmz.workers.dev/.well-known/oauth-authorization-server
# -> { issuer, authorization_endpoint, token_endpoint, registration_endpoint,
#      scopes_supported: ["mcp"], response_types_supported: ["code"],
#      grant_types_supported: ["authorization_code","refresh_token"],
#      code_challenge_methods_supported: ["S256"],
#      token_endpoint_auth_methods_supported: ["none","client_secret_basic","client_secret_post"],
#      revocation_endpoint }

# Protected Resource Metadata (RFC 9728)
curl https://reedrich-mcp.lutfidmz.workers.dev/.well-known/oauth-protected-resource
# -> { resource: "https://<host>/mcp", authorization_servers: ["https://<host>"],
#      scopes_supported: ["mcp"], bearer_methods_supported: ["header"], resource_name: "Reedrich MCP" }

# OpenID Discovery Alias
curl https://reedrich-mcp.lutfidmz.workers.dev/.well-known/openid-configuration
```

All `/.well-known/*` endpoints are **public** (ignore `Authorization` header), support `OPTIONS` `204` with `Access-Control-Allow-Origin: *`, and reflect the request `Host` dynamically (`new URL(c.req.url).origin` — no hard-coded domain).

### Dynamic Client Registration (RFC 7591, Stateless)

```bash
# Public client (Perplexity) — no secret
curl -X POST https://reedrich-mcp.lutfidmz.workers.dev/oauth/register \
  -H "Content-Type: application/json" \
  -d '{"client_name":"Perplexity","redirect_uris":["https://perplexity.ai/oauth/callback"],"grant_types":["authorization_code","refresh_token"],"response_types":["code"],"token_endpoint_auth_method":"none"}'
# -> 201 { client_id: "550e8400-...", client_id_issued_at: 1234567890,
#          redirect_uris, grant_types, response_types, scope: "mcp",
#          token_endpoint_auth_method: "none" }   # no client_secret

# Confidential client (ChatGPT) — HMAC-derived secret (43 chars, 256-bit)
curl -X POST https://reedrich-mcp.lutfidmz.workers.dev/oauth/register \
  -H "Content-Type: application/json" \
  -d '{"client_name":"ChatGPT","redirect_uris":["https://chat.openai.com/aip/callback"],"token_endpoint_auth_method":"client_secret_basic"}'
# -> 201 { client_id, client_secret: "Na71QEn2...", client_secret_expires_at: 0, ... }
# client_secret is deterministic: HMAC-SHA256(JWT_SECRET, "oauth:client-secret:"+clientId) + base64url
# Verification is stateless via re-derivation + constant-time compare — zero D1 writes.
```

Validation: `redirect_uris` must be `https` (or `http://localhost`/`http://127.0.0.1` loopback), `grant_types` ⊆ `["authorization_code","refresh_token"]`, `response_types` ⊆ `["code"]`, `token_endpoint_auth_method` ∈ `["none","client_secret_basic","client_secret_post"]`. Defaults: `grant_types` → `["authorization_code","refresh_token"]`, `response_types` → `["code"]`, `scope` → `"mcp"`.

### Authorization Code + PKCE S256 (5-Minute JWT)

```bash
# 1. Compute challenge (Node) — RFC 7636 Appendix B vector:
# verifier: dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
# challenge: E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM  (BASE64URL(SHA256(verifier)))
node -e "import('node:crypto').then(async m=>{ const v='dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'; const h=await m.subtle.digest('SHA-256', Buffer.from(v)); console.log(Buffer.from(h).toString('base64url')) })"

# 2. Authorize (user must be authenticated via rd_live_ or JWT)
curl -G https://reedrich-mcp.lutfidmz.workers.dev/oauth/authorize \
  --data-urlencode "response_type=code" \
  --data-urlencode "client_id=<client_id>" \
  --data-urlencode "redirect_uri=https://perplexity.ai/oauth/callback" \
  --data-urlencode "scope=mcp" \
  --data-urlencode "state=xyz123" \
  --data-urlencode "code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM" \
  --data-urlencode "code_challenge_method=S256" \
  -H "Authorization: Bearer rd_live_..."
# -> 302 Location: https://perplexity.ai/oauth/callback?code=<JWT 5m>&state=xyz123
# code JWT payload: { sub, client_id, redirect_uri, scope, code_challenge, code_challenge_method:"S256", iss, aud, iat, exp=iat+300, jti }
# Rejects: plain, missing challenge, invalid scope, mismatched redirect_uri (400), unauthenticated (401 login_required)
```

### Token Exchange (15m Access + 30d Refresh, Stateless)

```bash
# Authorization Code Grant (form or JSON lenient)
curl -X POST https://reedrich-mcp.lutfidmz.workers.dev/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&code=<jwt>&redirect_uri=https://perplexity.ai/oauth/callback&client_id=<id>&code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
# Also accepts: Authorization: Basic base64(client_id:client_secret) for confidential clients
# -> 200 { access_token: <JWT 15m>, token_type:"Bearer", expires_in:900, refresh_token: <JWT 30d>, scope:"mcp" }
# access JWT: { sub, client_id, scope, iss, aud, iat, exp=iat+900, jti }
# refresh JWT: { sub, client_id, scope, token_type:"refresh", iss, aud, iat, exp=iat+2592000, jti }

# Refresh Token Grant (rotation, scope narrowing)
curl -X POST https://reedrich-mcp.lutfidmz.workers.dev/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=refresh_token&refresh_token=<refresh_jwt>&client_id=<id>&scope=mcp"
# -> 200 { access_token: <new 15m>, refresh_token: <new 30d rotated>, scope }
# Rejects: broader scope (400 invalid_scope), expired/mismatched client (400 invalid_grant), access_token as refresh (400), wrong secret (401 invalid_client + WWW-Authenticate: Basic)

# Revocation (stateless best-effort, always 200)
curl -X POST https://reedrich-mcp.lutfidmz.workers.dev/oauth/revoke \
  -d "token=<refresh_jwt>&token_type_hint=refresh_token"
# -> 200 {}  (expiry-based revocation; revoked token remains valid until exp — documented)
```

### Protected Resource Gate (`/mcp`, `/sse`)

```bash
# Unauthenticated -> 401 with RFC 9728 WWW-Authenticate
curl -i -X POST https://reedrich-mcp.lutfidmz.workers.dev/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
# <- 401 WWW-Authenticate: Bearer resource_metadata="https://<host>/.well-known/oauth-protected-resource", error="invalid_token"
#    { error:"invalid_token", error_description:"Authentication required" }
#    Cache-Control: no-store, Pragma: no-cache, Access-Control-Allow-Origin: *

# Valid OAuth, rd_live_, or legacy JWT -> 200 MCP
curl -X POST https://reedrich-mcp.lutfidmz.workers.dev/mcp \
  -H "Authorization: Bearer <oauth_access_token>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"manage_wallet","arguments":{"action":"list"}}}'
# Also: Authorization: Bearer rd_live_...  or  Bearer <legacy reedrich-mcp JWT>
```

`resource_metadata` reflects the request `Host` (`https://<host>/.well-known/oauth-protected-resource`), enabling custom domains and `workers.dev` without config.

### Cryptographic Invariants

- **Zero Storage:** No `oauth_*` D1 tables, no KV/DO/R2, no new migrations. All codes/tokens are HMAC-SHA256 JWTs (`hono/jwt` + Web Crypto).
- **Lifetimes:** `T_code=300s` (5m), `T_access=900s` (15m), `T_refresh=2592000s` (30d), `CLOCK_SKEW=60s`.
- **PKCE:** `code_challenge = BASE64URL(SHA256(ASCII(verifier)))`, `43 ≤ len ≤ 128`, alphabet `A-Za-z0-9-._~`, constant-time compare.
- **Client Secret:** `HMAC-SHA256(JWT_SECRET, "oauth:client-secret:"+clientId)` → base64url (43 chars, 256-bit); verified via re-derivation.

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

