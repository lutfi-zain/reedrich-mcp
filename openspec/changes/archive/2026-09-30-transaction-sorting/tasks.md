## 1. Core Logic

- [x] 1.1 Extend `ListTransactionsFilters` with `orderBy?: unknown` and `direction?: unknown`, validate against whitelists, and apply primary sort plus `createdAt DESC` tiebreaker in `src/services/transaction.ts`.
- [x] 1.2 Pass `orderBy`/`direction` query params through `GET /api/v1/transactions` in `src/routes/transactions.ts`.
- [x] 1.3 Add `orderBy`/`direction` enums to `list_transactions` tool schema in `src/mcp.ts`.

## 2. Documentation

- [x] 2.1 Document `orderBy`/`direction` on `GET /api/v1/transactions` in `src/docs/openapi.ts`.
- [x] 2.2 Document ordering params in transaction query section of `src/docs/llms.ts`.

## 3. Tests & Verification

- [x] 3.1 Add unit tests in `tests/mcp.test.ts` for amount ASC/DESC, date ASC, description ordering, defaults, and 400 on invalid `orderBy`/`direction`.
- [x] 3.2 Run `npm run typecheck` to verify zero TypeScript static check errors.
- [x] 3.3 Run `npm test` to verify all unit tests pass with zero regressions.
- [x] 3.4 Run `npm run test:local` to verify full local E2E journey integrity.
