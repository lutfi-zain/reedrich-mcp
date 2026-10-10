## Context

See `proposal.md` for motivation and background.

Currently, ReedRich stores user credentials as SHA-256 hashes in `users.user_api_key_hash`. The system verifies API keys during incoming requests by computing the SHA-256 hash of the header/query/tool argument and performing an indexed database lookup (`uniqueIndex("users_api_key_hash_idx")`). 

The REST route `/api/v1/me` exposes `GET` and `PATCH`, but the `PATCH` handler and `updateUserProfile()` service function currently restrict modifiable fields to `firstName`, `lastName`, and `whatsappNumber`, leaving `user_email` immutable after registration. In MCP, only `get_user_profile` exists, with no profile mutation tool and no key rotation tool.

## Goals / Non-Goals

**Goals:**
- Provide a transport-agnostic service function `rotateUserApiKey()` that safely rotates the persistent API key for the authenticated user.
- Guarantee lockout prevention: refuse key rotation if the user does not have a verified, non-empty email address.
- Support self-service email updates in `updateUserProfile()` with case-insensitive uniqueness validation.
- Expose REST endpoint `POST /api/v1/me/api-key/rotate` (and `/api/v1/user/profile/api-key/rotate`) and MCP tool `rotate_api_key`.
- Expose MCP tool `update_user_profile` for 1:1 parity with REST profile updates.
- Ensure zero leakage of raw API keys in telemetry traces (`WorkerTracer`).

**Non-Goals:**
- Building distributed token blacklists for 15-minute HS256 JWTs or OAuth tokens.
- Integrating external email delivery providers (Resend, Sendgrid, SES) for outbound OTP verification emails.
- Altering the database schema or creating Drizzle migrations (existing columns and indexes are reused).

## Decisions

### Decision 1: Service Function Separation & Transport-Neutral Architecture

We place `rotateUserApiKey()` in `src/services/user.ts` (or `src/services/auth.ts`) following the project's strict 2-layer architecture (Hono route / MCP tool handler -> Service function -> Drizzle query builder).

```
Transport Layer (REST Route / MCP Tool)
       │
       ▼ (passes db, authenticated userId, typed params)
Service Layer: rotateUserApiKey(db, userId, confirm)
       │
       ├── 1. Validate confirm === true
       ├── 2. Fetch user profile, verify userEmail is valid
       ├── 3. Generate new raw key: generateApiKey() -> rd_live_<hex32>
       ├── 4. Hash key: hashApiKey(newKey) -> SHA-256 hex
       └── 5. db.update(users).set({ userApiKeyHash: newHash }).where(eq(users.userId, userId))
```

*Rationale*: Keeps business logic completely independent of transport protocols, enabling identical behavior across HTTP REST and MCP JSON-RPC.

### Decision 2: Pre-flight Email Check for Permanent Lockout Prevention

Before generating a new key, `rotateUserApiKey()` executes an invariant check:
```typescript
const [user] = await db
  .select({ email: schema.users.userEmail })
  .from(schema.users)
  .where(eq(schema.users.userId, userId))
  .limit(1);

if (!user || !user.email || !isValidEmail(user.email)) {
  validationError(
    "A valid email address must be connected to your account before rotating your API key to prevent permanent lockout.",
    "email"
  );
}
```

*Rationale*: If an anonymous user (or a bot-created account without a permanent email) rotates their key and experiences network loss before saving the returned key, they would be locked out forever. Requiring a valid email ensures the account can always be recovered or authenticated via Google OAuth.

### Decision 3: Explicit Confirmation Guard (`confirm: true`)

Both the REST body and the MCP tool schema require `{ "confirm": true }`.
If `confirm` is false or omitted:
```typescript
if (!confirm) {
  validationError("Explicit confirmation (confirm: true) is required to rotate your API key as the previous key will be immediately invalidated.", "confirm");
}
```

*Rationale*: LLM agents operating in tool-calling loops could unintentionally invoke `rotate_api_key` during exploratory prompts. Requiring explicit boolean confirmation prevents accidental credential destruction.

### Decision 4: Immediate Database Revocation with Natural JWT Expiry

When `user_api_key_hash` is updated in PostgreSQL/D1:
- The previous `rd_live_...` key becomes immediately invalid for all subsequent API key lookups because the hash lookup against `users.userApiKeyHash` will fail.
- Active short-lived JWT tokens (15-minute TTL) and OAuth access tokens are self-contained HS256 signatures containing `sub: userId`. They remain valid until their expiration timestamp.
- *Alternatives Considered*: Maintaining a revoked token list in SQLite/Hyperdrive. Rejected as unnecessary complexity: JWTs already expire in 900 seconds, and API key authentication (the persistent vector) is invalidated synchronously.

### Decision 5: Email Mutability in Profile Service with Unique Collision Check

In `updateUserProfile()`:
```typescript
if (email !== undefined) {
  if (typeof email !== "string" || !isValidEmail(email)) {
    validationError("Validation Error: 'email' must be a valid email address", "email");
  }
  const normalizedEmail = email.trim().toLowerCase();
  const [existing] = await db
    .select({ userId: schema.users.userId })
    .from(schema.users)
    .where(and(eq(schema.users.userEmail, normalizedEmail), ne(schema.users.userId, userId)))
    .limit(1);
  if (existing) {
    conflict(`Email '${normalizedEmail}' is already registered to another account.`);
  }
  updates.userEmail = normalizedEmail;
}
```

*Rationale*: Guarantees database unique constraint on `user_email` is never violated with an unhandled 500 database error, returning a clean 409 Conflict domain error instead.

## Data Modeling & Schema

No Drizzle schema changes or database migrations are required.
- Existing table: `users`
  - `user_id` (UUID PK)
  - `user_email` (text, unique)
  - `user_api_key_hash` (text, unique)
- Indexes: `users_email_idx` and `users_api_key_hash_idx` are already in place and indexed.

## Risks / Trade-offs

- **[Risk] Telemetry and logs leaking the newly issued API key**
  -> *Mitigation*: `WorkerTracer` in `src/observability/tracer.ts` already features automatic redaction (`\b(?:rd_live_|fp_live_)[A-Za-z0-9_-]+` -> `[REDACTED_API_KEY]`). Service responses return the key to the caller over HTTPS, but traces and spans will redact the value automatically.

- **[Risk] Client disconnects before saving the rotated API key**
  -> *Mitigation*: The email prerequisite ensures the user can always log in via Google OAuth or future passwordless email flows. In addition, the endpoint documentation warns clients to persist the key immediately.

- **[Risk] Cross-tenant key manipulation**
  -> *Mitigation*: The service function uses the authenticated `userId` extracted strictly by the auth middleware via RLS scoping (`eq(schema.users.userId, userId)`). No external `userId` parameter is accepted from the request body.
