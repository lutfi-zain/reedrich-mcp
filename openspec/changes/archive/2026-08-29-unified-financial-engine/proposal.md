## Why

Users manage personal finances across diverse accounts, varying currencies, and recurring commitments. However, the current Reedrich MCP suite lacks three critical capabilities requested by users in production:
1. **Financial Goals & Pacing Engine**: Users cannot set targeted financial goals (e.g. Emergency Fund, Investment Target, Down Payment) or evaluate if their current savings velocity is sufficient to hit deadlines.
2. **Consolidated Multi-Currency Net Worth**: Users holding multi-currency assets (e.g. IDR, USD, SGD, EUR, JPY, GBP) currently receive fragmented summaries without unified conversion into a dominant base currency.
3. **Recurring Transaction Templates & Cashflow Projections**: Users with fixed regular expenses/incomes (subscriptions, rent, salaries) have to manually enter identical transactions repeatedly and cannot project upcoming monthly liquidity.

This change delivers a cohesive, lightweight, edge-compatible financial intelligence engine providing native goal tracking, resilient multi-currency consolidation with edge-fallback baseline, and recurring transaction templates with one-click execution and cashflow projection.

## What Changes

- **Database Schemas & Migrations**:
  - Add `goals` table in Cloudflare D1 via Drizzle schema (tracking target amounts, current amounts, target dates, linked wallets, and category associations).
  - Add `recurring_templates` table in Cloudflare D1 via Drizzle schema (tracking frequency, interval, next run date, amount, admin fee, type, wallet, target wallet, category, and active status).
  - Generate non-destructive migration script `drizzle/0005_add_goals_and_recurring_templates.sql`.
- **MCP Tools**:
  - Add `manage_goal` tool for creating, listing, updating, contributing to, and deleting personal financial goals.
  - Add `manage_recurring_template` tool for defining, listing, updating, and deactivating recurring transaction templates.
  - Add `apply_recurring_template` tool for one-click manual or automated instantiation of recurring templates into live transactions with balance reconciliation.
  - Enhance `financial_summary` tool to support:
    - Auto-detected or user-specified base currency net worth consolidation using resilient real-time FX rates with hardcoded edge-baseline fallback.
    - Integrated goal progress and pacing velocity calculation (required daily/monthly savings vs actual pace).
    - Virtual in-memory cashflow projection for upcoming recurring obligations.
- **ChatGPT REST API (`/api/v1/*`)**:
  - Expose `GET /api/v1/goals` and `POST /api/v1/goals`.
  - Expose `GET /api/v1/recurring-templates` and `POST /api/v1/recurring-templates`.
  - Expose `POST /api/v1/recurring-templates/{templateId}/apply`.
  - Update `GET /api/v1/summary` and `/openapi.json` to reflect consolidated multi-currency values, goal metrics, and cashflow projections.

## Capabilities

### New Capabilities
- `financial-goals`: Native financial goal tracking with target dates, linked wallets, progress metrics, and pacing calculations.
- `multi-currency-consolidation`: Real-time exchange rate conversion with edge baseline fallback to compute unified net worth across multi-currency wallets.
- `recurring-transactions`: Recurring transaction templates with scheduled execution dates, one-click posting, and forward-looking cashflow projections.

### Modified Capabilities
- None (all new features are purely additive; existing tools remain backward compatible).

## Non-Goals

- Implementing automatic background cron triggers/queues that write to D1 without explicit user/agent invocation (Cloudflare Workers Cron Triggers are out-of-scope for this phase to preserve user control and zero unexpected database mutations).
- Full double-entry general ledger or stock/crypto portfolio tracking with complex tax lots.
- Direct Open Banking / Plaid / Salt Edge third-party bank screen-scraping connections.
- Destructive migration of existing wallet, transaction, or budget data.

## Security & Edge Performance

- **Multi-Tenant Row-Level Security (RLS)**: Strictly enforced on `goals` and `recurring_templates` tables via `goal_user_id` and `template_user_id` mapped to authenticated `userId`.
- **Edge Compatibility**: FX engine uses standard `fetch` with strict 3-second timeout and hardcoded static fallback exchange rates to guarantee zero unhandled workerd runtime exceptions.
- **Zero-Remote-Deletion Invariant**: All D1 migrations and Drizzle queries guarantee existing production data in `wallets`, `transactions`, `budgets`, `debts_loans`, and `feedbacks` remain 100% intact.
