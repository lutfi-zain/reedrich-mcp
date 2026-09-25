## Context

The `users` table in Cloudflare D1 already stores full user profile records (`userId`, `userFirstName`, `userLastName`, `userEmail`, `userWhatsappNumber`, `userApiKeyHash`, `userCreatedAt`). While registration and login routines return user information upon initial credential exchange, there is currently no query method or route to retrieve profile details for returning authenticated sessions. See `proposal.md` for background motivation.

## Goals / Non-Goals

**Goals:**
- Provide a transport-neutral service function `getUserProfile(db, userId)` in `src/services/user.ts`.
- Expose `GET /api/v1/me` (and alias `GET /api/v1/user/profile`) in Hono REST API.
- Expose `get_user_profile` tool in MCP JSON-RPC server.
- Expose `reedrich://user/profile` resource in MCP server.
- Enforce strict credential security: omit `userApiKeyHash` from all DTO responses.

**Non-Goals:**
- Profile mutation (e.g. `PATCH /api/v1/me` to update name or phone number) is deferred to a future change.
- Password or credential management; API keys and JWT tokens remain managed via existing auth utilities.
- Database schema changes; no migrations are required.

## Decisions

### 1. Dedicated Service Module (`src/services/user.ts`)

**Decision**: Place `getUserProfile` in a new service file `src/services/user.ts` rather than overloading `src/services/auth.ts`.

**Rationale**: `auth.ts` focuses on credential generation, passwordless token exchanges, and onboarding readiness checks. Separating profile retrieval into `user.ts` aligns with Domain-Driven Design (DDD) boundaries where user entity management is distinct from authentication mechanisms.

### 2. Standard Safe DTO Projection

**Decision**: Explicitly project the database record to a clean `UserProfileDTO` shape:

```typescript
export interface UserProfileDTO {
  userId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  whatsappNumber: string;
  createdAt: string;
}
```

**Rationale**: Directly returning `schema.users.$inferSelect` risks accidental leakage of `userApiKeyHash` to clients or loggers. Constructing a typed DTO guarantees that credential hashes never cross the boundary.

### 3. Route Colocation: `GET /api/v1/me` and `GET /api/v1/user/profile`

**Decision**: Implement `src/routes/me.ts` and mount it at both `/me` and `/user/profile` in `src/routes/index.ts`.

**Rationale**: `/me` is the modern REST standard (RFC 6750, GitHub, Stripe, Discord) for accessing the current principal's profile. Supporting `/user/profile` provides full semantic parity with resource naming conventions.

### 4. MCP Tool and Resource Integration

**Decision**:
- Tool: `get_user_profile` in `src/mcp.ts` with no required parameters (optional `apiKey` in args for fallback).
- Resource: `reedrich://user/profile` with MIME type `application/json`.

**Rationale**: AI agents frequently need to know who they are speaking with to personalize responses, address the user by name, or verify the registered email address. MCP resources allow context-aware clients to inspect profile data ambiently.

## Risks / Trade-offs

- **[Risk] Sensitive Credential Leakage** -> Explicit TypeScript projection in `getUserProfile` returns only safe public fields; `userApiKeyHash` is never selected or mapped.
- **[Risk] Multi-Tenant Data Cross-Talk** -> Query is hardcoded to `eq(schema.users.userId, userId)` extracted from the authenticated session context. Cross-tenant retrieval is architecturally impossible.
- **[Risk] Non-Existent User State** -> If a valid JWT contains a `userId` that was deleted from D1, `getUserProfile` throws `notFound("User", userId)` mapping to HTTP `404 Not Found`.
