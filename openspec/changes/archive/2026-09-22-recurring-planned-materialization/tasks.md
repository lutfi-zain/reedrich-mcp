## 1. Schema & Database Migration

- [x] 1.1 Add `templateId`, `occurrenceDate`, `realizedAt`, `plannedAmount` columns plus composite index on `transactions` in `src/db/schema.ts`
- [x] 1.2 Create D1 migration file `drizzle/0008_recurring_linkage.sql` adhering strictly to the Zero-Remote-Deletion Invariant
- [x] 1.3 Update `tests/mcp.test.ts` `createTestDB()` migration files list to include `0008_recurring_linkage.sql`

## 2. Materialization & Realize Core Logic

- [x] 2.1 Implement bounded materialization helper (walk `nextRunDate` by frequency/interval, cap 100 rows or `endDate`) and wire into `createRecurringTemplate` in `src/services/recurring.ts` with `materializedCount` in return
- [x] 2.2 Implement `realizeRecurringOccurrence` (flip `1→0` by `transactionId`, stamp `realizedAt`, `actualAmount` override with variance record, atomic balance move, `VALIDATION` on double-realize) in `src/services/recurring.ts`
- [x] 2.3 Implement `propagateScope` (`future_only` default / `cancel`) on `updateRecurringTemplate`: delete future unrealized rows + re-materialize; realized/overdue immutable
- [x] 2.4 Implement future-only cleanup on template deactivate/delete (preserve overdue + realized)

## 3. Summary Deduction & Wallet Ledger

- [x] 3.1 Remove `projectRecurringCashflow` from the Safe-to-Spend deduction in `src/services/summary.ts` (stored planned rows become the sole source; decide display-only vs removal of `cashflowProjections`)
- [x] 3.2 Implement ledger-complete `updateWallet(balance)` in `src/services/wallet.ts`: compute delta, print adjustment transaction against reserved system category, move via atomic path, no-op on zero delta
- [x] 3.3 Seed and protect the reserved `Adjustment` system category (non-deletable, matched by slug not name)

## 4. MCP Handlers, REST & OpenAPI

- [x] 4.1 Update `manage_recurring_template` tool in `src/mcp.ts`: materialized count on create, `propagateScope` on update, realize-by-row on apply with `actualAmount`
- [x] 4.2 Update `POST /api/v1/recurring-templates/:templateId/apply` realize contract in `src/routes/recurring-templates.ts`
- [x] 4.3 Update `Transaction` and related schemas in `src/docs/openapi.ts` with `templateId`, `occurrenceDate`, `realizedAt`, planned/actual variance fields

## 5. Tests & Verification

- [x] 5.1 Add test cases in `tests/mcp.test.ts` for materialization: cap behavior (100 rows, endDate truncation, daily horizon), linkage fields, zero balance mutation at create
- [x] 5.2 Add test cases for realize: flip semantics, override variance record, double-realize rejection, fallback print when no planned row matches
- [x] 5.3 Add test cases for propagation: future-only rewrite, cancel scope no-op, overdue/realized immutability, deactivate cleanup scope
- [x] 5.4 Add test cases for ledger-complete adjustment: delta transaction printed, zero-delta no-op, reserved category protection
- [x] 5.5 Add E2E journey steps in `tests/integration.test.ts`: create template → verify N planned rows via `list_transactions(isPlanned)` → realize one row → verify balance move + row flip → update template (`future_only`) → verify future rewrite + overdue intact → balance adjustment → verify adjustment row recorded
- [x] 5.6 Fix `scripts/run-local-integration.sh` to apply all `drizzle/00*.sql` migrations via glob instead of the hardcoded `0002`–`0005` file list (stale-schema class bug: `0006`/`0007`/`0008` never applied locally)
- [x] 5.7 Run static type check via `npm run typecheck` to verify zero type regressions
- [x] 5.8 Run test suite via `npm test` against local mock D1 to ensure all unit and integration tests pass
- [x] 5.9 Run `npm run test:local` (full E2E user journey against local D1) as the pre-archive gate
