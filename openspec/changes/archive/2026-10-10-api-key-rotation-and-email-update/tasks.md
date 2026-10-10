## 1. Service Layer Implementation

- [x] 1.1 Expand `UpdateUserProfileParams` in `src/services/user.ts` to include optional `email?: unknown`
- [x] 1.2 Implement email validation (`isValidEmail`), lowercase normalization, and case-insensitive uniqueness check (`ne(schema.users.userId, userId)`) in `updateUserProfile()`
- [x] 1.3 Implement `rotateUserApiKey(db, userId, confirm)` in `src/services/user.ts` with explicit `confirm: true` validation
- [x] 1.4 Add pre-flight email check in `rotateUserApiKey()` to ensure the user has a valid registered email before rotating
- [x] 1.5 Generate new API key using `generateApiKey()`, compute SHA-256 hash using `hashApiKey()`, and atomically update `users.userApiKeyHash`
- [x] 1.6 Format rotation response DTO with `apiKey`, `message`, and `rotatedAt` timestamp

## 2. REST API Routes

- [x] 2.1 Update `PATCH /api/v1/me` and alias `PATCH /api/v1/user/profile` in `src/routes/me.ts` to accept and pass `email` to `updateUserProfile()`
- [x] 2.2 Mount `POST /api/v1/me/api-key/rotate` and alias `POST /api/v1/user/profile/api-key/rotate` in `src/routes/me.ts`
- [x] 2.3 Extract authenticated `userId`, parse `{ confirm }` from JSON body, invoke `rotateUserApiKey()`, and return HTTP 200 JSON response

## 3. MCP Tool Registry

- [x] 3.1 Register `update_user_profile` in `src/mcp.ts` with parameters `firstName`, `lastName`, `email`, `whatsappNumber`, and optional `apiKey` fallback
- [x] 3.2 Implement tool call handler for `update_user_profile` in `src/mcp.ts` delegating to `updateUserProfile()`
- [x] 3.3 Register `rotate_api_key` in `src/mcp.ts` with required `confirm: boolean` and optional `apiKey` fallback
- [x] 3.4 Implement tool call handler for `rotate_api_key` in `src/mcp.ts` delegating to `rotateUserApiKey()`

## 4. Documentation & Schema Hygiene

- [x] 4.1 Update OpenAPI specifications in `src/docs/openapi.ts` to include `POST /api/v1/me/api-key/rotate` and updated `PATCH /api/v1/me` schema
- [x] 4.2 Update LLMs system reference in `src/docs/llms.ts` documenting API key rotation and profile email update behavior

## 5. Verification & Test Suite

- [x] 5.1 Add unit tests in `tests/mcp.test.ts` for profile email updates via `PATCH /api/v1/me` (success, invalid email, duplicate collision 409)
- [x] 5.2 Add unit tests in `tests/mcp.test.ts` for MCP tool `update_user_profile`
- [x] 5.3 Add unit tests in `tests/mcp.test.ts` for REST endpoint `POST /api/v1/me/api-key/rotate` (rejection without confirm, rejection without email, success with new key)
- [x] 5.4 Add unit tests in `tests/mcp.test.ts verifying previous API key is immediately revoked and new API key authenticates successfully
- [x] 5.5 Add unit tests in `tests/mcp.test.ts` for MCP tool `rotate_api_key`
- [x] 5.6 Run `npm run typecheck` to confirm zero TypeScript compilation errors
- [x] 5.7 Run `npm test` locally to verify full test suite passes with zero regressions
