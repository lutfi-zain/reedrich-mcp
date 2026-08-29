## Why

The current implementation of the `submit_feedback` MCP tool relies on external GitHub Issue creation using repository secrets (`GITHUB_TOKEN` and `GITHUB_REPO`). This architecture has critical operational and reliability limitations:
1. **Fragility & Failure Modes**: If the GitHub token expires, lacks repo write permissions, or GitHub API experiences downtime/rate limits, feedback submission fails entirely.
2. **Configuration Burden**: Every deployment or local test environment requires external GitHub API tokens to be provisioned as environment secrets.
3. **No Queryability & Internal Ownership**: User feedback, bug reports, feature requests, and inquiries cannot be queried or analyzed internally within the Cloudflare Workers / D1 ecosystem.
4. **Platform Disconnect**: REST endpoints (`POST /api/v1/feedback`) and ChatGPT Custom Actions lack a unified, zero-external-dependency feedback intake mechanism backed by the database.

Storing feedback internally in a new Cloudflare D1 table `feedbacks` eliminates external GitHub dependencies, guarantees fast and reliable transactions, supports authenticated identity auto-resolution, and seamlessly integrates with both the MCP tool layer and REST/ChatGPT Actions.

## What Changes

- **Database Schema (`src/db/schema.ts` & D1 Migration)**:
  - Add new `feedbacks` table with columns: `feedback_id` (UUID PK), `feedback_user_id` (FK to `users.user_id` ON DELETE SET NULL, nullable), `feedback_title` (text not null), `feedback_content` (text not null), `feedback_type` (text not null default 'feedback'), `feedback_submitter_name` (text not null), `feedback_submitter_email` (text not null), `feedback_status` (text not null default 'new'), `feedback_created_at` (text not null default `CURRENT_TIMESTAMP`).
  - Add indexes on `feedback_user_id`, `feedback_type`, `feedback_status`, and `feedback_created_at`.
  - Provide non-destructive D1 migration file `drizzle/0004_add_feedbacks_table.sql`.
- **MCP Tool (`src/mcp.ts`)**:
  - Update `submit_feedback` definition and handler: remove external GitHub REST API calls (`fetch("https://api.github.com/...")`), validate input constraints (title: 5–200 chars, content: 10–4000 chars, type: feedback | bug | feature_request | question), auto-resolve submitter profile for authenticated sessions if name/email are not explicitly passed.
  - Insert record into `feedbacks` table via Drizzle ORM and return structured confirmation payload with `feedbackId`, `status: "new"`, `type`, `submitter`, and `submittedAt`.
  - Remove all dependencies on `GITHUB_TOKEN` and `GITHUB_REPO` environment variables from runtime types and logic.
- **REST API & OpenAPI Specification (`src/index.ts`)**:
  - Implement `POST /api/v1/feedback` endpoint with optional authentication (bearer token / API key) or direct submitter details.
  - Update OpenAPI 3.0 schema generation in `GET /openapi.json` to include the `/api/v1/feedback` path, request body, and response components.

## Capabilities

### New Capabilities
- `specs/feedback-management/spec.md`: Internal storage, validation, submission, and querying capability for user feedback, bug reports, feature requests, and support questions in Cloudflare D1.

### Modified Capabilities
- None (creating clean new capability `specs/feedback-management/spec.md`).

## Impact

- **Breaking Changes**: None for callers. `submit_feedback` tool parameters (`title`, `feedback`/`content`, `type`, `name`, `email`) remain backwards compatible, but no longer depend on GitHub secrets. Return payload is structured JSON.
- **Environment & Secrets**: `GITHUB_TOKEN` and `GITHUB_REPO` are no longer required in `wrangler.toml` or environment bindings.
- **Security & Multi-Tenancy**: Submitter identity is cleanly linked to `feedback_user_id` when authenticated; anonymous/unauthenticated submissions (e.g. from public REST or unauthenticated MCP callers) are permitted with explicit submitter name and email, with foreign key set to NULL.
- **Performance**: High performance edge writes to Cloudflare D1 with zero external network latency to third-party APIs.
- **Non-Goals**:
  - Building an administrative back-office GUI for feedback triage.
  - Sending automated email notifications on new feedback creation.
  - Syncing D1 feedback back to external ticketing systems (Jira, Linear, GitHub).
