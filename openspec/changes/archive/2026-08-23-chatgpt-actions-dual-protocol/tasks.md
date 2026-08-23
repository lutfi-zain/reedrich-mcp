## 1. Service Layer Extraction

- [x] 1.1 Extract user service (`src/services/user.service.ts`) for user creation, API key lookup, and onboarding evaluation.
- [x] 1.2 Extract wallet service (`src/services/wallet.service.ts`) for wallet creation, listing, updating, and balance math.
- [x] 1.3 Extract category and budget services (`src/services/category.service.ts`, `src/services/budget.service.ts`) for category management, seeding default categories, and budget utilization.
- [x] 1.4 Extract transaction and transfer services (`src/services/transaction.service.ts`, `src/services/transfer.service.ts`) with atomic dual-wallet updates.
- [x] 1.5 Extract debt/loan and summary services (`src/services/debt.service.ts`, `src/services/summary.service.ts`) for debt tracking, repayments, and net worth calculations.
- [x] 1.6 Refactor `src/mcp.ts` tool handlers to delegate execution directly to `src/services/*` while preserving MCP JSON-RPC compatibility.

## 2. REST API & OpenAPI Implementation

- [x] 2.1 Implement OpenAPI 3.0 specification generator in `src/routes/openapi.ts` defining all 12 endpoints and `bearerAuth` security scheme.
- [x] 2.2 Implement REST API controller in `src/routes/api.ts` exposing authenticated routes under `/api/v1/*`.
- [x] 2.3 Implement public Privacy Policy HTML page at `GET /privacy` in `src/routes/privacy.ts`.
- [x] 2.4 Mount `/api/v1/*`, `/openapi.json`, and `/privacy` in `src/index.ts`.

## 3. OAuth 2.0 Provider Implementation

- [x] 3.1 Implement cryptographic authorization code generator and verifier in `src/utils/oauth.ts`.
- [x] 3.2 Implement OAuth authorization consent UI and handler in `src/routes/oauth.ts` (`GET /oauth/authorize` & `POST /oauth/authorize`) supporting API key login and new user signup.
- [x] 3.3 Implement OAuth token exchange endpoint in `src/routes/oauth.ts` (`POST /oauth/token`).
- [x] 3.4 Mount OAuth routes in `src/index.ts` and integrate token extraction with existing auth middleware.

## 4. Tests & Verification

- [x] 4.1 Write unit tests for REST endpoints in `tests/api.test.ts` verifying `/api/v1/summary`, `/api/v1/transactions`, and `/api/v1/wallets`.
- [x] 4.2 Write OAuth flow tests in tests/oauth.test.ts verifying authorization code issuance, token exchange, and API key login.
- [x] 4.3 Verify MCP backward compatibility by executing existing `tests/mcp.test.ts` suite.
- [x] 4.4 Run strict TypeScript verification via `npm run typecheck`.

## 5. Documentation & GPT Builder Guide

- [x] 5.1 Create GPT Builder setup guide (`docs/CHATGPT_ACTIONS_SETUP.md`) containing system instructions, sample conversation starters, and action configuration parameters.
- [x] 5.2 Update `README.md` and `TOOLS.md` with dual-protocol architecture, REST API references, and OAuth endpoints.
