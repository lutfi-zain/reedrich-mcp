## Purpose

Defines the behavior contract for rotating and regenerating persistent API keys for authenticated user principals across REST API endpoints and Model Context Protocol (MCP) tool interfaces, enforcing lockout prevention guards and instant credential invalidation.

## ADDED Requirements

### Requirement: Self-Service API Key Rotation via REST Endpoint

The system MUST expose `POST /api/v1/me/api-key/rotate` and semantic alias `POST /api/v1/user/profile/api-key/rotate` to rotate the active user's persistent API key.

The endpoint SHALL require authentication via Bearer token (JWT, OAuth access token, or current active persistent API key).
The request body SHALL be a JSON object requiring `confirm: true` (boolean). If `confirm` is omitted or false, the system SHALL reject the request with HTTP `400 Bad Request` and error code `VALIDATION`.

The system MUST verify that the authenticated user has a non-empty, valid email address recorded in `user_email`. If the user does NOT have a valid email address, the system MUST reject the rotation with HTTP `400 Bad Request` and error code `VALIDATION` to prevent permanent account lockout.

Upon successful validation, the system MUST:
1. Generate a new cryptographically secure API key starting with prefix `rd_live_` with 32 hexadecimal random characters (16 bytes entropy).
2. Compute the SHA-256 hash of the new API key.
3. Atomically update the user's `user_api_key_hash` in the database with the new hash.
4. Respond with HTTP `200 OK` and a JSON object containing:
   - `apiKey`: the new plaintext API key (only returned once).
   - `message`: informational notice regarding old key revocation and reminder to store the new key safely.
   - `rotatedAt`: ISO-8601 timestamp with timezone.

The previous API key SHALL become immediately invalid for all subsequent authentication attempts. In-flight stateless JWT tokens and OAuth access tokens SHALL remain valid until their expiration timestamp.

#### Scenario: Successful API key rotation with confirmation and email present

- **GIVEN** an authenticated user with `userEmail: "user@example.com"` and active key `rd_live_oldkey111`
- **WHEN** the client sends `POST /api/v1/me/api-key/rotate` with `{ "confirm": true }`
- **THEN** the system MUST respond with HTTP `200 OK`
- **THEN** the JSON payload MUST contain `apiKey` starting with `rd_live_`
- **THEN** the JSON payload MUST contain `message` and `rotatedAt`
- **THEN** subsequent requests using `rd_live_oldkey111` MUST be rejected with HTTP `401 Unauthorized`
- **THEN** subsequent requests using the new `apiKey` MUST succeed with HTTP `200 OK`

#### Scenario: API key rotation rejected when confirm is false or missing

- **GIVEN** an authenticated user with a valid email
- **WHEN** the client sends `POST /api/v1/me/api-key/rotate` with `{}` or `{ "confirm": false }`
- **THEN** the system MUST respond with HTTP `400 Bad Request`
- **THEN** the JSON response MUST have `{ "error": "VALIDATION", "field": "confirm" }`
- **THEN** the existing API key MUST remain valid and unchanged

#### Scenario: API key rotation rejected when user account has no valid email

- **GIVEN** an authenticated user whose `userEmail` is empty, whitespace, or invalid format
- **WHEN** the client sends `POST /api/v1/me/api-key/rotate` with `{ "confirm": true }`
- **THEN** the system MUST respond with HTTP `400 Bad Request`
- **THEN** the JSON response MUST have error code `VALIDATION` indicating that a valid email address must be connected prior to key rotation to prevent account lockout
- **THEN** the existing API key MUST remain unchanged

#### Scenario: Unauthenticated rotation attempt is rejected

- **WHEN** an unauthenticated client sends `POST /api/v1/me/api-key/rotate` with `{ "confirm": true }`
- **THEN** the system MUST respond with HTTP `401 Unauthorized`

---

### Requirement: Self-Service API Key Rotation via MCP Tool

The system MUST expose an MCP tool named `rotate_api_key` allowing authenticated AI agents or clients to rotate the user's persistent API key over JSON-RPC.

The tool input schema SHALL require:
- `confirm` (boolean, required): explicit acknowledgment that the existing key will be invalidated.
- `apiKey` (string, optional): ambient credential fallback when HTTP Bearer headers cannot be passed.

If `confirm` is false, the tool SHALL return a validation error and MUST NOT rotate the key.
If the authenticated user does not have a valid email on record, the tool SHALL return a validation error stating the email prerequisite.
On success, the tool SHALL return the newly issued plaintext API key, rotation timestamp, and security storage advice.

#### Scenario: AI Agent rotates API key via MCP tool call

- **GIVEN** an authenticated MCP session for a user with `userEmail: "agent_user@example.com"`
- **WHEN** the agent calls `rotate_api_key` with `{ "confirm": true }`
- **THEN** the tool MUST return a successful response containing the new `rd_live_...` API key
- **THEN** the database MUST be updated with the SHA-256 hash of the new key
- **THEN** subsequent tool calls with the old API key MUST fail with authentication error

#### Scenario: MCP tool call rejected without confirmation

- **GIVEN** an authenticated MCP session
- **WHEN** the agent calls `rotate_api_key` with `{ "confirm": false }`
- **THEN** the tool MUST return an error indicating `confirm` must be true to proceed with key rotation
- **THEN** the active key MUST NOT be modified
