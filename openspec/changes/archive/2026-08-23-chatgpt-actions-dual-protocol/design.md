## Context

The Reedrich server runs on Cloudflare Workers using Hono and Drizzle ORM over Cloudflare D1. Currently, all domain logic is coupled inside `src/mcp.ts` tool callbacks. To support ChatGPT Custom GPT Actions without requiring Developer Mode while keeping MCP clients functional, we introduce a dual-protocol architecture with a shared service layer, REST endpoints, OpenAPI 3.0 manifest generator, and a lightweight OAuth 2.0 authorization engine.

See `proposal.md` for motivation and background.

## Goals / Non-Goals

**Goals:**
- Decouple domain logic from MCP transport into reusable service modules in `src/services/`.
- Provide authenticated REST API routes (`/api/v1/*`) covering all 12 financial tools.
- Expose a dynamic, compliant OpenAPI 3.0 schema at `GET /openapi.json`.
- Implement a zero-dependency OAuth 2.0 server (`/oauth/authorize`, `/oauth/token`) with a polished HTML login/signup UI.
- Provide a public Privacy Policy page at `GET /privacy` for GPT Store compliance at $0 domain cost.
- Maintain 100% backward compatibility with all existing MCP endpoints (`/mcp`, `/sse`) and tools.

**Non-Goals:**
- Implementing third-party OAuth providers (Google, GitHub SSO) for end-users.
- Modifying existing D1 database table schemas or dropping any existing data.
- Introducing heavy frontend frameworks or client-side build steps for the OAuth consent UI.

## Architecture Diagram

```
                                  ┌───────────────────────────┐
                                  │      Client Request       │
                                  └─────────────┬─────────────┘
                                                │
                 ┌──────────────────────────────┴──────────────────────────────┐
                 ▼                                                             ▼
     ┌───────────────────────┐                                     ┌───────────────────────┐
     │  MCP JSON-RPC Client  │                                     │     ChatGPT Action    │
     │(Claude, Cursor, OMP)  │                                     │  (Public via GPT)     │
     └───────────┬───────────┘                                     └───────────┬───────────┘
                 │ /mcp, /sse                                                  │ /api/v1/*, /oauth/*
                 │                                                             │
                 ▼                                                             ▼
     ┌───────────────────────┐                                     ┌───────────────────────┐
     │      src/mcp.ts       │                                     │  src/routes/api.ts    │
     │ (MCP Tool Handlers)   │                                     │  src/routes/oauth.ts  │
     └───────────┬───────────┘                                     └───────────┬───────────┘
                 │                                                             │
                 └──────────────────────────────┬──────────────────────────────┘
                                                │
                                                ▼
                               ┌─────────────────────────────────┐
                               │       src/services/*            │
                               │  - wallet.service.ts            │
                               │  - transaction.service.ts       │
                               │  - debt.service.ts              │
                               │  - summary.service.ts           │
                               │  - onboarding.service.ts        │
                               └────────────────┬────────────────┘
                                                │
                                                ▼
                               ┌─────────────────────────────────┐
                               │   Cloudflare D1 (SQLite DB)     │
                               └─────────────────────────────────┘
```

## Decisions

### 1. Service Layer Extraction (`src/services/`)
* **Decision**: Extract pure business logic into dedicated service files:
  - `wallet.service.ts`: Wallet creation, listing, updating, balance adjustment.
  - `transaction.service.ts`: Expense/income recording, atomic wallet synchronization, updates, query filters.
  - `transfer.service.ts`: Dual-wallet atomic transfers with admin fee debiting.
  - `debt.service.ts`: Debt/loan creation, status filters, full/partial repayments.
  - `summary.service.ts`: Net worth, liquid balance, savings, debt totals, and category breakdown.
  - `category.service.ts` & `budget.service.ts`: Categories, seed defaults, budget checks.
  - `user.service.ts`: User registration, API key validation, onboarding evaluation.
* **Rationale**: Eliminates code duplication between MCP JSON-RPC handlers and REST API route handlers while preserving single-source-of-truth invariants.

### 2. Native Hono REST Router & OpenAPI 3.0 Generator
* **Decision**: Implement REST endpoints in `src/routes/api.ts` and OpenAPI manifest generation in `src/routes/openapi.ts` using native TypeScript objects without heavy runtime reflection packages.
* **Rationale**: Guarantees zero runtime overhead, instant cold starts on Cloudflare Workers edge, and strict compliance with OpenAPI 3.0.0 required by OpenAI GPT Actions.

### 3. Stateless Cryptographic OAuth 2.0 Codes
* **Decision**: Generate authorization codes as short-lived (5-minute TTL) HMAC-SHA256 signed JWTs containing `userId`, `clientId`, and `redirectUri`.
* **Rationale**: Eliminates the need for a separate `oauth_codes` database table in D1, preventing database write contention during login spikes and maintaining zero-migration simplicity.

### 4. Self-Contained Web Consent Interface (`/oauth/authorize`)
* **Decision**: Render clean, responsive HTML/CSS using Hono's `html` helper directly in the worker.
  - Tab 1: "Masuk dengan API Key" (`rd_live_...`) for existing MCP users.
  - Tab 2: "Daftar Akun Baru" (First Name, Last Name, Email, WhatsApp Number) for new ChatGPT users.
* **Rationale**: Zero external asset dependencies (no Tailwind CDN or client JS builds needed), ultra-fast load time (<20ms on edge), mobile and desktop friendly.

### 5. Zero Remote Deletion & Multi-Tenant Isolation
* **Decision**: All queries in `src/services/` strictly require `userId` parameter resolved from the verified JWT or hashed API key. No table dropping or truncation is performed.
* **Rationale**: Upholds the project invariant of zero data loss and strict tenant boundary isolation.

## Risks / Trade-offs

- **[Risk: OpenAPI Schema Drift from Handlers]** $\rightarrow$ *Mitigation*: Shared TypeScript interface definitions for request parameters and response models across service layer and OpenAPI generator.
- **[Risk: ChatGPT Token Expiry Mid-Conversation]** $\rightarrow$ *Mitigation*: Issue 30-day JWT access tokens for OAuth exchange, backed by instant signature verification.
- **[Risk: Edge Cold Starts on HTML Rendering]** $\rightarrow$ *Mitigation*: Plain CSS and inline HTML string compilation executed in <2ms on workerd runtime.
