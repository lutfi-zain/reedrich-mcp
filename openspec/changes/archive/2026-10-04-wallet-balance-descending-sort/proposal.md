## Why

When clients and dashboards consume `GET /api/v1/analytics/horizon` (`POST /api/v1/analytics/horizon`, `/api/v1/horizon`, and MCP tool `get_horizon_projections`), `GET /api/v1/account-detail` (and MCP tool `get_account_detail`), or `GET /api/v1/wallets` (and MCP tool `manage_wallet(action: "list")` / resource `reedrich://wallets/list`), wallet collections are currently returned without a deterministic `ORDER BY` or balance-based sort comparator. In PostgreSQL (MVCC), updating a wallet's balance via transaction mutations writes a new tuple version to the heap and shifts physical scan order, causing wallet cards and horizon board rows (`periods[].walletBalances[]`) to jump unpredictably between requests instead of presenting highest-balance wallets first.

## What Changes

- **Horizon Board Per-Period Wallet Sorting (`GET /api/v1/analytics/horizon`, `POST /api/v1/analytics/horizon`, `GET /api/v1/horizon`, MCP tool `get_horizon_projections`)**:
  - Sort `periods[].walletBalances[]` in each projected period in descending order by converted balance in `baseCurrency`, with raw `balance` descending and `walletId` ascending as deterministic tie-breakers.
  - Because each period simulates roll-forward cashflows independently, wallet ordering dynamically reflects the projected end-of-period ranking for that specific interval.
- **Account Snapshot Wallet Partition Sorting (`GET /api/v1/account-detail`, MCP tool `get_account_detail`)**:
  - Sort `wallets.spendable.items[]` and `wallets.locked.items[]` in descending order by converted balance in `baseCurrency`, with raw `balance` descending and `walletId` ascending as deterministic tie-breakers.
- **Wallet Listing Deterministic Balance Sorting (`GET /api/v1/wallets`, MCP tool `manage_wallet` with `action: "list"`, MCP resource `reedrich://wallets/list`)**:
  - Order database wallet queries by `wallet_balance DESC, wallet_id ASC` so wallet lists are deterministically ranked from largest balance to smallest without incurring external FX network calls.
- **Documentation & OpenAPI Contract Synchronization (`src/docs/openapi.ts`, `src/docs/llms.ts`)**:
  - Update endpoint and schema descriptions to document deterministic descending wallet balance ordering across horizon projections, account snapshots, and wallet listings.
- **Database Schema Changes**:
  - None. No new tables, columns, or migrations are required.
- **Breaking Changes**:
  - None. Response object shapes and field types remain 100% backward-compatible; only array element ordering becomes deterministic.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `multi-period-horizon`: (`openspec/specs/multi-period-horizon/spec.md`) Require `periods[].walletBalances[]` in each period projection to be sorted by converted balance in `baseCurrency` descending (with `balance` descending and `walletId` ascending tie-breakers).
- `account-snapshot`: (`openspec/specs/account-snapshot/spec.md`) Require `wallets.spendable.items[]` and `wallets.locked.items[]` to be sorted by converted balance in `baseCurrency` descending (with `balance` descending and `walletId` ascending tie-breakers).
- `rest-api-read`: (`openspec/specs/rest-api-read/spec.md`) Require `GET /api/v1/wallets` (and shared `listWallets` / `reedrich://wallets/list` consumers) to return wallets ordered by `walletBalance` descending and `walletId` ascending.

## Impact

- **Non-Goals**:
  - Adding custom sort query parameters (such as `?orderBy=` or `?direction=`) to `/api/v1/analytics/horizon`, `/api/v1/account-detail`, or `/api/v1/wallets`.
  - Adding extra fields (such as `convertedBalance`) to the public `walletBalances` item schema in `HorizonBoard` or `WalletSnapshotItem` in `AccountDetail`.
  - Modifying goal or obligation sorting behavior.
- **Security & Multi-Tenancy**:
  - All wallet queries continue to enforce strict multi-tenant Row-Level Security (`eq(schema.wallets.walletUserId, userId)`).
  - Sorting operates strictly on in-memory tenant-scoped records or within the tenant-scoped SQL `ORDER BY` clause; zero cross-tenant exposure.
- **Performance Impact on Cloudflare Workers Edge Environment**:
  - Negligible CPU and memory overhead ($O(W \log W)$ per period where $W$ is a single user's wallet count, typically $< 20$).
  - Reuses the `converted` base-currency valuation already computed during `horizon` and `account-snapshot` net worth aggregation, requiring zero additional database queries or FX network requests.
