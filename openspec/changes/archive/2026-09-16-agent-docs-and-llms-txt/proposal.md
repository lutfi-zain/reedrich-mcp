## Why

Reedrich has evolved into a dual-interface financial engine offering both a Model Context Protocol (MCP) server for autonomous AI reasoning agents and a high-performance REST API (`/api/v1/*`) with OpenAPI 3.0 schemas and Scalar documentation. However, our current documentation (`README.md` and repo files) primarily addresses MCP tool invocation from terminal coding agents (Claude Code, OpenCode, OMP).

When AI agents or developer copilots are tasked with building user-facing client applications — such as a Vite React/Svelte/Vue SPA hosted on Cloudflare Pages or a mobile Flutter app — they lack clear, end-to-end guidance on how to treat Reedrich as their backend. Furthermore, modern AI models look for an `llms.txt` (per the /llms.txt standard) to rapidly digest system capabilities, authorization flows, and endpoint contracts without parsing hundreds of lines of prose.

Creating `llms.txt` (and alias `llm.txt`), serving them at `GET /llms.txt`, and expanding `README.md` into an exhaustive developer/agent integration handbook will empower AI agents and developers to build web and mobile frontends effortlessly against Reedrich.

## What Changes

- **Create `llms.txt` and `llm.txt`** in repository root:
  - Concise, high-density reference optimized for LLM context windows.
  - Documents system role, base URLs, dual integration protocols (MCP vs REST).
  - Explicit authorization guide: Persistent API Key (`rd_live_...`), OAuth2 PKCE (S256) with Google Login federation and 30-day refresh tokens, and 15-minute JWT tokens.
  - Complete REST API catalogue (`/api/v1/*`) with methods, required parameters, and response types.
  - Error contract: `ServiceError` codes (`VALIDATION`, `NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `CONFLICT`, `INTERNAL`) and HTTP status mapping.
  - Traceability headers: `X-Request-ID` and `X-Response-Time`.
  - Frontend integration recipes with working TypeScript (fetch) and Dart (http/dio) client code snippets.
- **Expose `GET /llms.txt` and `GET /llm.txt`** in `src/index.ts`:
  - Serves `text/markdown; charset=utf-8` with CORS header `Access-Control-Allow-Origin: *` and public edge caching (`Cache-Control: public, max-age=3600`).
  - Added to root discovery endpoint (`GET /`) in the `endpoints` object.
- **Comprehensive Overhaul of `README.md`**:
  - Adds dedicated "Frontend & Client Integration Guide" for web (Vite React/Svelte/Vue) and mobile (Flutter/React Native).
  - Details the 3 Authorization Architecture options with trade-offs (Personal MVP vs Multi-User SaaS).
  - Provides ready-to-copy API client implementations in TypeScript and Dart.
  - Explains Row-Level Security (RLS) and multi-tenancy rules.
  - Details observability headers and error handling contracts.

## Capabilities

### New Capabilities
- `llms-manifest`: An `llms.txt` and `llm.txt` standard manifest and HTTP endpoint (`GET /llms.txt`, `GET /llm.txt`) providing AI agents and LLMs with machine-optimized documentation for integrating with Reedrich via MCP and REST API.

### Modified Capabilities
_None — does not modify existing MCP or REST protocol behavior._

## Non-Goals

- No database schema or D1 migration changes.
- No changes to existing MCP tool input schemas, resource URIs, or prompt declarations.
- No new external auth providers (only documenting existing Google OAuth & API key flows).
- No new REST endpoints added to `/api/v1/*`.

## Security, Multi-Tenancy, and Performance Impact

- **Security**: The `llms.txt` documentation and README contain only public architectural patterns, schemas, and usage examples with mock credentials (`rd_live_sample...`). No production secrets, tokens, or private keys are exposed.
- **Performance**: Serving `llms.txt` directly from Cloudflare Workers edge using `c.text()` has sub-millisecond response time and zero database impact.
- **Multi-Tenancy**: Clear documentation enforces that all API calls require authenticated `userId` scoping via Bearer tokens or `X-API-Key` headers, preserving the Zero-Data-Leakage multi-tenant invariant.
