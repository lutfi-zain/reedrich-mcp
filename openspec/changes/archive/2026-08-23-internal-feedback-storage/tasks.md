## 1. Schema & Migration

- [x] 1.1 Update `src/db/schema.ts` to define and export the `feedbacks` Drizzle SQLite table schema with columns (`feedbackId`, `feedbackUserId`, `feedbackTitle`, `feedbackContent`, `feedbackType`, `feedbackSubmitterName`, `feedbackSubmitterEmail`, `feedbackStatus`, `feedbackCreatedAt`) and associated indexes (`feedbacks_user_id_idx`, `feedbacks_type_idx`, `feedbacks_status_idx`, `feedbacks_created_at_idx`).
- [x] 1.2 Create D1 non-destructive migration file `drizzle/0004_add_feedbacks_table.sql` containing `CREATE TABLE IF NOT EXISTS feedbacks` and index statements.

## 2. MCP Tool Handler Implementation

- [x] 2.1 Update `src/mcp.ts` tool declaration for `submit_feedback` to reflect updated description, parameter schemas (`title`, `feedback`/`content`, `type`, `name`, `email`), and remove any references to GitHub.
- [x] 2.2 Refactor `submit_feedback` handler in `src/mcp.ts` to validate parameters (title: 5-200 chars, content: 10-4000 chars, type enum), auto-resolve submitter profile when authenticated, insert the feedback record into D1 `feedbacks` table, and return structured JSON response `{ success: true, feedbackId, type, status: "new", submitter: { name, email, userId }, submittedAt }`.
- [x] 2.3 Remove unused `GITHUB_TOKEN` and `GITHUB_REPO` environment bindings, imports, or references across `src/mcp.ts` and `src/index.ts`.

## 3. REST Endpoint & OpenAPI Schema

- [x] 3.1 Implement `POST /api/v1/feedback` route in `src/index.ts` supporting direct JSON submissions with authentication auto-resolution or explicit submitter details.
- [x] 3.2 Update `GET /openapi.json` definition in `src/index.ts` to document `/api/v1/feedback` request and response schemas.

## 4. Verification & Testing

- [x] 4.1 Update or add unit/integration tests in `tests/mcp.test.ts` (or dedicated test suite) covering `submit_feedback` validation, database persistence in D1, authenticated vs anonymous submissions, and error handling.
- [x] 4.2 Run `npx tsc --noEmit` and `npm test` to verify zero TypeScript errors and all unit tests passing.
