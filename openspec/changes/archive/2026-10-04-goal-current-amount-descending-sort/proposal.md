## Why

Across Reedrich's financial planning and reporting surfaces—including `GET /api/v1/analytics/horizon` (and MCP tool `get_horizon_projections`), `GET /api/v1/account-detail` (and MCP tool `get_account_detail`), `GET /api/v1/summary` (and MCP tool `financial_summary`), and `GET /api/v1/goals` (and MCP tool `manage_goal(action: "list")`)—financial goals are currently returned either in raw PostgreSQL heap scan order or creation timestamp order rather than by accumulated capital (`currentAmount`). Furthermore, because derived goals compute their `currentAmount` dynamically from linked wallet balances (and roll-forward projections in Horizon), sorting cannot rely on a static SQL column and must be evaluated deterministically after derived progress and period projections are calculated.

## What Changes

- **Horizon Board Per-Period Goal Sorting (`GET /api/v1/analytics/horizon`, `POST /api/v1/analytics/horizon`, `GET /api/v1/horizon`, MCP tool `get_horizon_projections`)**:
  - Sort `periods[].goals[]` in each projected period in descending order by each goal's projected `currentAmount` converted to `baseCurrency`, with raw `currentAmount` descending and `goalId` ascending as deterministic tie-breakers.
  - Because each period simulates roll-forward cashflows into linked wallets independently, goal ordering dynamically reflects the projected end-of-period accumulated capital ranking for that specific interval.
- **Account Snapshot Goal Sorting (`GET /api/v1/account-detail`, MCP tool `get_account_detail`)**:
  - Sort `goals[]` in descending order by `currentAmount` converted to `baseCurrency`, with raw `currentAmount` descending and `goalId` ascending as deterministic tie-breakers, and sort each goal's `linkedWalletsBreakdown[]` by `convertedAmount` descending.
- **Financial Summary Active Goal Sorting (`GET /api/v1/summary`, MCP tool `financial_summary`)**:
  - Sort `activeGoals[]` in descending order by `currentAmount` converted to `baseCurrency`, with raw `currentAmount` descending and `goalId` ascending as deterministic tie-breakers, and sort each goal's `linkedWallets[]` by `convertedAmount` descending.
- **Goals Listing Derived Current Amount Sorting (`GET /api/v1/goals`, MCP tool `manage_goal` with `action: "list"`)**:
  - Sort returned goals in `listGoals` after `attachDerivedProgress` in descending order by evaluated `goalCurrentAmount` (with `goalId` ascending as deterministic tie-breaker) and sort `linkedWallets[]` by `convertedAmount` descending.
- **Documentation & OpenAPI Contract Synchronization (`src/docs/openapi.ts`, `src/docs/llms.ts`)**:
  - Update endpoint and schema descriptions to document deterministic descending goal `currentAmount` ordering across horizon projections, account snapshots, financial summaries, and goal listings.
- **Database Schema Changes**:
  - None. No new tables, columns, or migrations are required.
- **Breaking Changes**:
  - None. Response object shapes and field types remain 100% backward-compatible; only array element ordering becomes deterministic.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `multi-period-horizon`: (`openspec/specs/multi-period-horizon/spec.md`) Require `periods[].goals[]` in each period projection to be sorted in descending order by projected `currentAmount` converted to `baseCurrency` (with raw `currentAmount` descending and `goalId` ascending tie-breakers).
- `account-snapshot`: (`openspec/specs/account-snapshot/spec.md`) Require `goals[]` in the account snapshot to be sorted in descending order by `currentAmount` converted to `baseCurrency` (with raw `currentAmount` descending and `goalId` ascending tie-breakers).
- `financial-goals`: (`openspec/specs/financial-goals/spec.md`) Require goal listings and summary active goal collections to be ordered in descending order by evaluated `currentAmount` / `goalCurrentAmount` (including derived linked-wallet totals).
- `rest-api-read`: (`openspec/specs/rest-api-read/spec.md`) Require `GET /api/v1/goals` to return goals ordered by evaluated `goalCurrentAmount` descending, then `goalId` ascending.

## Impact

- **Non-Goals**:
  - Adding custom sort query parameters (`?orderBy=` or `?direction=`) to `/api/v1/goals` or analytics endpoints.
  - Modifying goal pacing math (`calculateGoalPacing`) or database schema.
- **Security & Multi-Tenancy**:
  - All goal and linked-wallet queries continue to enforce strict multi-tenant Row-Level Security (`eq(schema.goals.goalUserId, userId)` and `eq(schema.wallets.walletUserId, userId)`).
- **Performance Impact on Cloudflare Workers Edge Environment**:
  - Negligible CPU and memory overhead ($O(G \log G)$ where $G$ is a single user's active goal count).
  - Reuses the in-memory `fxRates` already fetched during `horizon`, `account-snapshot`, and `summary` execution, requiring zero additional database queries or FX network calls.
