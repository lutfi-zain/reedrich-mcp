## 1. OpenAPI Schema Extraction & Expansion

- [x] 1.1 Create `src/docs/openapi.ts` containing `generateOpenApiSpec(origin: string)` with full component schemas (`Wallet`, `Category`, `Budget`, `Transaction`, `DebtLoan`, `Goal`, `RecurringTemplate`, `FinancialSummary`, `FeedbackRequest`, `FeedbackResponse`, `ErrorResponse`)
- [x] 1.2 Declare all 9 REST endpoint path definitions in `src/docs/openapi.ts` (`/api/v1/wallets`, `/api/v1/categories`, `/api/v1/budgets`, `/api/v1/transactions`, `/api/v1/debts-loans`, `/api/v1/goals`, `/api/v1/recurring-templates`, `/api/v1/summary`, `/api/v1/feedback`) with operations, query parameters, request bodies, tags, and responses
- [x] 1.3 Update `src/index.ts` to import `generateOpenApiSpec` from `./docs/openapi` and delegate `GET /openapi.json` to it
- [x] 1.4 Run `npm run typecheck` to verify OpenAPI schema module compiles cleanly

## 2. Scalar Documentation UI Endpoint

- [x] 2.1 Create `src/docs/scalar.ts` with `renderScalarHtml(specUrl: string)` rendering the self-contained HTML page using `@scalar/api-reference` CDN with dark theme (`kepler`)
- [x] 2.2 Mount `GET /docs` and `GET /reference` in `src/index.ts` returning Scalar HTML with `Content-Type: text/html; charset=utf-8`, CORS, and public caching headers
- [x] 2.3 Update root server discovery endpoint (`GET /`) in `src/index.ts` to include `"docs": "/docs"` in the endpoints object
- [x] 2.4 Run `npm run typecheck` to verify route handlers compile cleanly

## 3. Tests & Verification

- [x] 3.1 Add test cases in `tests/mcp.test.ts` verifying `GET /openapi.json` declares all 9 paths, `GET /docs` and `GET /reference` return 200 HTML with Scalar script, and `GET /` exposes `docs` link
- [x] 3.2 Run full test suite (`npm test`) — verify zero regressions across all 35 tests
- [x] 3.3 Run TypeScript compilation check (`npm run typecheck`) — zero errors
- [x] 3.4 Run `npm run build` (Wrangler dry-run deploy) — verify bundle compiles for Workers

## 4. Documentation

- [x] 4.1 Update `README.md` to document the new interactive Scalar API reference at `/docs` and `/reference`
- [x] 4.2 Update `TOOLS.md` to reference the interactive API reference documentation at `/docs`
