## Why

Persistent API keys (`rd_live_...`) are long-lived credentials stored as SHA-256 hashes in ReedRich. Currently, once issued, an API key cannot be rotated or refreshed by the user. If an API key is inadvertently exposed in agent prompts, committed to git, or shared across test environments, the user has no self-service mechanism to invalidate it without manual database intervention. Furthermore, users who onboarded via Google OAuth never receive their plaintext API key because it is generated and hashed server-side upon first login, preventing them from connecting external MCP clients (Claude Desktop, Cursor, Telegram bot). 

Introducing an API key rotation endpoint and MCP tool allows users to safely invalidate compromised or legacy keys and generate a fresh key on demand. To guarantee safety and prevent permanent account lockouts, API key rotation is strictly guarded by the presence of a verified, valid email address on the account. Additionally, enabling email updates on the user profile via REST and MCP empowers users who registered via bots or partial flows to attach their permanent email identity prior to key rotation.

## What Changes

1. **API Key Rotation Service & Endpoint**:
   - Add pure service function `rotateUserApiKey(db, userId, confirm)` that verifies the user has a valid registered email, generates a new cryptographically secure API key (`rd_live_...`), computes its SHA-256 hash, and atomically replaces `user_api_key_hash` in the database.
   - Expose REST endpoint `POST /api/v1/me/api-key/rotate` and alias `POST /api/v1/user/profile/api-key/rotate` requiring active Bearer authentication and `{ "confirm": true }` in JSON body.
   - Invalidate previous API key immediately upon successful rotation. Active stateless JWT sessions (15-minute TTL) and OAuth access tokens expire naturally without immediate revocation.

2. **MCP Tool for API Key Rotation**:
   - Register new MCP tool `rotate_api_key` with input schema requiring `confirm: true` (boolean) and optional `apiKey` fallback for transport parity.
   - Return new plaintext API key once in the response with a explicit security warning that the key will not be displayed again.

3. **User Profile Email Mutability & Parity**:
   - Expand `updateUserProfile()` service function and `PATCH /api/v1/me` (and alias) to accept `email` in addition to `firstName`, `lastName`, and `whatsappNumber`.
   - Validate email format (`isValidEmail`) and enforce global uniqueness against `users.user_email` (HTTP 409 Conflict if already claimed by another user).
   - Register new MCP tool `update_user_profile` to achieve 1:1 parity with REST profile update capabilities.

4. **Security, Observability & Documentation**:
   - Ensure `WorkerTracer` telemetry redacts new API keys in trace attributes and logs.
   - Update OpenAPI documentation (`src/docs/openapi.ts`) and AI agent context (`src/docs/llms.ts`).

## Capabilities

### New Capabilities
- `specs/api-key-rotation/spec.md`: Self-service API key rotation via REST endpoint `POST /api/v1/me/api-key/rotate` and MCP tool `rotate_api_key`, with safety lockout prevention guardrail requiring an existing email address on the account.

### Modified Capabilities
- `specs/user-profile/spec.md`: Enables user profile mutation for `email` across REST (`PATCH /api/v1/me`) and introduces MCP tool `update_user_profile` with uniqueness conflict validation.

## Non-Goals

- **Stateless JWT Blacklisting**: Invalidation of in-flight 15-minute HS256 JWTs or OAuth tokens via distributed Redis/KV blacklist is out of scope. These tokens expire naturally within their short 900-second TTL.
- **Email Verification Codes / Magic Links**: Sending verification emails with OTP/magic links via external SMTP (e.g. Resend, Sendgrid) is out of scope for this change; email validity is validated via regex and duplicate checking.
- **Database Schema Alteration**: No migrations or schema changes are required; existing `users.user_api_key_hash` and `users.user_email` columns are reused directly.

## Impact & Constraints

- **Edge Runtime**: All cryptographic operations use Web Standard `crypto.subtle.digest` and `crypto.getRandomValues`. Zero Node.js native dependencies.
- **Multi-Tenancy & RLS**: All updates strictly target the authenticated `userId`. Cross-tenant key rotation is structurally impossible.
- **Zero-Remote-Deletion Invariant**: Only update operations are executed on existing user records; no destructive table or record deletions.
