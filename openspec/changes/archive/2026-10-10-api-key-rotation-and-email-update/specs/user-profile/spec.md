## ADDED Requirements

### Requirement: Update User Profile via REST Endpoint

The system MUST expose `PATCH /api/v1/me` and semantic alias `PATCH /api/v1/user/profile` allowing the authenticated user to update their personal profile details.

The endpoint SHALL accept a JSON body with any combination of:
- `firstName` (optional string, 1-100 characters)
- `lastName` (optional string, 1-100 characters)
- `email` (optional string, valid email address)
- `whatsappNumber` (optional string, international format with country code)

When `email` is provided:
1. The system MUST validate the email format using standard email regex validation.
2. The system MUST normalize the email to lower-case.
3. The system MUST check whether the normalized email is already associated with another user (`userId != authenticatedUserId`). If a collision occurs, the system MUST reject the update with HTTP `409 Conflict` and error code `CONFLICT`.

When validation passes and at least one field is provided, the system MUST update the corresponding fields in the database and return HTTP `200 OK` with the complete, updated user profile DTO.
If no fields are provided or the body is empty, the system SHALL return HTTP `200 OK` with the current unmodified profile.
The response payload MUST NOT expose `userApiKeyHash` or raw API keys.

#### Scenario: Authenticated user updates email address successfully

- **GIVEN** an authenticated user with `email: "old_email@example.com"`
- **WHEN** the client sends `PATCH /api/v1/me` with `{ "email": "new_email@example.com" }`
- **THEN** the system MUST respond with HTTP `200 OK`
- **THEN** the response payload MUST reflect `email: "new_email@example.com"`
- **THEN** the database record for the user MUST reflect the new email

#### Scenario: Email update rejected when email is already taken by another user

- **GIVEN** User A with `email: "user_a@example.com"` and User B with `email: "user_b@example.com"`
- **WHEN** User B sends `PATCH /api/v1/me` with `{ "email": "user_a@example.com" }`
- **THEN** the system MUST respond with HTTP `409 Conflict`
- **THEN** the JSON response MUST have `{ "error": "CONFLICT" }`
- **THEN** User B's email in the database MUST remain `"user_b@example.com"`

#### Scenario: Email update rejected with invalid email syntax

- **GIVEN** an authenticated user
- **WHEN** the client sends `PATCH /api/v1/me` with `{ "email": "not-an-email" }`
- **THEN** the system MUST respond with HTTP `400 Bad Request`
- **THEN** the JSON response MUST have `{ "error": "VALIDATION", "field": "email" }`

---

### Requirement: Update User Profile via MCP Tool

The system MUST expose an MCP tool named `update_user_profile` allowing AI agents or MCP clients to update the authenticated user's profile details over JSON-RPC.

The tool input schema SHALL accept:
- `firstName` (optional string, 1-100 characters)
- `lastName` (optional string, 1-100 characters)
- `email` (optional string, valid email address)
- `whatsappNumber` (optional string, international format)
- `apiKey` (optional string, credential fallback for transport parity)

The tool SHALL enforce the exact same business logic, format validations, and email uniqueness checks as the REST endpoint. On success, the tool SHALL return the sanitized user profile JSON text.

#### Scenario: AI Agent updates user name and email via MCP tool call

- **GIVEN** an active authenticated MCP session
- **WHEN** the agent calls `update_user_profile` with `{ "firstName": "Lutfi", "email": "lutfi@membran.app" }`
- **THEN** the tool MUST return a successful response containing the updated `firstName` and `email`
- **THEN** the response MUST NOT include `userApiKeyHash`
