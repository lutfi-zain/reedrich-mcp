## Context

`src/services/recurring.ts` writes `transactionDescription` as `` `[Recurring] ${templateName}` `` at three insert sites: create-time materialization, update-propagation rewrite, and apply fallback insert. Linkage columns (`transactionTemplateId`, `transactionOccurrenceDate`) already identify template origin. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- Store plain `templateName` (or the renamed template name on propagation) at all three insert sites.

**Non-Goals:**
- Historical backfill of existing `[Recurring]`-prefixed rows; new flag columns; behavior changes to caps, propagation, apply, or balances.

## Decisions

### 1. Plain-name assignment at insert sites

- **Decision**: Replace `` `[Recurring] ${created.templateName}` ``, `` `[Recurring] ${fresh.templateName}` ``, and `` `[Recurring] ${template.templateName}` `` with the corresponding bare template-name value.
- **Alternatives Considered**:
  - *Configurable prefix/flag*: Rejected — feedback explicitly asks for plain names; no consumer needs the badge server-side.
- **Rationale**: Minimal diff (3 lines), preserves every other column and flow exactly.

## Risks / Trade-offs

- **[Risk: Clients matching exact `"[Recurring] ..."` strings]** ➔ **Mitigation**: Document as display-text normalization; linkage columns remain the stable machine-readable identifier.
- **[Risk: Mixed old/new descriptions during transition]** ➔ **Mitigation**: Accepted and out of scope; historical rows untouched per Non-Goals.
