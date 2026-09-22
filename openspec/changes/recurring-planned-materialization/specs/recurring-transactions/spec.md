## MODIFIED Requirements

### Requirement: Recurring Transaction Template Management
The system SHALL support creating, listing, updating, and deactivating recurring transaction templates scoped to the authenticated user. Creation SHALL additionally materialize bounded planned transaction rows; update SHALL accept a propagation scope governing unrealized future rows.

#### Scenario: User creates a recurring monthly subscription template
- **GIVEN** an authenticated user and an active bank wallet
- **WHEN** the user creates a recurring template with name "Netflix Subscription", amount 186000, frequency "monthly", interval 1, startDate "2026-09-01", and categoryId
- **THEN** the system SHALL store the template in `recurring_templates` with `next_run_date` set to "2026-09-01", `is_active` set to 1, print bounded `isPlanned=1` rows linked to the template without mutating balances, and return the template record with the materialized row count.

#### Scenario: User deactivates a recurring template
- **GIVEN** an existing active recurring template
- **WHEN** the user sets `is_active` to 0 or calls delete
- **THEN** the system SHALL mark the template inactive or delete it, remove its future unrealized planned rows, and preserve all realized and overdue rows.

### Requirement: Template Execution (One-Click Apply)
The system SHALL realize a planned occurrence by flipping exactly one planned row (`isPlanned 1→0`), stamping `realizedAt`, accepting an optional `actualAmount` override, and mutating balances atomically. Realizing an already-realized row SHALL fail with `VALIDATION`.

#### Scenario: Applying a monthly recurring expense template
- **GIVEN** a planned row for template "Netflix" dated "2026-09-01" with `isPlanned=1`
- **WHEN** the user invokes `apply_recurring_template` (realize) for that planned row
- **THEN** the system SHALL flip the row to `isPlanned=0`, stamp `realizedAt`, deduct the wallet balance atomically, advance the template's `next_run_date`, and return the realized transaction details. No new row SHALL be printed.

### Requirement: Virtual Forward Cashflow Projection
The system SHALL retain the in-memory forward cashflow projection as an informational display only. It SHALL NOT feed the Safe-to-Spend deduction — recurring obligations reach the deduction exclusively as stored planned rows.

#### Scenario: User requests 30-day cashflow projection
- **GIVEN** active recurring templates for salary income (+15000000 on 25th) and rent expense (-4000000 on 1st)
- **WHEN** the user requests a financial summary or projection for the next 30 days
- **THEN** the system SHALL simulate upcoming template occurrences within the window, compute projected total income (+15000000), projected total expenses (-4000000), and projected net balance shift (+11000000) purely in memory, labeled as informational and excluded from the Safe-to-Spend deduction.
