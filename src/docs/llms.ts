/**
 * Generates the canonical LLM-optimized documentation manifest (/llms.txt and /llm.txt).
 * Formatted per the /llms.txt standard for rapid context ingestion by AI agents and developer copilots.
 */
export function getLlmsTxt(origin: string = "https://reedrich-mcp.lutfidmz.workers.dev"): string {
  return `# Reedrich Financial Intelligence Engine

> High-performance personal finance & deterministic mathematical wealth planning system deployed on Cloudflare Workers edge runtime with serverless Cloudflare D1 (SQLite) and Drizzle ORM.

Reedrich provides two first-class interfaces sharing a unified service layer:
1. **Model Context Protocol (MCP)**: JSON-RPC 2.0 over Streamable HTTP (\`/mcp\`) & SSE (\`/sse\`) for autonomous coding agents (Claude Code, OpenCode, Pi, OMP, Cursor).
2. **REST API (\`/api/v1/*\`)**: High-speed, stateless JSON REST endpoints for Web SPAs (Vite React, Svelte, Vue) and Mobile applications (Flutter, React Native).
3. **Interactive Documentation**: Interactive Scalar API Reference at \`/docs\` (alias \`/reference\`) and OpenAPI 3.0.0 schema at \`/openapi.json\`.

---

## 🌐 Endpoints & Base URLs

| Environment | Base URL | MCP Endpoint | Interactive Docs | OpenAPI 3.0 |
|---|---|---|---|---|
| **Production** | \`${origin}\` | \`${origin}/mcp\` | \`${origin}/docs\` | \`${origin}/openapi.json\` |
| **Local Dev** | \`http://localhost:8787\` | \`http://localhost:8787/mcp\` | \`http://localhost:8787/docs\` | \`http://localhost:8787/openapi.json\` |

---

## 🔐 Authorization Architecture

Reedrich supports 3 authorization methods. All data entities enforce strict multi-tenant Row-Level Security (RLS) scoped to the authenticated \`userId\`.

### Method 1: Persistent API Key (Recommended for Personal Apps & Scripts)
- **Format**: Starts with \`rd_live_\` (or legacy \`fp_live_\`).
- **Lifetime**: Never expires. Hashed via SHA-256 before storage in D1.
- **Header Usage**:
  \`\`\`http
  Authorization: Bearer rd_live_YOUR_API_KEY
  \`\`\`
  *OR*
  \`\`\`http
  X-API-Key: rd_live_YOUR_API_KEY
  \`\`\`
- **MCP In-Tool Fallback**: If headers cannot be sent, pass \`apiKey: "rd_live_..."\` in any tool argument object.

### Method 2: OAuth 2.0 PKCE with Google Login Federation (Recommended for Public Multi-User Apps)
- **Grant Types**: \`authorization_code\` with PKCE S256, \`refresh_token\`.
- **Flow**:
  1. Register client: \`POST /oauth/register\` (stateless Dynamic Client Registration, RFC 7591).
  2. Authorize: \`GET /oauth/authorize?response_type=code&client_id=...&redirect_uri=...&code_challenge=...&code_challenge_method=S256\`
     * Users can authenticate via interactive web consent page or **Sign in with Google** (\`/oauth/google/start\`).
  3. Exchange Token: \`POST /oauth/token\` with \`grant_type=authorization_code\` and \`code_verifier\`.
     * Returns: \`access_token\` (15-minute stateless HS256 JWT) + \`refresh_token\` (30-day rotatable token).
  4. Refresh: \`POST /oauth/token\` with \`grant_type=refresh_token\` to receive fresh access and refresh tokens without user prompt.
- **Storage Strategy for SPAs / Mobile**:
  * \`access_token\`: In-memory only (protects against XSS).
  * \`refresh_token\`: Secure local storage or httpOnly cookie.

### Method 3: Ephemeral 15-Minute Session JWT
- Obtained via MCP tools \`register_user\` or \`login_user\`.
- Self-contained HS256 JWT verified at the edge with **zero database queries**.

---

## 📡 REST API Directory (\`/api/v1/*\`)

All REST endpoints return JSON with standard HTTP status codes. Common headers:
- \`Authorization: Bearer <token | rd_live_apiKey>\` (or \`X-API-Key: <rd_live_apiKey>\`)
- \`X-Request-ID\`: Distributed trace ID (incoming echoed, or generated UUID)
- \`X-Response-Time\`: Execution duration in milliseconds (e.g. \`12ms\`)

### 1. Analytics & Summary
- **\`GET /api/v1/summary\`**
  - Query Params:
    * \`startDate\` *(optional, ISO-8601 string, e.g. "2026-09-01")*
    * \`endDate\` *(optional, ISO-8601 string)*
    * \`baseCurrency\` *(optional, default "IDR", e.g. "USD", "SGD")*
  - Returns:
    * \`consolidatedNetWorth\`: Total liquid assets converted to \`baseCurrency\` with live FX rates.
    * \`netWorthByCurrency\`: Balances grouped by currency (IDR, USD, etc.).
    * \`netWorthByInstitution\`: Balances grouped by bank/wallet (BCA, Mandiri, GoPay, etc.).
    * \`totalIncome\`, \`totalExpense\`, \`totalAdminFees\`, \`netSavings\`
    * \`totalDebt\`, \`totalReceivable\`
    * \`categoryBreakdown\`: Spending breakdown by category name.
    * \`activeGoals\`: List of goals with progress percentage and target pacing.
    * \`cashflowProjections\`: 30-day forward projection based on recurring templates.

### 2. Wallets
- **\`GET /api/v1/wallets\`**
  - Returns: Array of user wallets.
  - Fields: \`walletId\`, \`walletName\`, \`walletInstitution\`, \`walletType\` (bank, cash, e-wallet, crypto, investment), \`walletBalance\`, \`walletCurrency\`, \`walletCreatedAt\`.

### 3. Categories
- **\`GET /api/v1/categories\`**
  - Returns: Array of categories.
  - Fields: \`categoryId\`, \`categoryName\`, \`categoryType\` (expense | income), \`categoryIcon\`, \`categoryCreatedAt\`.

### 4. Budgets
- **\`GET /api/v1/budgets\`**
  - Returns: Array of active budgets with live spending utilization.
  - Fields: \`budget\` (\`budgetId\`, \`budgetName\`, \`budgetAmount\`, \`budgetPeriodStart\`, \`budgetPeriodEnd\`), \`spent\`, \`remaining\`, \`percentUsed\`.

### 5. Transactions
- **\`GET /api/v1/transactions\`**
  - Query Params: \`walletId\`, \`targetWalletId\`, \`categoryId\`, \`budgetId\`, \`type\` (expense|income|transfer), \`isPlanned\` (boolean), \`startDate\`, \`endDate\`, \`limit\` (default 50, max 200), \`offset\` (default 0).
  - Returns: Array of transactions ordered by date descending.

### 6. Debts & Loans
- **\`GET /api/v1/debts-loans\`**
  - Query Params: \`status\` (unpaid|partially_paid|paid), \`type\` (debt|loan).
  - Returns: Array of debt/loan records with remaining balances and due dates.

### 7. Goals
- **\`GET /api/v1/goals\`**
  - Query Params: \`status\` (in_progress|completed|cancelled).
  - Returns: Array of goals with pacing data (\`progressPercentage\`, \`remainingAmount\`, \`daysRemaining\`, \`requiredMonthlySavings\`).
- **\`POST /api/v1/goals\`** *(HTTP 201)*
  - JSON Body: \`name\` (required), \`targetAmount\` (required), \`currentAmount\` (default 0), \`currency\` (default "IDR"), \`targetDate\` ("YYYY-MM-DD"), \`walletId\`, \`categoryId\`, \`notes\`.

### 8. Recurring Templates
- **\`GET /api/v1/recurring-templates\`**
  - Query Params: \`isActive\` (boolean).
- **\`POST /api/v1/recurring-templates\`** *(HTTP 201)*
  - JSON Body: \`name\`, \`walletId\`, \`targetWalletId\` (for transfers), \`categoryId\`, \`amount\`, \`adminFee\`, \`type\` (expense|income|transfer), \`frequency\` (daily|weekly|monthly|yearly), \`interval\` (integer >= 1), \`startDate\`, \`nextRunDate\`, \`endDate\`, \`notes\`.
- **\`POST /api/v1/recurring-templates/:templateId/apply\`** *(HTTP 200)*
  - Atomically creates the scheduled transaction, updates wallet balances, and advances \`templateNextRunDate\`.

### 9. Feedback
- **\`POST /api/v1/feedback\`** *(HTTP 201, Guest or Authenticated)*
  - JSON Body: \`title\` (required, 5-200 chars), \`content\` (required, 10-4000 chars), \`type\` (feedback|bug|feature_request|question), \`name\`, \`email\`.

---

## ⚠️ Error Handling Contract

All REST endpoints catch service errors and map them to standard HTTP status codes:

| ServiceError Code | HTTP Status | Meaning & Resolution |
|---|---|---|
| \`VALIDATION\` | **400 Bad Request** | Missing required fields, invalid date/UUID format, or negative amount. Inspect response \`field\` and \`message\`. |
| \`UNAUTHORIZED\` | **401 Unauthorized** | Missing or invalid Bearer token or API key. Renew token or verify \`Authorization\` header. |
| \`FORBIDDEN\` | **403 Forbidden** | Operation not permitted for authenticated user. |
| \`NOT_FOUND\` | **404 Not Found** | Target resource ID does not exist or belongs to another user (RLS guard). |
| \`CONFLICT\` | **409 Conflict** | Unique constraint violation (e.g. email already registered). |
| \`INTERNAL\` | **500 Internal Server Error** | Unexpected edge exception. Includes \`X-Request-ID\` for debugging. |

Error Response Format:
\`\`\`json
{
  "error": "VALIDATION",
  "message": "Validation Error: 'amount' must be a positive finite number greater than 0",
  "field": "amount"
}
\`\`\`

---

## 🛠️ Frontend Integration Recipes

### 1. TypeScript Client (Vite React / Svelte / Vue)

\`\`\`typescript
// src/lib/reedrich.ts
export interface ReedrichClientConfig {
  baseUrl?: string;
  apiKey?: string;
  accessToken?: string;
}

export class ReedrichClient {
  private baseUrl: string;
  private token?: string;

  constructor(config: ReedrichClientConfig) {
    this.baseUrl = config.baseUrl || "https://reedrich-mcp.lutfidmz.workers.dev";
    this.token = config.apiKey || config.accessToken;
  }

  setToken(token: string) {
    this.token = token;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers);
    headers.set("Content-Type", "application/json");
    if (this.token) {
      headers.set("Authorization", \`Bearer \${this.token}\`);
    }

    const res = await fetch(\`\${this.baseUrl}\${path}\`, {
      ...options,
      headers,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err.message || \`Request failed with status \${res.status}\`);
    }

    return res.json() as Promise<T>;
  }

  // Analytics & Summary
  getSummary(params?: { startDate?: string; endDate?: string; baseCurrency?: string }) {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return this.request<any>(\`/api/v1/summary\${query ? \`?\${query}\` : ""}\`);
  }

  // Wallets
  getWallets() {
    return this.request<any[]>("/api/v1/wallets");
  }

  // Transactions
  getTransactions(params?: Record<string, string | number | boolean>) {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return this.request<any[]>(\`/api/v1/transactions\${query ? \`?\${query}\` : ""}\`);
  }

  // Budgets
  getBudgets() {
    return this.request<any[]>("/api/v1/budgets");
  }

  // Goals
  getGoals(status?: "in_progress" | "completed" | "cancelled") {
    const query = status ? \`?status=\${status}\` : "";
    return this.request<any[]>(\`/api/v1/goals\${query}\`);
  }

  createGoal(goal: { name: string; targetAmount: number; targetDate?: string; currency?: string }) {
    return this.request<any>("/api/v1/goals", {
      method: "POST",
      body: JSON.stringify(goal),
    });
  }
}
\`\`\`

### 2. Dart Client (Flutter Mobile)

\`\`\`dart
// lib/services/reedrich_service.dart
import 'dart:convert';
import 'package:http/http.dart' as http;

class ReedrichService {
  final String baseUrl;
  final String apiKey; // e.g. "rd_live_..."

  ReedrichService({
    this.baseUrl = "https://reedrich-mcp.lutfidmz.workers.dev",
    required this.apiKey,
  });

  Map<String, String> get _headers => {
    "Content-Type": "application/json",
    "Authorization": "Bearer $apiKey",
  };

  Future<Map<String, dynamic>> getSummary({String baseCurrency = "IDR"}) async {
    final uri = Uri.parse("$baseUrl/api/v1/summary?baseCurrency=$baseCurrency");
    final response = await http.get(uri, headers: _headers);

    if (response.statusCode == 200) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    } else {
      throw Exception("Failed to load summary: \${response.body}");
    }
  }

  Future<List<dynamic>> getWallets() async {
    final uri = Uri.parse("$baseUrl/api/v1/wallets");
    final response = await http.get(uri, headers: _headers);

    if (response.statusCode == 200) {
      return jsonDecode(response.body) as List<dynamic>;
    } else {
      throw Exception("Failed to load wallets: \${response.body}");
    }
  }

  Future<List<dynamic>> getTransactions({String? type, int limit = 50}) async {
    final params = {"limit": limit.toString()};
    if (type != null) params["type"] = type;

    final uri = Uri.parse("$baseUrl/api/v1/transactions").replace(queryParameters: params);
    final response = await http.get(uri, headers: _headers);

    if (response.statusCode == 200) {
      return jsonDecode(response.body) as List<dynamic>;
    } else {
      throw Exception("Failed to load transactions: \${response.body}");
    }
  }
}
\`\`\`

---

## 🤖 MCP Integration Reference

For autonomous coding agents (Claude Desktop, OpenCode, Pi, OMP):

- **Remote Streamable HTTP URL**: \`${origin}/mcp\`
- **SSE Fallback URL**: \`${origin}/sse\`
- **12 Available Tools**:
  * \`register_user\`, \`login_user\` (Auth & Onboarding)
  * \`manage_wallet\`, \`manage_category\`, \`manage_budget\`, \`manage_debt_loan\`, \`manage_goal\`, \`manage_recurring_template\` (Entity Management)
  * \`record_transaction\`, \`transfer_funds\`, \`update_transaction\`, \`list_transactions\` (Financial Transactions)
  * \`financial_summary\` (Consolidated Net Worth & Health Report)
  * \`submit_feedback\` (Feedback to internal D1)
- **4 MCP Resources**:
  * \`reedrich://db/schema\` (Database relationship definitions)
  * \`reedrich://wallets/list\` (User wallets & balances)
  * \`reedrich://budgets/active\` (Active budget spending limits)
  * \`reedrich://debts/active\` (Liabilities and receivables)
- **4 MCP Prompts**:
  * \`onboarding_assistant\`, \`daily_briefing\`, \`financial_planning\`, \`debt_loan_advisor\`
`;
}
