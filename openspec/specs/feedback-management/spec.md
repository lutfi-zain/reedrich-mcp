# feedback-management Specification

## Purpose

Provides a reliable, internally persisted mechanism for capturing user feedback, bug reports, feature requests, and support inquiries directly within Cloudflare D1 without external third-party service dependencies.

## Requirements

### Requirement: Internal Feedback Storage Schema

The system SHALL persist all submitted feedback records in the Cloudflare D1 SQLite database within the `feedbacks` table.

#### Scenario: Feedback record creation with required columns
- **GIVEN** a valid feedback submission request
- **WHEN** the system records the feedback in Cloudflare D1
- **THEN** the record MUST contain a UUID `feedback_id`, non-null `feedback_title` (5–200 characters), non-null `feedback_content` (10–4000 characters), `feedback_type` ('feedback' | 'bug' | 'feature_request' | 'question'), `feedback_submitter_name`, `feedback_submitter_email`, `feedback_status` defaulting to 'new', and `feedback_created_at` timestamp.

#### Scenario: Nullable user foreign key linkage
- **GIVEN** a submission from an authenticated user with user ID `u-123`
- **WHEN** the feedback is inserted into the `feedbacks` table
- **THEN** `feedback_user_id` SHALL be set to `u-123`, and if the user is deleted, `feedback_user_id` SHALL be set to NULL via foreign key constraint `ON DELETE SET NULL`.

#### Scenario: Anonymous or unauthenticated submission
- **GIVEN** a submission from an unauthenticated user with provided submitter name and email
- **WHEN** the feedback is inserted into the `feedbacks` table
- **THEN** `feedback_user_id` SHALL be NULL while `feedback_submitter_name` and `feedback_submitter_email` SHALL be persisted.

---

### Requirement: MCP Tool `submit_feedback`

The system SHALL expose an MCP tool named `submit_feedback` that writes directly to the internal D1 database and does not depend on GitHub environment tokens.

#### Scenario: Successful feedback submission via MCP
- **GIVEN** an authenticated or unauthenticated MCP session
- **WHEN** the `submit_feedback` tool is invoked with a valid `title` (e.g. "Add CSV export"), `content` or `feedback` (e.g. "Please add support for CSV transaction export"), and optional `type` ("feature_request")
- **THEN** the system MUST insert the record into `feedbacks` and return a structured JSON response with `success: true`, `feedbackId`, `status: "new"`, `type: "feature_request"`, submitter information, and `submittedAt`.

#### Scenario: Auto-resolution of submitter identity from session
- **GIVEN** an authenticated MCP session with active user profile (First Name: "Alice", Last Name: "Smith", Email: "alice@example.com")
- **WHEN** the `submit_feedback` tool is invoked without explicit `name` or `email` parameters
- **THEN** the system MUST populate `feedback_submitter_name` with "Alice Smith", `feedback_submitter_email` with "alice@example.com", and `feedback_user_id` with Alice's user ID.

#### Scenario: Validation failure for invalid input
- **GIVEN** an MCP tool invocation for `submit_feedback`
- **WHEN** the `title` length is less than 5 characters or `feedback`/`content` length is less than 10 characters or `type` is not one of ('feedback', 'bug', 'feature_request', 'question')
- **THEN** the system MUST return an error message indicating the specific validation violation and MUST NOT insert any database row.

---

### Requirement: REST API Feedback Endpoint & OpenAPI Spec

The system SHALL provide a REST endpoint `POST /api/v1/feedback` and document it in the public OpenAPI specification.

#### Scenario: Successful REST feedback creation
- **GIVEN** a client sending a `POST /api/v1/feedback` request with valid JSON payload containing `title`, `content`, `type`, `name`, and `email`
- **WHEN** the request is processed
- **THEN** the system MUST return HTTP 201 Created with a JSON body containing the newly created feedback ID, status, and metadata.

#### Scenario: OpenAPI documentation reflection
- **GIVEN** a client requesting `GET /openapi.json`
- **WHEN** the OpenAPI 3.0 specification is rendered
- **THEN** the `/api/v1/feedback` path MUST be present with schemas for `POST` request body and response definitions.
