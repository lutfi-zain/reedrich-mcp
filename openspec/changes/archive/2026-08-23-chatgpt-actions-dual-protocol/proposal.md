## Why

Currently, the Reedrich MCP server is only accessible via Model Context Protocol (MCP) clients (Claude Code, Cursor, Pi, OMP) or by enabling ChatGPT's Developer Mode with custom connector URLs. To make Reedrich publicly available to all ChatGPT users on the GPT Store without requiring Developer Mode, the server must support ChatGPT Actions via OpenAPI 3.0 and provide an OAuth 2.0 authentication flow, while maintaining 100% backward compatibility with existing MCP tools, API keys, and JSON-RPC endpoints.

## What Changes

- **Core Service Layer Extraction**: Extract domain logic (wallets, transactions, transfers, categories, budgets, debts/loans, summary, feedback) from `src/mcp.ts` into a reusable, decoupled service layer in `src/services/`.
- **REST API Endpoints (`/api/v1/*`)**: Expose clean REST HTTP endpoints across all 12 financial capabilities for ChatGPT Actions and standard HTTP consumers.
- **OpenAPI 3.0 Specification (`GET /openapi.json`)**: Provide an automated, accurate OpenAPI 3.0 specification defining schemas, request bodies, query parameters, and Bearer authentication for Custom GPT Actions.
- **OAuth 2.0 Provider Endpoints**:
  - `GET /oauth/authorize` & `POST /oauth/authorize`: Web-based consent and login interface supporting both existing API key entry (`rd_live_...`) and new user registration (first name, last name, email, WhatsApp number).
  - `POST /oauth/token`: Secure authorization code exchange endpoint issuing standard JWT access tokens.
- **Public Compliance & Policy Endpoint (`GET /privacy`)**: Expose a lightweight privacy policy document fulfilling OpenAI GPT Store publication requirements at zero domain cost on `workers.dev`.
- **100% Backward Compatibility**: Existing MCP endpoints (`/mcp`, `/sse`, `POST /`), MCP tools (`register_user`, `login_user`), API key hashing, and SQLite D1 tables remain strictly intact and unchanged.

## Capabilities

### New Capabilities
- `chatgpt-actions`: Exposes REST API v1 endpoints (`/api/v1/*`), OpenAPI 3.0 schema generation (`/openapi.json`), and privacy policy compliance page (`/privacy`) on Cloudflare Workers.
- `oauth-provider`: Provides a lightweight OAuth 2.0 authorization server (`/oauth/authorize` and `/oauth/token`) supporting web login via API key and new user registration with unified D1 identity mapping.

### Modified Capabilities
- None. (Existing `onboarding`, `mcp-prompts`, and `debt-loan-management` MCP tool interfaces and database schemas remain fully compatible and unmodified).

## Impact

- **Affected Components**:
  - `src/index.ts`: Mounts new REST router, OpenAPI endpoint, OAuth routes, and privacy policy route.
  - `src/mcp.ts`: Refactored to delegate tool execution to `src/services/`.
  - `src/services/*`: New shared service functions executing Drizzle D1 transactions and domain validation.
  - `src/routes/api.ts`: REST endpoint handlers for ChatGPT Actions.
  - `src/routes/oauth.ts`: OAuth 2.0 authorization and token exchange handlers.
  - `src/routes/openapi.ts`: OpenAPI 3.0 specification generator.
- **Database Schema**: No breaking schema changes required. Uses existing `users`, `wallets`, `categories`, `budgets`, `transactions`, and `debts_loans` tables in D1.
- **Security & Multi-Tenancy**: Maintains strict Row-Level Security (RLS) via JWT Bearer token and API key validation. OAuth codes are cryptographically signed with short TTLs (5 minutes).
- **Non-Goals**:
  - Building external complex SSO or third-party OAuth integrations (Google, Apple).
  - Deprecating or modifying JSON-RPC MCP streaming endpoints.
