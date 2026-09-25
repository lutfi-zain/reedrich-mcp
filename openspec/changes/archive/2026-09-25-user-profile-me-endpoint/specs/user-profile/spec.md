## Purpose

Defines the behavior contract for retrieving authenticated user profile information across REST API endpoints and MCP interfaces. This capability enables AI agents and dashboard clients to access the active user's personal details while strictly enforcing multi-tenant row-level security and prohibiting credential exposure.

## ADDED Requirements

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
