## 1. Schema & Database Migration

- [x] 1.1 Add `goalWallets` junction table (`goal_id`, `wallet_id`, composite PK, cascade deletes, indexes on both columns) in `src/db/schema.ts`
- [x] 1.2 Create D1 migration file `drizzle/0007_goal_wallet_links.sql` adhering strictly to the Zero-Remote-Deletion Invariant
- [x] 1.3 Update `tests/mcp.test.ts` `createTestDB()` migration files list to include `0007_goal_wallet_links.sql`

## 2. FX Stablecoin Peg

- [x] 2.1 Add `normalizeCurrencyForFx` helper (USDT/USDC/DAI → USD, case-insensitive) in `src/utils/fx.ts`
- [x] 2.2 Wire peg normalization into `convertCurrency` with `usedPeg` marking on converted breakdown entries
- [x] 2.3 Add unit tests in `tests/mcp.test.ts` verifying USDT→IDR uses live USD rate with `usedPeg: true` and non-pegged currencies carry `usedPeg: false`

## 3. Goal Service Layer (Derived Progress + Link Operations)

- [x] 3.1 Implement `linkWallet`, `unlinkWallet` (idempotent link, RLS on goal + wallet, `NOT_FOUND` on cross-tenant forgery), and `listLinkedWallets` in `src/services/goal.ts`
- [x] 3.2 Implement derived-read helper returning `currentAmount := Σ converted linked balances` with per-wallet breakdown (`walletId`, `walletName`, `balance`, `currency`, `convertedAmount`, `usedPeg`) and `isDerived` flag in `src/services/goal.ts`
- [x] 3.3 Route all goal read paths (`listGoals`, `getGoal`, goal objects in `financialSummary`) through the derived-read helper with stored-counter fallback for unlinked goals in `src/services/goal.ts`
- [x] 3.4 Remove `contributeGoal` service path and return `VALIDATION` deprecation error directing users to link wallets and record transactions

## 4. MCP Handlers, Prompts & REST Endpoints

- [x] 4.1 Update `manage_goal` tool in `src/mcp.ts`: add `link_wallet` / `unlink_wallet` actions, accept `walletIds` on `create`, remove `contribute` action, include `linkedWallets[]` and `isDerived` in payloads
- [x] 4.2 Update goal entries in `financial_summary` tool output in `src/mcp.ts` to carry derived progress and per-wallet breakdown
- [x] 4.3 Update `financial_planning` prompt template in `src/mcp.ts` to reason over linked-wallet derived progress
- [x] 4.4 Update `GET /api/v1/goals` response shape and OpenAPI `Goal` schema in `src/docs/openapi.ts` with link/breakdown fields and peg marker
- [x] 4.5 Write changelog + release notes entry documenting the **BREAKING** `contribute` removal and manual migration path (link wallets, discard manual counters)

## 5. Tests & Verification

- [x] 5.1 Add test cases in `tests/mcp.test.ts` for link/unlink flows: multi-wallet link, idempotent re-link, cross-tenant rejection, unlink isolation
- [x] 5.2 Add test cases in `tests/mcp.test.ts` verifying derived progress: `Σ` balances, auto-movement after linked-wallet transaction, locked-wallet inclusion, unlinked fallback to stored counter, first-link mode switch
- [x] 5.3 Add test cases in `tests/mcp.test.ts` verifying `contribute` action rejection with deprecation `VALIDATION` error
- [x] 5.4 Run static type check via `npm run typecheck` to verify zero type regressions
- [x] 5.5 Run test suite via `npm test` against local mock D1 to ensure all unit and integration tests pass
