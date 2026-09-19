## Context

See proposal.md for motivation. Key architectural constraints:

- Cloudflare Workers runtime (workerd) does not support Node.js filesystem I/O (`fs.readFileSync`) in production isolates. Therefore, serving `GET /llms.txt` dynamically at the edge cannot read `llms.txt` from disk at runtime; it must be exported as an in-memory string constant or module (`src/docs/llms.ts`).
- Root files `llms.txt` and `llm.txt` are read directly by tools and agents examining the repo tree (e.g. Cursor, Claude Code, OMP).
- `README.md` currently focuses on MCP terminal client setup; frontend engineers and agents building Web or Mobile applications against Reedrich need explicit client integration patterns, authorization guides, and client code snippets.

## Goals / Non-Goals

**Goals:**
- Provide `/llms.txt` and `/llm.txt` HTTP endpoints on Cloudflare Workers edge server.
- Provide `llms.txt` and `llm.txt` in repository root for local/repo-reading agents.
- Document both integration interfaces: MCP (tools, resources, prompts) and REST API (`/api/v1/*`, OpenAPI, Scalar docs).
- Exhaustively document all 3 authorization methods (Persistent API Key, OAuth2 PKCE with Google Login, Ephemeral JWT).
- Provide copy-paste integration recipes for Vite React/Svelte/Vue and Flutter (Dart).
- Document error handling contracts (`ServiceError` codes) and observability headers (`X-Request-ID`, `X-Response-Time`).

**Non-Goals:**
- No changes to underlying database schema, tables, or D1 migrations.
- No changes to MCP tool schemas or REST route implementations.
- No external third-party SDK dependencies added.

## Decisions

### Decision 1: Export In-Memory Markdown Content via `src/docs/llms.ts`

**Chosen:** Create `src/docs/llms.ts` exporting `getLlmsTxt(origin?: string): string`.

**Rationale:**
- Cloudflare Workers runs in a V8 isolate without access to the local filesystem (`fs`). Bundling `llms.txt` as a string in `src/docs/llms.ts` allows the worker to serve `GET /llms.txt` with zero filesystem calls and zero latency overhead.
- The repository root `llms.txt` and `llm.txt` will contain the identical canonical text for git readers.

### Decision 2: Standard `/llms.txt` Formatting

**Chosen:** Follow the official `/llms.txt` specification:
- H1 title and short summary
- Blockquotes describing primary purpose and target audiences
- Clean Markdown sections:
  * Quick links & base URLs
  * Dual Architecture (MCP vs REST)
  * Authorization Guide (Options 1, 2, 3)
  * Complete REST Endpoint Reference (`/api/v1/*`)
  * MCP Tools & Resources Reference
  * Frontend Integration Guide (Vite React/Svelte & Flutter Dart)
  * Error Handling & Observability

### Decision 3: Documenting Authorization for Frontend Clients

**Chosen:** Clearly document three auth patterns with explicit trade-offs so agents choose the right approach:
1. **Option 1: Persistent API Key (`rd_live_...`)** — Easiest for personal apps, dashboards, or developer tools. Sent via `Authorization: Bearer <rd_live_...>` or `X-API-Key: <rd_live_...>`.
2. **Option 2: OAuth2 PKCE (S256) + 30-Day Refresh Tokens** — Best for public multi-user web/mobile apps. Uses `/oauth/authorize` (supports Google Login federation) and `/oauth/token` (refresh rotation).
3. **Option 3: 15-Minute Session JWT** — Generated via `login_user` or `register_user`.

### Decision 4: Frontend Client Recipes

**Chosen:** Provide complete, ready-to-run client examples:
- **TypeScript / Fetch Client** (for Vite React, Svelte, Vue):
  * Singleton or hook managing Bearer headers and base URL.
  * Fetch wrapper extracting `X-Request-ID` and handling `ServiceError` codes.
- **Dart Client** (for Flutter mobile):
  * Class-based service using `http` package with authorization headers and JSON serialization.

## Risks / Trade-offs

**[Risk] Drift between root `llms.txt` and `src/docs/llms.ts`** → Mitigation: Both are created and verified in the same change. Test suite in `tests/mcp.test.ts` will verify that `GET /llms.txt` returns HTTP 200 with the expected content.
