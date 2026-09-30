## Context

The Reedrich edge platform provides high-speed financial planning and ledger operations. However, the existing `GET /api/v1/transactions` endpoint returns a plain array without total records or pagination indicators, and lacks full-text keyword search and multi-entity filtering. Furthermore, generating forward-looking financial roadmap projections (horizon boards) currently requires clients to repeatedly query the API across multiple months and perform complex balance simulation, FX conversion, and goal tracking on the client.

See `proposal.md` for motivation and background.

## Goals / Non-Goals

**Goals:**
- Provide universal pagination headers (`X-Total-Count`, `X-Limit`, `X-Offset`, `X-Has-Next-Page`) on all `GET /api/v1/transactions` responses.
- Provide opt-in structured envelope (`{ items, pagination }`) via `?envelope=true` while keeping raw array response as default for backward compatibility.
- Enable case-insensitive keyword search (`q` or `search`) on transaction descriptions.
- Support multi-value filtering across `walletId`, `targetWalletId`, `categoryId`, and `budgetId` (comma-separated or arrays).
- Support client-friendly `status` query aliases (`realized`, `planned`, `all`).
- Implement an atomic, single-pass Multi-Period Horizon Board engine (`GET /api/v1/analytics/horizon` and tool `get_horizon_projections`) simulating 1 to 24 future calendar months.

**Non-Goals:**
- Storing projected horizon snapshots in persistent database tables.
- Building frontend visualization components.
- Modifying underlying transaction storage tables.

## Decisions

### 1. Dual Pagination Strategy (Headers + Opt-in Envelope)

- **Decision**: Always return pagination metadata in response headers (`X-Total-Count`, `X-Limit`, `X-Offset`, `X-Has-Next-Page`). Return the response body as a JSON array by default, but wrap in an envelope `{ items, pagination }` if `?envelope=true` or `?envelope=1` is passed.
- **Alternatives Considered**:
  - *Hard cutover to envelope response*:
    *Rejected*: Breaks existing API consumers, integrations, and test suites that assert `Array.isArray(response)`.
  - *Headers only*:
    *Rejected*: Some browser environments or AI client adapters strip or hide custom response headers.
- **Rationale**: Completely preserves backward compatibility while giving modern clients full pagination metadata in either format.

### 2. Concurrent Data and Count Query Execution in D1

```
┌─────────────────────────────────────────────────────────────────────────┐
│               CONCURRENT D1 TRANSACTION RETRIEVAL                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   conditions = [ RLS(userId), search(q), multiIn(wallets), ... ]       │
│                                                                         │
│                    ┌──────────────────────┐                             │
│                    │     Promise.all      │                             │
│                    └──────────┬───────────┘                             │
│                               │                                         │
│                ┌──────────────┴──────────────┐                          │
│                ▼                             ▼                          │
│     SELECT * FROM transactions     SELECT COUNT(*) FROM transactions    │
│     WHERE ...                      WHERE ...                            │
│     LIMIT safeLimit OFFSET safeOffset                                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

- **Decision**: Run data selection and total count calculation concurrently using `Promise.all`:
  ```typescript
  const [items, countResult] = await Promise.all([
    db.select().from(schema.transactions).where(and(...conditions)).limit(safeLimit).offset(safeOffset),
    db.select({ count: sql<number>`count(*)` }).from(schema.transactions).where(and(...conditions))
  ]);
  const total = Number(countResult[0]?.count || 0);
  ```
- **Rationale**: D1 optimizes SQLite statements efficiently, minimizing total request latency.

### 3. Multi-Value Filtering and Search Parsing

- **Decision**:
  - Multi-value: Parse query values splitting by comma `,`. If count is 1, use `eq()`; if count > 1, use `inArray()`.
  - Keyword search: Match substrings case-insensitively using `sql\`LOWER(${schema.transactions.transactionDescription}) LIKE ${'%' + cleanQ.toLowerCase() + '%'}\``.
  - Status mapping:
    - `status=realized` ➔ `transactionIsPlanned = 0`
    - `status=planned` ➔ `transactionIsPlanned = 1`
    - `status=all` ➔ omit `transactionIsPlanned` filter

### 4. Multi-Period Horizon Board Simulation Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                     MULTI-PERIOD HORIZON SIMULATION ENGINE                              │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│   1. Single-Pass D1 Query (Parallel Fetch):                                             │
│      • Wallets (current balances, currencies, isLocked)                                 │
│      • Active Goals & Goal-Wallet links                                                 │
│      • Planned Transactions covering simulation period window [Start, End]              │
│      • Active Recurring Templates & Live FX Rates                                       │
│                                                                                         │
│   2. Generate Month Timeline Windows:                                                   │
│      Periods = [ M1 (YYYY-MM), M2 (YYYY-MM), ... , Mk (YYYY-MM) ]                       │
│                                                                                         │
│   3. State Accumulation Loop:                                                           │
│      simulatedBalances = clone(currentWalletBalances)                                   │
│                                                                                         │
│      FOR EACH month IN Periods:                                                         │
│        a. Filter planned movements scheduled in month                                   │
│        b. Cashflow = sum(income) - sum(expense + fees)                                  │
│        c. Update simulatedBalances for affected source & target wallets                 │
│        d. Net Worth = sum(simulatedBalances in baseCurrency)                            │
│           - spendable = sum(unlocked wallets)                                           │
│           - locked = sum(locked wallets)                                                │
│        e. Evaluate Goals:                                                               │
│           - currentAmount = sum(linked wallet simulatedBalances in goalCurrency)       │
│           - isReached = currentAmount >= targetAmount                                   │
│                                                                                         │
│   4. Return Structured Horizon Board JSON Payload                                       │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Decision**: Centralize horizon logic into a dedicated pure service `src/services/horizon.ts` and thin router `src/routes/horizon.ts`.
- **Performance**: Fetches all required data upfront in a single round-trip, executing the monthly roll-forward simulation in memory in < 15ms.

## Risks / Trade-offs

- **[Risk: Additional count query on large tables]** ➔ **Mitigation**: Filter conditions leverage indexed columns (`transaction_user_id`, `transaction_date`, `transaction_wallet_id`). The count query uses the same indexed `WHERE` clause.
- **[Risk: Simulation variance on foreign currency exchange rates]** ➔ **Mitigation**: Horizon simulation uses the current snapshot exchange rates consistently across all periods with graceful fallback to static USD parity.
- **[Risk: Simulation memory footprint for 24-month horizon]** ➔ **Mitigation**: Max limit enforced at 24 months. Each period computes summary aggregates without copying raw transaction objects into the response.
