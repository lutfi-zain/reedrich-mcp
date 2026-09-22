## Purpose

Defines the behavioral contract for materializing recurring templates into bounded planned transaction rows, realizing planned rows with optional amount override, and propagating template edits to future unrealized rows only.

## ADDED Requirements

### Requirement: Template Creation Materializes Planned Rows

The system MUST print planned transaction rows when a recurring template is created, walking `nextRunDate` forward by (`frequency`, `interval`), capped at 100 rows or `endDate`, whichever comes first. Each printed row SHALL carry `isPlanned=1`, the originating `templateId`, and its `occurrenceDate`. Creation SHALL NOT mutate any wallet balance.

#### Scenario: Create monthly template prints twelve rows for a one-year horizon

- **GIVEN** an authenticated user with an active wallet
- **WHEN** the user creates a template "Gaji" with frequency "monthly", interval 1, startDate "2026-10-05", and no endDate
- **THEN** the system SHALL store the template and print planned rows for the next 100 occurrences starting 2026-10-05, each with `isPlanned=1` and the template's ID, without changing any balance

#### Scenario: EndDate truncates materialization

- **GIVEN** an authenticated user creating a 12-month rent contract template
- **WHEN** the user creates the template with startDate "2026-10-01", frequency "monthly", and endDate "2027-09-01"
- **THEN** the system SHALL print exactly 12 planned rows and stop, even though the 100-row cap is not reached

#### Scenario: Daily template hits the row cap

- **GIVEN** an authenticated user creating a daily template with no endDate
- **WHEN** the template is created
- **THEN** the system SHALL print exactly 100 planned rows (covering ~100 days) and stop

---

### Requirement: Realize Flips Planned Rows with Optional Override

The system MUST realize a planned occurrence by flipping exactly one planned row (`isPlanned 1→0`), stamping `realizedAt`, and mutating balances through the existing atomic path — never by printing a new row. The caller MAY supply `actualAmount`; when supplied and different from the planned amount, the row SHALL record both the planned and actual amounts so the variance stays auditable. Realizing an already-realized row SHALL fail with `VALIDATION`.

#### Scenario: Realize October salary at planned amount

- **GIVEN** a planned row "Gaji 5 Okt, Rp 10.000.000, isPlanned=1" linked to template "Gaji"
- **WHEN** the user realizes that row without an override
- **THEN** the system SHALL flip it to `isPlanned=0`, stamp `realizedAt`, credit the wallet by Rp 10.000.000, and leave exactly one row for that occurrence

#### Scenario: Realize electricity bill with actual override

- **GIVEN** a planned row "PLN Okt, Rp 500.000, isPlanned=1"
- **WHEN** the user realizes it with `actualAmount` Rp 523.000
- **THEN** the system SHALL record the row as realized at Rp 523.000 with the planned Rp 500.000 retained for variance, and deduct Rp 523.000 from the wallet

#### Scenario: Double realization is rejected

- **GIVEN** a row already flipped to `isPlanned=0` with `realizedAt` set
- **WHEN** the user attempts to realize it again
- **THEN** the system SHALL reject with `VALIDATION` and change nothing

---

### Requirement: Future-Only Propagation on Template Update

The system MUST accept `propagateScope` (`"future_only"` default, `"cancel"`) on template update. With `future_only`, the system SHALL delete unrealized planned rows (`isPlanned=1`, `date > now`) belonging to the template and re-materialize from now under the new shape; realized rows (`isPlanned=0`) and overdue planned rows (`date ≤ now`) SHALL remain immutable and untouched. With `cancel`, no rows SHALL change.

#### Scenario: Raise salary template amount, future rows rewritten

- **GIVEN** template "Gaji" Rp 10.000.000/month with planned rows for Sep (overdue), Oct, Nov, and one realized row for Aug
- **WHEN** the user updates amount to Rp 11.000.000 with default scope
- **THEN** the system SHALL rewrite the Oct and Nov rows at Rp 11.000.000, leave the Aug realized row and the Sep overdue row at Rp 10.000.000

#### Scenario: Cancel scope leaves all rows alone

- **GIVEN** the same template state as above
- **WHEN** the user updates the template name with `propagateScope: "cancel"`
- **THEN** the system SHALL change only the template record and touch zero transaction rows

---

### Requirement: Deactivate Deletes Future Unrealized Rows Only

The system MUST, on template deactivate or delete, remove future unrealized planned rows (`isPlanned=1`, `date > now`) belonging to the template while preserving overdue and realized rows.

#### Scenario: Deactivate subscription keeps history

- **GIVEN** template "Netflix" with realized rows Jan–Sep, one overdue planned row, and future planned rows Oct–Dec
- **WHEN** the user deactivates the template
- **THEN** the system SHALL delete the Oct–Dec rows and preserve all realized rows plus the overdue row
