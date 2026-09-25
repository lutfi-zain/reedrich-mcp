## 1. Core Service

- [x] 1.1 Create `src/services/user.ts` defining `UserProfileDTO` and implementing `getUserProfile(db, userId)` with safe field projection.

## 2. REST API Endpoints

- [x] 2.1 Create `src/routes/me.ts` implementing `GET /` handler calling `getUserProfile(db, userId)` → 200.
- [x] 2.2 Mount routes `api.route("/me", me)` and `api.route("/user/profile", me)` in `src/routes/index.ts`.

## 3. MCP Tool & Resource

- [x] 3.1 Declare tool `get_user_profile` in `src/mcp.ts` tool registry.
- [x] 3.2 Implement handler for `get_user_profile` in `src/mcp.ts` calling `getUserProfile(db, effectiveUserId)`.
- [x] 3.3 Register `reedrich://user/profile` in `ListResourcesRequestSchema` and add handler in `ReadResourceRequestSchema`.

## 4. Documentation
- [x] 4.1 Add `GET /api/v1/me` and `GET /api/v1/user/profile` path entries to `src/docs/openapi.ts`.
- [x] 4.2 Document `get_user_profile` and `GET /api/v1/me` in `src/docs/llms.ts`.

## 5. Tests & Verification

- [x] 5.1 Add unit tests in `tests/mcp.test.ts` verifying `getUserProfile`, `GET /api/v1/me`, `GET /api/v1/user/profile`, `get_user_profile` MCP tool, and `reedrich://user/profile` resource.
- [x] 5.2 Run `npm run typecheck` to verify zero type errors.
- [x] 5.3 Run `npm test` to verify all unit tests pass.
- [x] 5.4 Run `npm run test:local` to verify full local E2E user journey against local D1 dev server.
