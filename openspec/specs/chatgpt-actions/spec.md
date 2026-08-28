# chatgpt-actions Specification

## Purpose

Exposes OpenAPI 3.0.0 metadata, privacy policy documentation, and REST endpoints under `/api/v1` to enable seamless integration with Custom GPTs and ChatGPT Actions without requiring raw Model Context Protocol transport.

## Requirements

### Requirement: OpenAPI 3.0.0 Manifest
The server SHALL serve an OpenAPI 3.0.0 compliant specification at `GET /openapi.json`.

The OpenAPI specification MUST:
- Specify OpenAPI version `3.0.0`.
- Provide info title `Reedrich Financial Intelligence API` and version `1.0.0`.
- Include dynamic server URL reflecting the current worker origin.
- Declare `bearerAuth` security scheme supporting 15-minute JWT tokens and persistent API keys (`rd_live_...` / `fp_live_...`).
- Include `x-oauth` extension detailing supported OAuth scopes (`financial:read`, `financial:write`, `financial:admin`).
- Set CORS headers (`Access-Control-Allow-Origin: *`) and public caching (`Cache-Control: public, max-age=3600`).

#### Scenario: Fetch OpenAPI manifest
- **WHEN** an HTTP `GET /openapi.json` request is received
- **THEN** the response status MUST be `200` with `Content-Type: application/json; charset=utf-8` and a valid OpenAPI 3.0.0 document.

---

### Requirement: Public Privacy Policy
The server SHALL serve a public HTML Privacy Policy at `GET /privacy`.

The Privacy Policy MUST:
- Contain clean HTML describing data handling, zero third-party selling, and user rights.
- Support dark theme visual styling.
- Return `200 OK` with `Content-Type: text/html; charset=utf-8` and CORS header `Access-Control-Allow-Origin: *`.

#### Scenario: Fetch Privacy Policy
- **WHEN** an HTTP `GET /privacy` request is received
- **THEN** the response status MUST be `200` with HTML content detailing privacy guarantees.

---

### Requirement: REST Endpoints under /api/v1
The server SHALL define and serve REST endpoints under `/api/v1/*` corresponding to core financial operations (e.g. `/api/v1/summary`) protected by Bearer authentication.

#### Scenario: Access REST endpoint with valid Bearer token
- **WHEN** a client sends an HTTP request to `/api/v1/summary` with a valid Bearer token (JWT or API key)
- **THEN** the response MUST return the financial summary with HTTP status `200`.

#### Scenario: Access REST endpoint without credentials
- **WHEN** a client sends an HTTP request to `/api/v1/summary` without an `Authorization` header
- **THEN** the response MUST return HTTP status `401 Unauthorized` with an error message.
