## Purpose

Defines the externally observable contract for recurring materialization descriptions: planned rows and fallback-inserted realized rows carry the plain template name, with template linkage expressed structurally rather than through a display prefix.

## ADDED Requirements

### Requirement: Plain Template Name in Materialized Descriptions

The system MUST store the plain template name as `transactionDescription` on every transaction row produced from a recurring template, across:

1. Template-create materialization (planned rows).
2. Update-propagation rewrite of future unrealized rows (planned rows).
3. Apply fallback insert when no matching planned row exists (realized row).

The stored description MUST NOT include a `[Recurring]` prefix or any other hardcoded display badge. Template linkage MUST remain expressed through `transactionTemplateId` and `transactionOccurrenceDate`.

#### Scenario: Created template materializes plain descriptions

- **GIVEN** an authenticated user creating a recurring template named "Netflix Subscription"
- **WHEN** the template is created and planned rows are materialized
- **THEN** every materialized row MUST have `transactionDescription` exactly equal to "Netflix Subscription"
- **THEN** no materialized row description SHALL start with "[Recurring]"

#### Scenario: Propagated future rows carry plain descriptions

- **GIVEN** an authenticated user updating a template name to "Internet 100 Mbps"
- **WHEN** future unrealized planned rows are rewritten
- **THEN** each rewritten row MUST have `transactionDescription` exactly equal to "Internet 100 Mbps"

#### Scenario: Apply fallback insert carries plain description

- **GIVEN** an authenticated user applying a template named "Monthly Salary" with no matching planned row
- **WHEN** the fallback realized row is inserted
- **THEN** the inserted row MUST have `transactionDescription` exactly equal to "Monthly Salary"
