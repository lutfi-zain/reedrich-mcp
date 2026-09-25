## Why

Authenticated principals (via OAuth 2.0 PKCE Bearer tokens or persistent API keys) currently have no dedicated endpoint or MCP tool to inspect their own user profile details (first name, last name, full name, email, WhatsApp number, registration date). While credentials are issued at registration/login, returning users and AI agents interacting within ambient authenticated sessions cannot retrieve user identity to personalize greetings, verify account context, or render user profile headers in web/mobile dashboards.

## What Changes

- Add a transport-neutral service function `getUserProfile(db, userId)` in `src/services/user.ts` that queries the authenticated user's record from Cloudflare D1 and returns a sanitized profile DTO (excluding `userApiKeyHash`).
- Add REST endpoint `GET /api/v1/me` (with alias `GET /api/v1/user/profile`) in `src/routes/me.ts`, secured by the existing REST auth middleware.
- Add MCP tool `get_user_profile` in `src/mcp.ts` allowing AI agents to retrieve the authenticated user's profile with zero required arguments.
- Add MCP resource `reedrich://user/profile` in `src/mcp.ts` exposing readable user profile data.
- Document `GET /api/v1/me` in `src/docs/openapi.ts` under a new or existing tag `User Profile` and update `src/docs/llms.ts`.

## Capabilities

### New Capabilities
- `user-profile`: Defines the behavior contract for retrieving authenticated user profile information across REST (`GET /api/v1/me`) and MCP (`get_user_profile`, `reedrich://user/profile`), enforcing multi-tenant row-level security and strict credential hash omission.

### Modified Capabilities
- None. Existing authentication, transaction, and wallet flows are unchanged.

## Non-Goals

- No profile editing or mutating capabilities (e.g. updating name or phone number) in this change; this change focuses on profile retrieval.
- No public user lookup or cross-tenant inspection; queries are strictly constrained to the authenticated `userId`.
- No database migrations or schema alterations; the existing `users` table already stores all required fields.

## Impact

- **Services**: New service file `src/services/user.ts`.
- **Routes**: New route file `src/routes/me.ts` registered in `src/routes/index.ts`.
- **MCP Server**: New tool `get_user_profile` and resource `reedrich://user/profile` in `src/mcp.ts`.
- **Docs**: OpenAPI documentation in `src/docs/openapi.ts` and manifest update in `src/docs/llms.ts`.
- **Security**: Strict multi-tenant isolation via `eq(users.userId, userId)`. Sensitive hash `userApiKeyHash` is never included in responses.
