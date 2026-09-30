## 1. Service Layer

- [x] 1.1 Replace hardcoded `` `[Recurring] ...` `` descriptions with plain template names at all three insert sites in `src/services/recurring.ts` (create materialization, update propagation, apply fallback).

## 2. Tests & Verification

- [x] 2.1 Add unit tests in `tests/mcp.test.ts` asserting materialized planned rows and apply fallback rows carry the plain template name without prefix.
- [x] 2.2 Run `npm run typecheck` to verify zero TypeScript static check errors.
- [x] 2.3 Run `npm test` to verify all unit tests pass with zero regressions.
- [x] 2.4 Run `npm run test:local` to verify full local E2E journey integrity.
