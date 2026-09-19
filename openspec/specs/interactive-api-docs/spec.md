## Purpose

Defines the behavioral requirements for serving an interactive, zero-dependency Scalar API Reference documentation interface directly from the Cloudflare Workers edge server, enabling developers and integrators to explore and test the REST API in a browser.

## Requirements

### Requirement: Interactive Scalar API Documentation Endpoint

The server SHALL serve an interactive Scalar API Reference HTML interface at `GET /docs`.

The endpoint MUST:
- Respond with HTTP status `200` and `Content-Type: text/html; charset=utf-8`.
- Set CORS header `Access-Control-Allow-Origin: *`.
- Set caching headers allowing public edge caching (`Cache-Control: public, max-age=3600`).
- Embed a self-contained HTML page that loads the Scalar API Reference web component from `@scalar/api-reference` CDN.
- Configure the Scalar component to consume the OpenAPI specification from `/openapi.json`.
- Support modern dark theme styling (`theme: 'kepler'`) and interactive request execution.

#### Scenario: Developer opens /docs in browser

- **WHEN** an HTTP `GET /docs` request is received
- **THEN** the response status MUST be `200` with `Content-Type: text/html; charset=utf-8`
- **THEN** the HTML body SHALL contain the Scalar API reference script referencing `/openapi.json`

#### Scenario: OPTIONS preflight for /docs

- **WHEN** an HTTP `OPTIONS /docs` request is received
- **THEN** the response status MUST be `204` with CORS headers `Access-Control-Allow-Origin: *` and `Access-Control-Allow-Methods: GET, OPTIONS`

### Requirement: Documentation Path Alias

The server SHALL serve the identical interactive documentation interface at `GET /reference` as an alias to `GET /docs`.

#### Scenario: Developer opens /reference alias

- **WHEN** an HTTP `GET /reference` request is received
- **THEN** the response status MUST be `200` with `Content-Type: text/html; charset=utf-8` and render the same Scalar documentation page

### Requirement: Discovery Link in Root Status

The server SHALL include a `docs` field in the JSON response of `GET /` pointing to `/docs`.

#### Scenario: Client checks root server discovery

- **WHEN** an HTTP `GET /` request is received
- **THEN** the JSON response SHALL include `"docs": "/docs"` inside the `endpoints` or root discovery object
