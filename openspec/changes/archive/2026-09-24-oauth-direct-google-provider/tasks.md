## 1. Core Logic & Routing

- [x] 1.1 Update `GET /oauth/authorize` in `src/index.ts` to inspect `provider` and `idp` query parameters and trigger direct Google 302 redirect with signed state when set to `google`.
- [x] 1.2 Add rejection handling on `GET /oauth/authorize` for unsupported identity providers with HTTP 400 and `error: "invalid_request"`.

## 2. Documentation

- [x] 2.1 Document `provider` query parameter under `GET /oauth/authorize` in `src/docs/openapi.ts`.
- [x] 2.2 Update developer instructions in `src/docs/llms.ts` explaining the direct Google authorization pattern.

## 3. Tests & Verification

- [x] 3.1 Add unit tests in `tests/oauth.test.ts` verifying `GET /oauth/authorize?...&provider=google` and `...&idp=google` return HTTP 302 redirecting to `https://accounts.google.com/o/oauth2/v2/auth` with signed state.
- [x] 3.2 Add unit test in `tests/oauth.test.ts` verifying unsupported provider returns HTTP 400 with `invalid_request`.
- [x] 3.3 Add unit test in `tests/oauth.test.ts` verifying omission of provider parameter preserves 200 HTML consent rendering.
- [x] 3.4 Run static type check via `npm run typecheck` to verify zero type errors.
- [x] 3.5 Run test suite via `npm test` to verify all tests pass.
- [x] 3.6 Run `npm run test:local` (full E2E user journey against local D1 dev server) as pre-archive gate.
