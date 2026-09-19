## Context

See proposal.md for motivation. Key constraints:

- `src/index.ts` currently contains `generateOpenApiSpec` (lines 106-303) generating an OpenAPI 3.0.0 document that only specifies `/api/v1/summary`, `/api/v1/goals`, `/api/v1/recurring-templates`, and `/api/v1/feedback`.
- Five newer route groups created in the `extract-service-layer` change (`/api/v1/wallets`, `/api/v1/categories`, `/api/v1/budgets`, `/api/v1/transactions`, `/api/v1/debts-loans`) are not documented in the specification.
- There is currently no interactive UI for browsing endpoints or executing test requests in the browser.
- Cloudflare Workers runtime (workerd) has tight bundle limits and benefits from minimal cold-start times; heavy documentation bundling (e.g. bundling full React or Node server frameworks for docs) should be avoided.

## Goals / Non-Goals

**Goals:**
- Provide an interactive, responsive API reference documentation interface at `GET /docs` and `GET /reference`.
- Render the documentation using Scalar's modern dark theme UI with search, request testing console, and schema viewer.
- Update `/openapi.json` to comprehensively describe all 9 active REST endpoint families under `/api/v1/*`.
- Extract OpenAPI generation logic out of `src/index.ts` into a dedicated `src/docs/openapi.ts` module to keep the entrypoint lean.
- Expose `/docs` link in the root server discovery JSON (`GET /`).

**Non-Goals:**
- No heavy npm packages added to production dependencies for documentation rendering.
- No changes to existing MCP tools, schemas, or transport behavior.
- No schema upgrades to OpenAPI 3.1.0 (maintaining 3.0.0 for strict ChatGPT Actions compatibility).

## Decisions

### Decision 1: Render Scalar via Static HTML + CDN Web Component

**Chosen:** Return a lightweight HTML document from Hono using `@scalar/api-reference` via CDN:

```html
<!doctype html>
<html>
  <head>
    <title>Reedrich API Reference</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <script
      id="api-reference"
      data-url="/openapi.json"
      data-configuration='{"theme":"kepler","layout":"modern","darkMode":true}'
      src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>
```

**Rationale:** 
- Adding `@scalar/hono-api-reference` as an npm package bundles several megabytes of build tools and assets into the Worker script.
- A static HTML wrapper that loads the Scalar web component via CDN is ~1 KB, takes zero build time, and delivers instant response times from the edge.
- The web component automatically fetches `/openapi.json` from the current origin, renders the interactive UI, and provides the "Test Request" console.

**Alternatives considered:**
- `@scalar/hono-api-reference` npm package: Adds significant bundle weight to the Cloudflare Worker.
- Swagger UI (standalone html): Older visual aesthetic, slower rendering, larger initial asset payload than Scalar.

### Decision 2: Extract OpenAPI Specification Generator to `src/docs/openapi.ts`

**Chosen:** Move `generateOpenApiSpec(origin: string)` and its associated schema definitions out of `src/index.ts` into `src/docs/openapi.ts`.

**Rationale:**
- Documenting all 9 REST route groups with complete schemas, parameters, query filters, and response models expands the generator from ~200 lines to ~500 lines.
- Keeping it in `src/index.ts` would clutter the main routing file.
- A dedicated `src/docs/openapi.ts` allows clear organization into sections: `components.schemas`, `paths`, and helper metadata.

### Decision 3: Retain OpenAPI 3.0.0 Specification Standard

**Chosen:** Keep `openapi: "3.0.0"` in the generated spec.

**Rationale:**
- OpenAI Custom GPTs (ChatGPT Actions) strictly require OpenAPI 3.0.x and frequently reject OpenAPI 3.1.x features (such as `type: ["string", "null"]` instead of `nullable: true`).
- OpenAPI 3.0.0 is universally supported by both OpenAI and modern doc renderers like Scalar.

### Decision 4: Tag Organization and Grouping

**Chosen:** Group the 9 endpoint families under intuitive functional tags:
1. `Analytics & Reporting` — `GET /api/v1/summary`
2. `Wallets` — `GET /api/v1/wallets`
3. `Transactions` — `GET /api/v1/transactions`
4. `Budgets` — `GET /api/v1/budgets`
5. `Categories` — `GET /api/v1/categories`
6. `Goals` — `GET /api/v1/goals`, `POST /api/v1/goals`
7. `Debts & Loans` — `GET /api/v1/debts-loans`
8. `Recurring Templates` — `GET /api/v1/recurring-templates`, `POST /api/v1/recurring-templates`, `POST /:templateId/apply`
9. `Feedback` — `POST /api/v1/feedback`

**Rationale:** Scalar organizes navigation based on OpenAPI `tags`. Clear semantic tags ensure smooth navigation across the API surface.

### Decision 5: Serve at both `/docs` and `/reference`

**Chosen:** Mount the HTML reference at `GET /docs` and `GET /reference`.

**Rationale:**
- `/docs` is the de facto standard for developers and Swagger users.
- `/reference` is the default path associated with Scalar.
- Serving both avoids 404s for users guessing the documentation URL.

## Risks / Trade-offs

**[Risk] CDN availability for Scalar scripts** → Mitigation: jsDelivr is globally distributed on Cloudflare and Fastly CDNs with 99.99%+ availability. The script is loaded client-side only; the core MCP and REST APIs never depend on the CDN.

**[Risk] OpenAPI schema divergence from service layer** → Mitigation: All paths and parameters match the service function signatures and tests directly. Automated unit tests in `tests/mcp.test.ts` will validate that `/openapi.json` returns valid JSON with all 9 paths declared.
