## 1. Schema & Database Migration

- [ ] 1.1 Add `walletIsLocked` column (`integer("wallet_is_locked").notNull().default(0)`) and composite index `wallets_user_locked_idx` in `src/db/schema.ts`
- [ ] 1.2 Create D1 migration file `drizzle/0006_add_wallet_lock.sql` adhering strictly to the Zero-Remote-Deletion Invariant
- [ ] 1.3 Update `tests/mcp.test.ts` `createTestDB()` migration files list to include `0006_add_wallet_lock.sql`

## 2. Service Layer Implementation

- [ ] 2.1 Update `CreateWalletParams` interface and `createWallet` in `src/services/wallet.ts` to accept optional `isLocked?: unknown` with boolean validation (defaulting to `false` / `0`)
- [ ] 2.2 Update `UpdateWalletParams` interface and `updateWallet` in `src/services/wallet.ts` to support toggling `isLocked?: unknown`
- [ ] 2.3 Update `listWallets` in `src/services/wallet.ts` to return `walletIsLocked` and support optional filtering
- [ ] 2.4 Implement liquidity partitioning (`spendableCash` vs `lockedCash`) with currency conversion in `src/services/summary.ts`
- [ ] 2.5 Implement deterministic `safeToSpend`, `dailySafeToSpend`, and `safeToSpendDetails` mathematical calculation in `src/services/summary.ts`
- [ ] 2.6 Implement soft-lock informational notices when recording expenses or outward transfers against locked wallets in `src/services/transaction.ts` and `src/services/transfer.ts`

## 3. MCP Handlers, Prompts & REST Endpoints

- [ ] 3.1 Update `manage_wallet` tool input schema and execution handler in `src/mcp.ts` to accept `isLocked` for `create` and `update` actions
- [ ] 3.2 Update `financial_summary` tool return payload in `src/mcp.ts` to expose `spendableCash`, `lockedCash`, and `safeToSpend` metrics
- [ ] 3.3 Update `reedrich://wallets/list` resource handler in `src/mcp.ts` to expose `walletIsLocked`
- [ ] 3.4 Update `daily_briefing` and `financial_planning` prompt templates in `src/mcp.ts` to guide AI agents on Safe-to-Spend liquidity and capital protection
- [ ] 3.5 Update OpenAPI schemas and descriptions in `src/docs/openapi.ts` for `Wallet` and `FinancialSummary`

## 4. Tests & Verification

- [ ] 4.1 Add test cases in `tests/mcp.test.ts` for creating and updating wallets with `isLocked: true/false` and verifying invalid type validation
- [ ] 4.2 Add test cases in `tests/mcp.test.ts` verifying accurate `spendableCash`, `lockedCash`, and `safeToSpend` calculation with mixed locked/unlocked wallets
- [ ] 4.3 Add test cases in `tests/mcp.test.ts` verifying soft-lock informational notices when spending from locked wallets
- [ ] 4.4 Run static type check via `npm run typecheck` to verify zero type regressions
- [ ] 4.5 Run test suite via `npm test` against local mock D1 to ensure all unit and integration tests pass
