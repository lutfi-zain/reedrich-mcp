## 1. Core Logic

- [x] 1.1 Update wallet predicate construction in `src/services/transaction.ts` to use wallet-inclusive `OR` matching when only `walletId` is supplied, directed `AND` matching when both `walletId` and `targetWalletId` are supplied, and destination-only matching when only `targetWalletId` is supplied.
- [x] 1.2 Update OpenAPI descriptions for `walletId` and `targetWalletId` on `GET /api/v1/transactions` in `src/docs/openapi.ts`.

## 2. Tests & Verification

- [x] 2.1 Add unit tests in `tests/mcp.test.ts` verifying incoming transfers appear in destination wallet history and directed source-to-destination filtering remains precise.
- [x] 2.2 Run `npm run typecheck` to verify zero TypeScript static check errors.
- [x] 2.3 Run `npm test` to verify all unit tests pass with zero regressions.
- [x] 2.4 Run `npm run test:local` to verify full local E2E journey integrity.
