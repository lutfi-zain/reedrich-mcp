## Context

The Reedrich MCP server runs on Cloudflare Workers edge runtime backed by Cloudflare D1. The existing feedback tool `submit_feedback` in `src/mcp.ts` executes an HTTP POST to `https://api.github.com/repos/${GITHUB_REPO}/issues`. This creates a hard dependency on GitHub secrets (`GITHUB_TOKEN`, `GITHUB_REPO`) and external network availability.

To make the system self-contained, reliable, and compliant with zero-external-dependency principles, user feedback, feature requests, bug reports, and questions will be persisted directly to a new `feedbacks` table in Cloudflare D1 via Drizzle ORM.

## Goals & Non-Goals

### Goals
- Create a dedicated `feedbacks` table in Cloudflare D1 with UUID primary keys and proper indexes.
- Provide a clean, non-destructive migration file `drizzle/0004_add_feedbacks_table.sql`.
- Update `src/db/schema.ts` to export the Drizzle ORM `feedbacks` table definition.
- Refactor the `submit_feedback` tool in `src/mcp.ts` to validate inputs, auto-resolve authenticated user profiles, insert into `feedbacks`, and return structured JSON.
- Implement `POST /api/v1/feedback` in `src/index.ts` and document it in `GET /openapi.json`.
- Eliminate `GITHUB_TOKEN` and `GITHUB_REPO` requirements from application code and runtime environment.

### Non-Goals
- Admin feedback management / triage UI.
- Feedback mutation/update endpoints or auto-closing workflows.
- Webhook dispatching or external notification triggers on feedback creation.

## Key Technical Decisions

### Decision 1: Internal D1 Table over GitHub Issues
- **Context**: External GitHub API calls fail if tokens expire, rate limits hit, or repository names change.
- **Alternatives Considered**:
  1. GitHub Issues via Octokit / REST API (current fragile approach).
  2. Cloudflare KV / Vectorize storage.
  3. Cloudflare D1 relational storage (`feedbacks` table).
- **Decision**: Cloudflare D1 table `feedbacks`.
- **Rationale**: Keeps all relational business data unified within D1, supports structured filtering by type, status, and submitter, enables foreign-key linkage with `users.user_id`, and requires 0 external credentials.

### Decision 2: Schema Design & Indexing
- **Table Name**: `feedbacks`
- **Columns**:
  - `feedback_id`: `text` PK (UUID generated via `crypto.randomUUID()`).
  - `feedback_user_id`: `text` nullable foreign key to `users.user_id` with `ON DELETE SET NULL`.
  - `feedback_title`: `text` not null (length 5–200).
  - `feedback_content`: `text` not null (length 10–4000). Accepts input alias `feedback` or `content`.
  - `feedback_type`: `text` not null default `'feedback'` (restricted to `'feedback' | 'bug' | 'feature_request' | 'question'`).
  - `feedback_submitter_name`: `text` not null.
  - `feedback_submitter_email`: `text` not null.
  - `feedback_status`: `text` not null default `'new'` (restricted to `'new' | 'reviewed' | 'in_progress' | 'resolved' | 'closed'`).
  - `feedback_created_at`: `text` not null default `CURRENT_TIMESTAMP` (ISO-8601 string).
- **Indexes**:
  - `feedbacks_user_id_idx` on `feedback_user_id`
  - `feedbacks_type_idx` on `feedback_type`
  - `feedbacks_status_idx` on `feedback_status`
  - `feedbacks_created_at_idx` on `feedback_created_at`

### Decision 3: Submitter Identity Resolution Strategy
- **Authenticated Sessions**: When an active user session exists (e.g. from Bearer JWT / API key), the system queries the user profile to populate `feedback_user_id`, and defaults `feedback_submitter_name` (e.g. `userFirstName userLastName`) and `feedback_submitter_email` (`userEmail`) if not explicitly overridden by tool arguments.
- **Unauthenticated / Anonymous Submissions**: For public or anonymous submissions, `feedback_user_id` is stored as `NULL`, requiring valid `name` and `email` input arguments.

## Migration & Non-Destructive Data Invariant

Migration `drizzle/0004_add_feedbacks_table.sql`:
```sql
CREATE TABLE IF NOT EXISTS `feedbacks` (
	`feedback_id` text PRIMARY KEY NOT NULL,
	`feedback_user_id` text,
	`feedback_title` text NOT NULL,
	`feedback_content` text NOT NULL,
	`feedback_type` text DEFAULT 'feedback' NOT NULL,
	`feedback_submitter_name` text NOT NULL,
	`feedback_submitter_email` text NOT NULL,
	`feedback_status` text DEFAULT 'new' NOT NULL,
	`feedback_created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`feedback_user_id`) REFERENCES `users`(`user_id`) ON UPDATE no action ON DELETE set null
);

CREATE INDEX IF NOT EXISTS `feedbacks_user_id_idx` ON `feedbacks` (`feedback_user_id`);
CREATE INDEX IF NOT EXISTS `feedbacks_type_idx` ON `feedbacks` (`feedback_type`);
CREATE INDEX IF NOT EXISTS `feedbacks_status_idx` ON `feedbacks` (`feedback_status`);
CREATE INDEX IF NOT EXISTS `feedbacks_created_at_idx` ON `feedbacks` (`feedback_created_at`);
```
This migration is purely additive: it creates a new table and new indexes, with zero modifications or deletions to existing tables (`users`, `wallets`, `categories`, `budgets`, `transactions`, `debts_loans`).

## Risks & Mitigations

- **[Risk]** Missing submitter details on unauthenticated tool calls.
  - **Mitigation**: Strict validation: if not authenticated and `name` or `email` are missing/empty, return a descriptive 400 validation error specifying required fields.
- **[Risk]** Large feedback text payloads causing worker memory or D1 payload limit issues.
  - **Mitigation**: Enforce maximum lengths of 200 characters for `title` and 4,000 characters for `content`.
- **[Risk]** Legacy code paths attempting to access `env.GITHUB_TOKEN`.
  - **Mitigation**: Completely remove references to `GITHUB_TOKEN` and `GITHUB_REPO` in `src/mcp.ts` and `src/index.ts`.
