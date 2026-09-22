# Proposal: Recurring Planned Materialization

## Why

Recurring templates today are inert rule rows: `create` writes zero transactions, `update` touches no rows, `apply` prints a detached `isPlanned=0` row with immediate balance mutation, and the summary projects a virtual shadow (`projectRecurringCashflow`) that never reconciles with stored `isPlanned=1` rows. The result is double-counting risk (template projection + planned rows for the same bill), phantom balances (applying future dates moves money now), and propagation blindness (template edits never reach unrealized plans). Materializing each template into bounded `isPlanned=1` rows at creation — with `realize` as a status flip and future-only propagation on update — makes `transactions` the single source of truth for both past and future money.

## What Changes

- **Database Schema (Cloudflare D1 & Drizzle)**:
  - Add nullable `template_id` FK (`transactions.template_id` → `recurring_templates.template_id`, `ON DELETE SET NULL`) plus `occurrence_date` (ISO date string) and `realized_at` (nullable ISO timestamp) columns on `transactions`.
  - Create additive D1 migration `drizzle/0008_recurring_linkage.sql` adhering strictly to the Zero-Remote-Deletion Invariant.
  - Add index on `(template_id, transaction_is_planned, transaction_date)` for propagation queries.

- **Service Layer (`src/services/recurring.ts`)**:
  - `createRecurringTemplate`: after inserting the template, materialize planned rows — walk `nextRunDate` forward by `(frequency, interval)`, capped at **max 100 rows** or `endDate`, whichever comes first. Each row: `isPlanned=1`, `templateId` set, `occurrenceDate` set, no balance mutation.
  - `updateRecurringTemplate`: accept `propagateScope` (`"future_only"` default, `"cancel"`). On any field change affecting occurrence shape (amount, fee, wallet, category, frequency, interval, dates): with `future_only`, delete unrealized planned rows (`isPlanned=1`, `date > now`) for the template and re-materialize from now; realized (`isPlanned=0`) and overdue (`date ≤ now`) rows are immutable and untouched.
  - Replace `applyRecurringTemplate` semantics with `realizeRecurringOccurrence`: flip one planned row `1→0`, stamp `realizedAt`, accept optional `actualAmount` override (planned-vs-actual delta recorded transparently on the row), then mutate balances via the existing atomic path. Delete path also deletes only future unrealized rows; overdue + realized survive.

- **Financial Analytics Engine (`src/services/summary.ts`)**:
  - Remove `projectRecurringCashflow` from the Safe-to-Spend deduction entirely — recurring obligations now arrive exclusively as stored planned rows inside the existing `plannedExpensesTotal` query (window-bounded per the horizon contract).
  - Keep `cashflowProjections` in the payload as informational display only, or remove it (decision at apply: display-only flag vs removal — removal is cleaner but touches `FinancialSummary` shape tests).

- **MCP Tools (`src/mcp.ts`)**:
  - `manage_recurring_template`: `create` returns template + count of materialized rows; `update` accepts `propagateScope`; `apply_recurring_template` action redefined as realize-by-row (accepts `transactionId` of the planned row + optional `actualAmount`).
  - `financial_summary`: unchanged shape except recurring deduction now sourced from stored rows; `cashflowProjections` marked informational or removed per above.

- **REST API & OpenAPI (`src/routes/recurring-templates.ts`, `src/docs/openapi.ts`)**:
  - `POST /api/v1/recurring-templates/:templateId/apply` redefined as realize endpoint (planned-row flip); request/response schemas updated; `Transaction` schema gains `templateId`, `occurrenceDate`, `realizedAt`.

- **Wallet Balance Adjustment Ledger-Completeness** (same change, shared principle):
  - `updateWallet(balance: X)` computes `delta = X − current`, prints one adjustment transaction (income if `delta > 0`, expense if `< 0`) against a reserved system category (`Adjustment` / `Koreksi Saldo`, seeded, non-deletable), then moves balance via the atomic path. Direct silent overwrite removed.

## Capabilities

### New Capabilities
- `recurring-materialization`: Defines materialization cap (100 rows), template→planned-row linkage, `realize` flip semantics with `actualAmount` override, future-only propagation scope, immutable realized/overdue rule, and deactivate/delete future-only cleanup.

### Modified Capabilities
- `recurring-transactions`: `create` gains materialization side effect; `update` gains `propagateScope`; `apply` redefined as realize (behavioral change to existing tool contract).
- `rest-api-read`: `POST /:templateId/apply` contract redefined; `Transaction` object extended.
- `service-layer`: `updateWallet(balance)` gains ledger-printing side effect; summary deduction sourcing change.

## Impact

- **Database**: Two additive migrations (new nullable columns + one index). Zero deletions, backward-compatible; existing templates gain linkage lazily (no backfill — old templates without rows behave as before until updated, which triggers re-materialization).
- **Multi-Tenancy & Security**: RLS enforced on template ownership before any row printing/deletion; propagation queries always scoped by `userId`. No new auth surface.
- **Edge Performance**: Materialization is bounded (≤100 inserts, single batch); propagation is two indexed queries (delete-future + insert). No cron, no background jobs — all work happens synchronously inside the triggering mutation.
- **Backward Compatibility**: `apply` with a future `executionDate` no longer moves money silently (behavioral fix, documented as fix not break — old behavior was a bug). `updateWallet(balance)` printing a transaction is additive-observable (new row appears) but changes no existing field shapes.

## Non-Goals

- Overdue auto-void or archival actions (deferred — overdue stays forever, explicit follow-up).
- Workers Cron Triggers or any scheduler-based top-up (rejected — bounded materialization at create + re-materialization on update covers the horizon).
- Historical net-worth reconstruction UI (enabled by ledger-completeness as a side effect, but not built here).
- Web frontend changes for the realize flow (protocol-level only).
