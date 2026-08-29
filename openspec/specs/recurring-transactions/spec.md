## Purpose
Provides recurring transaction templates, one-click template execution with atomic balance adjustment, and in-memory forward cashflow projection.

## Requirements

### Requirement: Recurring Transaction Template Management
The system SHALL support creating, listing, updating, and deactivating recurring transaction templates scoped to the authenticated user.

#### Scenario: User creates a recurring monthly subscription template
- **GIVEN** an authenticated user and an active bank wallet
- **WHEN** the user creates a recurring template with name "Netflix Subscription", amount 186000, frequency "monthly", interval 1, startDate "2026-09-01", and categoryId
- **THEN** the system SHALL store the template in `recurring_templates` with `next_run_date` set to "2026-09-01", `is_active` set to 1, and return the template record.

#### Scenario: User deactivates a recurring template
- **GIVEN** an existing active recurring template
- **WHEN** the user sets `is_active` to 0 or calls delete
- **THEN** the system SHALL mark the template inactive or delete it, preventing it from appearing in forward cashflow projections.

### Requirement: Template Execution (One-Click Apply)
The system SHALL allow users to apply a recurring template to generate an actual transaction and automatically advance the template's `next_run_date`.

#### Scenario: Applying a monthly recurring expense template
- **GIVEN** an active recurring template with `next_run_date` "2026-09-01" and frequency "monthly"
- **WHEN** the user invokes `apply_recurring_template` for this template
- **THEN** the system SHALL create a new record in the `transactions` table with date "2026-09-01", atomically deduct the wallet balance, advance the template's `next_run_date` to "2026-10-01", and return the created transaction details.

### Requirement: Virtual Forward Cashflow Projection
The system SHALL compute in-memory forward cashflow projections over a specified lookahead window (e.g. next 30, 60, or 90 days) without mutating database records.

#### Scenario: User requests 30-day cashflow projection
- **GIVEN** active recurring templates for salary income (+15000000 on 25th) and rent expense (-4000000 on 1st)
- **WHEN** the user requests a financial summary or projection for the next 30 days
- **THEN** the system SHALL simulate upcoming template occurrences within the window, compute projected total income (+15000000), projected total expenses (-4000000), and projected net balance shift (+11000000) purely in memory.
