# Proposal: Goal Wallet Links & FX Stablecoin Peg

## Why

Real-world savings goals are routinely funded from multiple wallets at once (e.g. goal "Sewa Rumah 2026" spread across BCA Pocket, Jago, OCBC, and Bitget USDT pockets), but the current goal schema supports only a single `goalWalletId` with a manually maintained `goalCurrentAmount` counter. This forces users into an error-prone manual workaround (update the counter by hand, track per-wallet breakdowns in free-text notes) that silently drifts from actual balances. Making goal progress a derived view over linked wallet balances eliminates the drift by construction. Separately, live FX checks show USDT wallets are converted with a stale hardcoded fallback rate (IDR 16.350 vs live ~17.800, ~9% error) because no keyless provider returns stablecoin rates — pegging USD-pegged stablecoins 1:1 to USD fixes this without adding a new API dependency.

## What Changes

- **Database Schema (Cloudflare D1 & Drizzle)**:
  - Add junction table `goal_wallets` (`goal_id`, `wallet_id`, composite PK, FK cascade on goal delete, set-null-safe on wallet delete) with indexes on both columns.
  - Create additive D1 migration `drizzle/0007_goal_wallet_links.sql` adhering strictly to the Zero-Remote-Deletion Invariant.
  - `goals.goal_current_amount` is retained as a legacy fallback column for unlinked goals; it is ignored whenever a goal has at least one wallet link.

- **Service Layer (`src/services/goal.ts`)**:
  - Add `linkWallet` / `unlinkWallet` / `listLinkedWallets` operations on goals with RLS enforcement on both goal and wallet ownership.
  - Goal read paths (`listGoals`, `getGoal`, goal objects inside `financialSummary`) return derived `currentAmount := Σ converted balances of linked wallets` plus per-wallet contribution breakdown (`walletId`, `walletName`, `balance`, `convertedAmount`, `currency`).
  - Unlinked goals (zero links) keep the legacy behavior: `currentAmount` from stored `goalCurrentAmount`.
  - Locked wallets (`walletIsLocked = 1`) linked to a goal are still counted in full — lock governs spendability, not ownership.

- **Service Layer (`src/services/goal.ts`) — Deprecation**:
  - **BREAKING**: `contribute` action on `manage_goal` is deprecated and removed. Top-ups are recorded via the normal `record_transaction` / `transfer_funds` flow against the linked wallets; progress updates automatically on the next read. Users migrate manually: link wallets to each goal, discard manual counter values.

- **FX Engine (`src/utils/fx.ts`)**:
  - Normalize USD-pegged stablecoins (`USDT`, `USDC`, `DAI`) to `USD` before conversion so they pick up the live USD→target rate from any provider.
  - Keep the existing provider chain and 3-second timeout unchanged; keep `FALLBACK_RATES_USD_BASE` as the offline fallback.
  - Surface a `usedPeg: true`-style marker on converted amounts derived via the peg so summaries can flag them as estimates.

- **MCP Tools, Resources, and Prompts (`src/mcp.ts`)**:
  - `manage_goal`: new `link_wallet` / `unlink_wallet` actions; `create` accepts optional `walletIds: string[]`; `contribute` action removed (**BREAKING**); goal payloads include `linkedWallets[]` contribution breakdown and `isDerived: true/false`.
  - `financial_summary`: goal entries carry the derived progress and per-wallet breakdown.
  - `financial_planning` prompt: instruct the agent to consider linked-wallet derived progress when projecting timelines.

- **REST API Endpoints & OpenAPI Documentation**:
  - `GET /api/v1/goals`: goal objects include `linkedWallets[]`, `isDerived`, derived `goalCurrentAmount`.
  - `POST /api/v1/goals`: accepts optional `walletIds`; `PATCH /api/v1/goals/:goalId/link` and `/unlink` if the write-route pattern is adopted (otherwise MCP-only, consistent with the read-only REST decision).
  - `src/docs/openapi.ts`: update `Goal` schema with link fields and peg marker.

## Capabilities

### New Capabilities
- `goal-wallet-links`: Defines requirements for many-to-many goal↔wallet linking, derived progress (`Σ` linked balances), per-wallet contribution breakdown, locked-wallet inclusion rule, and graceful fallback for unlinked goals.
- `fx-stablecoin-peg`: Defines requirements for 1:1 normalization of USD-pegged stablecoins (USDT, USDC, DAI) to USD before conversion, peg-estimate marking, and unchanged provider/fallback behavior.

### Modified Capabilities
- `financial-goals`: `contribute` action removed (**BREAKING**); `currentAmount` semantics change to derived-when-linked; manual counter retained only as unlinked-goal fallback.
- `service-layer`: Goal service output shape extended with `linkedWallets[]` and `isDerived`.
- `rest-api-read`: `GET /api/v1/goals` contract extended with link/breakdown fields.
- `mcp-prompts`: `financial_planning` workflow updated to reason over derived goal progress.

## Impact

- **Database**: Additive migration (new table + indexes only). Zero data deletion, 100% backward-compatible with existing goals and wallets in Cloudflare D1.
- **Breaking change surface**: `manage_goal(action: "contribute")` removed. Announced via changelog + release notes; users migrate manually by linking wallets.
- **Multi-Tenancy & Security**: RLS enforced on `goal_user_id` and link operations verify both goal and wallet belong to the authenticated user. Cross-tenant link forgery returns `NOT_FOUND`.
- **Edge Performance**: Derived progress adds one indexed join-equivalent query per goal read (`goal_wallets` by `goal_id`, then wallets by id). FX normalization is pure in-memory mapping with zero extra network calls.
- **Backward Compatibility (non-breaking parts)**: Existing goals without links behave exactly as before. FX fallback chain unchanged; peg only affects the three listed stablecoin codes.

## Non-Goals

- Weighted/proportional wallet contributions (rejected: plain summation answers the user's question).
- Category/tag-based goal aggregation (rejected: fragile, depends on user tagging discipline).
- Separate crypto price API (CoinGecko/Binance) — deferred until volatile crypto wallets (BTC/ETH) need first-class support.
- Auto-unlock schedules, time-deposit maturity timers, or any change to the wallet-lock semantics shipped previously.
- Web frontend UI implementation (REST APIs and MCP protocols remain headless).
