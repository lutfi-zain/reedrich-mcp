# user-profile Specification

## Purpose

Defines the behavior contract for retrieving authenticated user profile information across REST API endpoints and MCP interfaces. This capability enables AI agents and dashboard clients to access the active user's personal details while strictly enforcing multi-tenant row-level security and prohibiting credential exposure.

## Requirements

### Requirement: Authenticated User Profile Retrieval via REST Endpoint

The system MUST expose `GET /api/v1/me` and alias `GET /api/v1/user/profile` that return the authenticated user's profile details.

The endpoint SHALL require valid authentication via `Authorization: Bearer <token>` or `X-API-Key: <key>`. It SHALL respond with HTTP `200` and a user profile JSON object containing:
- `userId` (string, UUID)
- `firstName` (string)
- `lastName` (string)
- `fullName` (string, concatenated first and last name)
- `email` (string, unique email)
- `whatsappNumber` (string)
- `createdAt` (string, ISO-8601 timestamp)

The response SHALL NOT contain sensitive credential information, specifically `userApiKeyHash` or raw API keys.

#### Scenario: Authenticated user retrieves own profile via GET /api/v1/me

- **GIVEN** an authenticated user with `userId: "usr_123"`, `firstName: "Budi"`, `lastName: "Setiawan"`, and `email: "budi@example.com"`
- **WHEN** the client sends a `GET /api/v1/me` request with a valid Bearer token
- **THEN** the system MUST respond with HTTP `200 OK`
- **THEN** the JSON payload MUST contain `userId: "usr_123"`, `firstName: "Budi"`, `lastName: "Setiawan"`, `fullName: "Budi Setiawan"`, and `email: "budi@example.com"`
- **THEN** the JSON payload MUST NOT contain `userApiKeyHash`

#### Scenario: Profile retrieval via alias GET /api/v1/user/profile

- **GIVEN** an authenticated user
- **WHEN** the client sends a `GET /api/v1/user/profile` request with a valid API key header
- **THEN** the system MUST respond with HTTP `200 OK` and the exact same user profile JSON payload as `GET /api/v1/me`

#### Scenario: Unauthenticated request is rejected

- **WHEN** a client sends a `GET /api/v1/me` request without authentication headers
- **THEN** the system MUST respond with HTTP `401 Unauthorized` with `{ "error": "UNAUTHORIZED" }`

---

### Requirement: Authenticated User Profile Retrieval via MCP Tool

The system MUST expose an MCP tool named `get_user_profile` that returns the profile of the currently authenticated principal.

The tool input schema SHALL accept an optional `apiKey` parameter for clients unable to pass HTTP headers, and SHALL require no mandatory input fields.

The tool response SHALL return the user's profile details formatted as JSON text.

#### Scenario: AI Agent retrieves authenticated user profile

- **GIVEN** an active authenticated MCP session for user "Alice Smith" (`alice@example.com`)
- **WHEN** the AI agent calls `get_user_profile` with `{}`
- **THEN** the tool MUST return a successful response containing Alice's `userId`, `firstName`, `lastName`, `fullName`, `email`, `whatsappNumber`, and `createdAt`

#### Scenario: Unauthenticated MCP tool call is rejected

- **GIVEN** an unauthenticated MCP session with no Bearer token and no API key in arguments
- **WHEN** `get_user_profile` is called
- **THEN** the system MUST return an error indicating authentication is required

---

### Requirement: User Profile MCP Resource

The system MUST expose a readable MCP resource at URI `reedrich://user/profile` that provides the current authenticated user's profile.

#### Scenario: Read user profile resource

- **GIVEN** an authenticated user session
- **WHEN** the client requests `resources/read` with `uri: "reedrich://user/profile"`
- **THEN** the system MUST return the resource content with MIME type `application/json` containing the user profile object

---

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
