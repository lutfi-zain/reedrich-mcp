# Technical Design: Recurring Planned Materialization

## Context

See `proposal.md` for motivation. Current state: `recurring_templates` rows are inert (create/update touch zero transaction rows); `applyRecurringTemplate` prints a detached `isPlanned=0` row with immediate balance mutation even for future dates; `financialSummary` deducts both the virtual `projectRecurringCashflow` projection and stored `isPlanned=1` rows (double-count risk); `manage_wallet update(balance)` overwrites silently with no ledger trace. This design makes `transactions` the single source of truth for past and future money, synchronously, with no schedulers.

## Goals / Non-Goals

**Goals:**
- Materialize templates into ≤100 linked planned rows at create; re-materialize future-only on update; flip (never reprint) on realize.
- Remove the virtual projection from the Safe-to-Spend deduction path.
- Print one adjustment transaction per wallet balance correction against a reserved system category.
- Keep all work synchronous inside the triggering mutation (no cron, no lazy top-up, no background jobs).

**Non-Goals:**
- Overdue auto-void/archival; scheduler-based horizon top-up; historical reconstruction UI; frontend changes.

---

## Decisions

### 1. Bounded Materialization (max 100 rows, endDate-truncated) vs. Lazy Top-Up

* **Context**: Template rules are infinite; rows must be finite. Options were bounded upfront print vs. lazy top-up on read.
* **Decision**: Print at create, capped at 100 rows or `endDate` (whichever first). No lazy top-up, no cron. User decision; horizon exhaustion is acceptable — a later update re-materializes.
* **Rationale**: Deterministic, auditable, zero background surface. 100 monthly rows ≈ 8 years; daily ≈ 3 months — adequate for every realistic template. Follows the user's explicit call.
* **Mechanics** (`src/services/recurring.ts`): reuse `calculateNextRunDate` walk from `cleanNextRunDate`; batch `INSERT` planned rows (`isPlanned=1`, `templateId`, `occurrenceDate=date`, `transactionDate=dateT12:00`); return `{ template, materializedCount }`. D1 batch insert of ≤100 rows is well within edge limits.

### 2. Realize = Flip, Not Print (with `actualAmount` override)

* **Context**: Realization must move money exactly once per occurrence while preserving the plan→actual audit trail.
* **Decision**: `realize` takes a planned-row `transactionId`, asserts `isPlanned=1` + ownership, flips to `0`, stamps `realizedAt=now`, applies `actualAmount ?? plannedAmount` through `applyBalanceDelta`, records `plannedAmount` alongside when overridden.
* **Rationale**: One occurrence = one row forever. Printing a new row (old `apply`) double-counts against the surviving planned row; flipping preserves variance auditability (planned 500k vs actual 523k on the same row).
* **Schema**: `transactions` gains `template_id` (nullable FK `ON DELETE SET NULL`), `occurrence_date` (text date), `realized_at` (nullable text), plus `planned_amount` (nullable real — populated only on override realizes; null otherwise). All additive, Zero-Remote-Deletion compliant.
* **Fallback**: realize-by-template+date when no planned row matches (outside materialized horizon) prints one actual row *with* linkage — permissive, spec'd, no silent rejection.

### 3. Future-Only Propagation (`propagateScope`, default `future_only`)

* **Context**: Template edits must reach plans that haven't happened without rewriting history.
* **Decision**: `future_only` (default): `DELETE FROM transactions WHERE template_id=? AND is_planned=1 AND date>now` then re-materialize from now under the new shape. `cancel`: template record only. No `past_inclusive` scope exists — overdue (`date≤now`) and realized are immutable by design.
* **Rationale**: Matches the user's explicit classification (overdue = obligation, not garbage; past values = historical truth). Default-safe: omitting the param can never destroy history.
* **Deactivate/delete**: same future-only delete, then template flag/row removal.

### 4. Projection Removed from Deduction (display-only or removed)

* **Context**: Two overlapping future-money sources feed one formula.
* **Decision**: `plannedExpensesTotal` (stored rows, window-bounded) becomes the sole recurring/obligation deduction. `cashflowProjections` stays in the payload labeled informational, OR is removed if the apply-time review finds shape-test friction — removal is cleaner; flag it as an apply-time call, not a design fork.
* **Rationale**: Single source of truth per the user's stated principle ("projection substantively IS planned records"). Virtual projection that disagrees with stored rows is worse than no projection.

### 5. Ledger-Complete Balance Adjustment via Reserved Category

* **Context**: `updateWallet(balance)` overwrites silently, breaking reconciliation and historical replay.
* **Decision**: Compute `delta = X − current`; print one adjustment transaction (`income` if positive, `expense` if negative, amount `|delta|`) against reserved category `Adjustment`/`Koreksi Saldo` (seeded per user on first use, flagged non-deletable); move balance via `applyBalanceDelta`. Zero-delta = no-op returning existing wallet.
* **Rationale**: Makes replay exact by construction (`now − Σ deltas`), closing feedback point 2 structurally and obsoleting a separate balance-history table. Reserved (not user-chosen) category keeps corrections queryable and prevents accidental deletion breaking the invariant.
* **Edge**: `updateWallet` callers passing `balance` unchanged get no new row — idempotent.

### 6. Multi-Tenancy, RLS & Edge Invariants

- Every propagation/materialization query carries `eq(table.userId, userId)`; cross-tenant template/row access → `NOT_FOUND` (no existence oracle).
- All math via existing pure utils (`calculateNextRunDate`, `applyBalanceDelta`); no new libraries; workerd-compatible.
- Migration `drizzle/0008_recurring_linkage.sql`: `ALTER TABLE transactions ADD COLUMN` ×4 + one composite index — additive-only.

---

## Risks / Trade-offs

- **[Risk] Horizon exhaustion (template outlives its 100 rows)** → *Mitigation*: update re-materializes; document that long-daily templates need periodic touch. No silent failure — rows simply stop existing past horizon.
- **[Risk] Realize-by-date ambiguity (two planned rows same date)** → *Mitigation*: primary realize key is `transactionId`; date-based lookup rejects on ambiguity (`CONFLICT`, list candidates).
- **[Risk] Reserved-category collision (user already has "Adjustment" category)** → *Mitigation*: match by reserved flag/slug, not name; seed with distinct icon + description marking it system-owned; block its deletion with `FORBIDDEN`.
- **[Risk] Materialization insert cost on create (≤100 rows)** → *Mitigation*: single D1 batch; measured well under edge CPU/query limits; no N+1 (one insert-many, not 100 round trips).
- **[Risk] `cashflowProjections` removal breaks shape tests** → *Mitigation*: apply-time call — keep as informational if removal churn exceeds value; spec delta already covers both outcomes.
