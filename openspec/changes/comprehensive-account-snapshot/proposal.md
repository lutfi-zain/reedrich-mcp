## Why

Current AI agents and client interfaces need 5 to 6 sequential MCP tool calls (`financial_summary`, `manage_wallet(list)`, `list_transactions`, `manage_budget(list)`, `manage_goal(list)`, and `manage_debt_loan(list)`) to construct a comprehensive financial situation model for deterministic planning. This incurs 15 to 20 seconds of latency, burns agent token budgets on repetitive context framing, and forces client-side in-memory joins. 

By introducing a unified, atomic account snapshot tool (`get_account_detail`) and enriching `manage_wallet(action: "list")` with `lastTransaction` out-of-the-box via optimized SQLite window functions, the system enables AI agents to achieve full situational awareness in a single, sub-50ms roundtrip.

## What Changes

- **New MCP Tool `get_account_detail`**: An atomic situational query tool returning a complete financial snapshot payload:
  - **Net Worth**: Consolidated multi-currency net worth with live FX conversion, by-currency totals, and by-institution breakdown.
  - **Wallets**: Grouped into `spendable` vs `locked` cash reserves, each wallet enriched with its latest non-planned `lastTransaction` (date, type, direction, amount, description, category).
  - **Monthly Cashflow**: Current period window (start, end), total income, total expense, net savings, and category expense breakdown with percentage share.
  - **Budgets**: Active category budgets with limit amount, realized spent amount, remaining allowance, percentage used, and pacing status (`on_track` / `exceeded`).
  - **Goals**: Active savings milestones with target amount, current amount (live derived for linked wallets), progress percentage, monthly pacing requirement, days remaining, and per-wallet balance breakdown.
  - **Obligations**: Unpaid/partially-paid debts (what user owes) and loans (receivables owed to user) with counterparty names, remaining amounts, and due dates.
- **New REST Endpoint `GET /api/v1/account-detail`**: Transport-neutral HTTP route exposing the snapshot service with OpenAPI specification and documentation.
- **Enriched `manage_wallet(action: "list")`**: `listWallets` and the `manage_wallet` MCP tool now return `lastTransaction` out-of-the-box for each wallet, eliminating client-side joins.
- **Single-Roundtrip Transaction Windowing**: Utilizes SQLite D1 Common Table Expressions (CTE) with `ROW_NUMBER() OVER (PARTITION BY ... ORDER BY transaction_date DESC)` to batch-fetch latest non-planned mutations across all wallets in one query.
- **Database Schema**: Zero destructive or additive migrations required; existing schema (`wallets`, `transactions`, `categories`, `budgets`, `goals`, `debts_loans`, `goal_wallets`) is fully reused.

## Capabilities

### New Capabilities
- `account-snapshot`: Comprehensive atomic financial snapshot service and transport adapters (`get_account_detail` MCP tool and `GET /api/v1/account-detail` REST route).

### Modified Capabilities
- `wallet-lock-safe-to-spend`: Enriches wallet listing contracts (`listWallets` and `manage_wallet(action: "list")`) with `lastTransaction` out-of-the-box.

## Non-Goals

- Modifying the core calculation engine of `financial_summary`: `financial_summary` remains intact as the macro-aggregate metric tool.
- Third-party bank scraping, Open Banking API sync, or automated transaction classification.
- Any mutations or write operations in the snapshot endpoint: `get_account_detail` is strictly a read-only deterministic intelligence query.
- Modifying database schemas or creating new D1 tables.

## Security, Multi-Tenancy & Performance

- **Multi-Tenant RLS**: Every subquery within the snapshot service strictly enforces user ownership via `eq(schema.<table>.<table>UserId, userId)`. Window functions and CTEs partition and filter exclusively by the authenticated principal's data.
- **Edge Performance**: Data aggregation runs within Cloudflare Workers edge runtime. Parallelizing independent domain reads (`Promise.all` across wallets, budgets, goals, debts/loans, and monthly transactions) combined with a CTE window function for recent transactions ensures server execution latency remains under 50ms.
