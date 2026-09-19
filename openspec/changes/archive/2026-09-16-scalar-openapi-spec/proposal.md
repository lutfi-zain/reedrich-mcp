## Why

Reedrich now provides 9 modular REST API endpoints under `/api/v1/*` (wallets, categories, budgets, transactions, debts/loans, goals, recurring templates, summary, feedback) alongside its 12 MCP tools. However, the current `/openapi.json` specification documents only a subset of these endpoints (`/summary`, `/goals`, `/recurring-templates`, `/feedback`), omitting wallets, categories, budgets, transactions, and debts/loans. Furthermore, there is no interactive API documentation interface (like Scalar or Swagger UI) where developers, frontend engineers, or agent authors can browse, inspect schemas, and test endpoints interactively in the browser.

Implementing an interactive Scalar API Reference UI at `GET /docs` (and alias `GET /reference`) and comprehensively updating the OpenAPI 3.0 specification to document all active REST endpoints will enable frontend developers, third-party integrators, and ChatGPT Actions to discover and interact with the full Reedrich API surface with zero friction.

## What Changes

- **Update `src/index.ts:generateOpenApiSpec`** — comprehensively document all 9 `/api/v1/*` route families with complete parameter definitions, request bodies, response schemas, and tags:
  - `GET /api/v1/wallets` — list wallets & balances (tag: `Wallets`)
  - `GET /api/v1/categories` — list expense and income categories (tag: `Categories`)
  - `GET /api/v1/budgets` — list budgets with spending utilization (tag: `Budgets`)
  - `GET /api/v1/transactions` — list transactions with filters and pagination (tag: `Transactions`)
  - `GET /api/v1/debts-loans` — list personal debts and loans (tag: `Debts & Loans`)
  - `GET /api/v1/goals` & `POST /api/v1/goals` — goal management with pacing (tag: `Goals`)
  - `GET /api/v1/recurring-templates`, `POST /api/v1/recurring-templates`, `POST /api/v1/recurring-templates/{templateId}/apply` — recurring cashflow templates (tag: `Recurring Templates`)
  - `GET /api/v1/summary` — consolidated net worth & financial briefing (tag: `Analytics & Reporting`)
  - `POST /api/v1/feedback` — submit feedback or issue reports (tag: `Feedback`)
- **Add Interactive Scalar Documentation UI** — serve modern, responsive, zero-bundle-overhead Scalar API reference at `GET /docs` and alias `GET /reference`.
  - Uses the official Scalar CDN script (`@scalar/api-reference`) rendered via clean HTML from Hono.
  - Supports modern dark mode (`theme: "kepler"` or `"purple"`), search, interactive "Test Request" console, and multi-language code snippets.
  - Configures spec URL pointing to `/openapi.json` and supports Bearer token authorization in the UI console.
- **Update Server Info (`GET /`)** — expose the new interactive docs link (`docs: '/docs'`) in the root discovery JSON.

## Capabilities

### New Capabilities
- `interactive-api-docs`: Interactive Scalar API reference documentation UI served at `GET /docs` and `GET /reference`, rendering the complete OpenAPI 3.0 specification with interactive request console and dark theme styling.

### Modified Capabilities
- `chatgpt-actions`: Expand the OpenAPI 3.0.0 specification (`/openapi.json`) requirements to include comprehensive documentation for all `/api/v1/*` REST endpoints (wallets, categories, budgets, transactions, debts-loans) with structured schemas and tags.

## Non-Goals

- No changes to MCP tool schemas, resource URIs, or prompt declarations.
- No database schema or D1 migration changes.
- No heavy Node.js npm packages added to production bundle (Scalar is rendered via CDN script in HTML).
- No removal or breaking change to existing ChatGPT Actions paths or parameters.

## Security, Multi-Tenancy, and Performance Impact

- **Zero-Storage & CDN Delivery**: The Scalar UI is rendered as a lightweight static HTML wrapper (~1 KB) that loads Scalar client assets from jsDelivr CDN. Zero workerd bundle bloat and sub-millisecond edge response times.
- **Security & Multi-Tenancy**: The docs endpoints (`/docs`, `/reference`, `/openapi.json`) are public read-only metadata endpoints. They do NOT expose any user data or tenant records. Actual API calls executed via the "Test Request" console require standard `Authorization: Bearer <token>` credentials and are strictly scoped by the existing Row-Level Security (RLS) middleware.
- **ChatGPT Actions Compatibility**: OpenAPI version remains `3.0.0` for maximum compatibility with OpenAI Custom GPT Actions.
