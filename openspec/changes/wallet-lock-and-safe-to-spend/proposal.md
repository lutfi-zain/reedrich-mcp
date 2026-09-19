# Proposal: Wallet Lock & Safe-to-Spend Runway Engine

## Why

Users tracking personal finances with Reedrich frequently hold both operational liquid funds (e.g., checking accounts, daily cash, digital e-wallets) and protected capital reserves (e.g., time deposits, emergency funds, mutual fund investment pockets). Currently, `financialSummary`, AI prompts (`daily_briefing`, `financial_planning`), and REST APIs aggregate all wallet balances into a single undivided net worth, creating an illusion of abundant liquidity and leading to severe operational overspending risks.

Introducing a soft "Lock Wallet" mechanism (`isLocked: boolean`) and a deterministic "Safe-to-Spend Runway Engine" allows users and AI agents to segregate protected capital reserves from daily operational liquidity, delivering precise mathematical answers to "How much money can I safely spend today without touching my savings or emergency reserves?".

## What Changes

- **Database Schema (Cloudflare D1 & Drizzle)**:
  - Add column `wallet_is_locked` (INTEGER NOT NULL DEFAULT 0) to `wallets` table in `src/db/schema.ts`.
  - Add index `wallets_user_locked_idx` on `(wallet_user_id, wallet_is_locked)` for performant edge queries.
  - Create additive D1 migration `drizzle/0006_add_wallet_lock.sql` adhering strictly to the Zero-Remote-Deletion Invariant.

- **Service Layer (`src/services/wallet.ts`)**:
  - Extend `CreateWalletParams` and `createWallet` to accept optional `isLocked?: boolean` (defaults to `false`).
  - Extend `UpdateWalletParams` and `updateWallet` to toggle `isLocked?: boolean`.
  - Update `listWallets` to include `walletIsLocked: number` in returned records and support optional `isLocked` filtering.

- **Financial Analytics Engine (`src/services/summary.ts`)**:
  - Partition wallet assets into `spendableCash` (unlocked wallets) and `lockedCash` (locked wallets), aggregated by currency and converted to `baseCurrency`.
  - Introduce deterministic `safeToSpend` calculation:
    $$\text{Safe-to-Spend} = \text{Spendable Cash} - (\text{Planned Expenses Sisa Periode} + \text{Tagihan Rutin 30 Hari} + \text{Hutang Aktif})$$
  - Provide `dailySafeToSpend` (safe-to-spend divided by remaining days in the active month or requested period).
  - Retain total `netWorthByCurrency` and `consolidatedNetWorth` across all wallets to preserve full net worth integrity.

- **MCP Tools, Resources, and Prompts (`src/mcp.ts`)**:
  - `manage_wallet`: Update tool schema to accept optional `isLocked` on `create` and `update` actions.
  - `financial_summary`: Expose `spendableCash`, `lockedCash`, `safeToSpend`, and `dailySafeToSpend` in JSON-RPC output.
  - `reedrich://wallets/list`: Return `walletIsLocked` attribute for each wallet entity.
  - `daily_briefing` prompt: Guide the AI to report Safe-to-Spend and daily allowance rather than unsegregated total net worth.
  - `financial_planning` prompt: Instruct the AI to allocate idle spendable cash for new goals while preserving locked emergency funds.

- **REST API Endpoints & OpenAPI Documentation**:
  - `GET /api/v1/wallets`: Expose `walletIsLocked` field on wallet models.
  - `GET /api/v1/summary`: Include `spendableCash`, `lockedCash`, and `safeToSpend` in summary response.
  - `src/docs/openapi.ts`: Update `Wallet` and `FinancialSummary` OpenAPI schemas and documentation.

- **Soft Lock Architectural Policy**:
  - Transactions (`record_transaction`, `transfer_funds`) against locked wallets are permitted (soft lock) to allow yield recording, interest income, emergency withdrawals, or savings top-ups.
  - When an expense or outward transfer is recorded against a locked wallet, the service layer returns a non-blocking informational notice indicating protected reserve depletion.

## Capabilities

### New Capabilities
- `wallet-lock-safe-to-spend`: Defines requirements for wallet locking flag, liquidity segregation (`spendableCash` vs `lockedCash`), and the Safe-to-Spend runway calculation engine in financial summary and MCP/REST endpoints.

### Modified Capabilities
- `service-layer`: Updates wallet and summary service contracts to include `isLocked` parameters, typed validation, and deterministic Safe-to-Spend metrics.
- `rest-api-read`: Updates `GET /api/v1/wallets` and `GET /api/v1/summary` read-only contracts to include wallet lock status and segregated cash metrics.
- `mcp-prompts`: Updates `daily_briefing` and `financial_planning` workflow templates to instruct AI agents on Safe-to-Spend metrics and capital protection.

## Impact

- **Database**: Additive migration with default value `0`. Zero data deletion, zero table rewrites, 100% backward-compatible with existing production data in Cloudflare D1.
- **Multi-Tenancy & Security**: Row-Level Security (RLS) remains strictly enforced on `wallet_user_id` and `wallet_is_locked`. Cross-tenant data leakage is prevented.
- **Edge Performance**: D1 query overhead is negligible; index on `(wallet_user_id, wallet_is_locked)` enables sub-millisecond filtering on Cloudflare Workers edge.
- **Backward Compatibility**: All existing API clients and MCP agents continue functioning without errors. `isLocked` defaults to `false`, treating legacy un-flagged wallets as spendable.

## Non-Goals

- Hard blocking of expense transactions or transfers on locked wallets (rejected in favor of flexible soft lock with informational notices).
- Automated banking sync or third-party bank open-banking integration.
- Automated time-deposit maturity timers or auto-unlock schedules (can be addressed in future phases).
- Web frontend UI component implementation (REST APIs and MCP protocols remain headless).
