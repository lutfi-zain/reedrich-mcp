## 1. Edge Endpoint for llms.txt

- [x] 1.1 Create `src/docs/llms.ts` with `getLlmsTxt(origin?: string)` containing comprehensive LLM-optimized documentation (system overview, dual MCP/REST architecture, 3 authorization options, REST catalog, ServiceError codes, and client integration recipes)
- [x] 1.2 Mount `GET /llms.txt` and `GET /llm.txt` in `src/index.ts` returning `Content-Type: text/markdown; charset=utf-8` with CORS and public caching headers
- [x] 1.3 Update `GET /` root server discovery in `src/index.ts` to include `"llms": "/llms.txt"` in the `endpoints` object
- [x] 1.4 Run `npm run typecheck` to verify worker routes compile cleanly

## 2. Repository Root Manifests
- [x] 2.1 Create `llms.txt` in the repository root containing canonical machine-optimized markdown documentation for AI agents and LLMs
- [x] 2.2 Create `llm.txt` in the repository root as an identical copy/alias of `llms.txt`

## 3. Comprehensive README Overhaul

- [x] 3.1 Add "Frontend & Client Integration Guide" to `README.md` for Web SPAs (Vite React, Svelte, Vue on Cloudflare Pages) and Mobile applications (Flutter)
- [x] 3.2 Add complete "Authorization Architecture Guide" to `README.md` documenting Persistent API Key, OAuth2 PKCE with Google Login federation, and Ephemeral JWT with trade-offs
- [x] 3.3 Add copy-paste client code snippets in TypeScript (fetch) and Dart (http) in `README.md`
- [x] 3.4 Document `ServiceError` codes, error handling contract, and observability headers (`X-Request-ID`, `X-Response-Time`) in `README.md`

## 4. Tests & Verification

- [x] 4.1 Add automated test cases in `tests/mcp.test.ts` verifying `GET /llms.txt` and `GET /llm.txt` return 200 markdown with expected sections, and `GET /` exposes `"llms": "/llms.txt"`
- [x] 4.2 Run full test suite (`npm test`) — verify zero regressions across all 36 tests
- [x] 4.3 Run TypeScript static type check (`npm run typecheck`) — zero errors
- [x] 4.4 Run `npm run build` (Wrangler dry-run deploy) — verify bundle compiles cleanly for Cloudflare Workers
