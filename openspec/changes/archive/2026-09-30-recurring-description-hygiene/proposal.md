## Why

Materialized recurring rows currently hardcode the transaction description as `` `[Recurring] <templateName>` `` at three insert sites in `src/services/recurring.ts`. Template linkage is already stored structurally (`transactionTemplateId` + `transactionOccurrenceDate`) and no backend query filters on the prefix text, so the prefix forces clients to strip it manually. A production feedback entry (2026-09-30) reports ~1947 rows cleaned by hand and requests plain `templateName` descriptions going forward.

## What Changes

- **Service Layer (`src/services/recurring.ts`)**:
  - Store plain `templateName` as `transactionDescription` at all three insert sites (template-create materialization, update-propagation rewrite, apply fallback insert).
  - No change to balance logic, linkage columns, occurrence dates, or materialization caps.
- **Tests (`tests/mcp.test.ts`)**:
  - Assert materialized planned rows carry the plain template name with no `[Recurring]` prefix.
  - Assert the apply fallback insert carries the plain template name.
- **OpenAPI / Docs**: No contract shape changes; description text semantics clarified only if a doc references the prefix (none currently do).

## Capabilities

### New Capabilities
- `recurring-description-plainness`: Materialized and fallback-inserted recurring transaction rows store the plain template name as description, identifiable via `transactionTemplateId` linkage rather than text prefix.

### Modified Capabilities
None. Existing recurring-transactions and recurring-materialization requirement semantics (materialization, realization, propagation) remain unchanged.

## Non-Goals

- Backfilling or rewriting historical `[Recurring]`-prefixed rows already stored in production D1 (client already cleaned ~1947 manually; a bulk rewrite would be a separate data-migration decision with remote-data risk).
- Adding a display-badge boolean/flag column (feedback lists it as optional; not required for the core ask).
- Changing materialization caps, propagation scope, or apply/realize balance behavior.

## Impact & Constraints

- **Multi-Tenant RLS**: Unchanged; inserts remain scoped to the authenticated `userId`.
- **Zero Remote Deletions**: Code-only change; no DDL, no bulk UPDATE/DELETE against remote D1.
- **Zero Breaking Changes for Valid Calls**: No tool input schema, resource URI, or auth change. Clients matching on exact `"[Recurring] ..."` description strings would need to drop the prefix expectation — documented as a display-text normalization.
- **Edge Runtime**: No new dependencies; pure string change in existing inserts.
