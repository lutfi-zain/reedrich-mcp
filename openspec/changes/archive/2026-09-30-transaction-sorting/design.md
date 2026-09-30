## Context

`listTransactions` in `src/services/transaction.ts` applies a fixed `.orderBy(desc(transactionDate), desc(transactionCreatedAt))`. The task is to expose a whitelisted, injection-safe ordering control surfaced identically on REST and MCP. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- Parse and validate `orderBy` (`date|amount|createdAt|description`) and `direction` (`asc|desc`).
- Map to Drizzle column objects with the requested direction, plus fixed `createdAt DESC` tiebreaker.
- Mirror params on REST query string, MCP tool schema, OpenAPI, and llms.txt.

**Non-Goals:**
- Multi-key sorts, per-field directions, or non-whitelisted columns.

## Decisions

### 1. Whitelist map + fixed tiebreaker

- **Decision**: Normalize inputs (trim + lowercase), then:
  ```typescript
  const sortColumns = {
    date: schema.transactions.transactionDate,
    amount: schema.transactions.transactionAmount,
    createdat: schema.transactions.transactionCreatedAt,
    description: schema.transactions.transactionDescription,
  };
  const primary = direction === "asc" ? asc(sortColumns[key]) : desc(sortColumns[key]);
  query.orderBy(primary, desc(schema.transactions.transactionCreatedAt));
  ```
  Note: when `orderBy=createdAt`, the tiebreaker duplicates the primary column's descending direction — harmless and keeps pagination stable.
- **Alternatives Considered**:
  - *Raw SQL interpolation of client string*: Rejected — SQL injection vector; Drizzle `orderBy` requires column objects.
- **Rationale**: Total order on every page; omitting both params reproduces today's query exactly.

## Risks / Trade-offs

- **[Risk: `description` text sort is locale/case sensitive in SQLite]** ➔ **Mitigation**: Accept binary collation as deterministic; document as byte-order sort.
- **[Risk: Clients depending on implicit order]** ➔ **Mitigation**: Defaults unchanged, so existing calls are byte-identical.
