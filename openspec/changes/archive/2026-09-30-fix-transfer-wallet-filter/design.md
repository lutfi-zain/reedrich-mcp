## Context

`listTransactions` in `src/services/transaction.ts` currently translates the incoming `walletId` parameter exclusively into equality predicates on `transaction_wallet_id` (`eq()` for one wallet, `inArray()` for several). Transfers are stored asymmetrically in one row: the debiting wallet occupies `transaction_wallet_id`, while the crediting wallet occupies `transaction_target_wallet_id`. Consequently, wallet-statement requests for a destination wallet omit every incoming transfer.

See `proposal.md` for motivation and background.

## Goals / Non-Goals

**Goals:**
- Give `walletId` wallet-statement semantics: match rows where the wallet is source OR destination.
- Preserve directed-flow narrowing when both `walletId` and `targetWalletId` are provided.
- Keep destination-only filtering when only `targetWalletId` is provided.
- Keep tenant isolation, query performance, pagination semantics, and public transport shapes unchanged.

**Non-Goals:**
- No D1 schema, migration, or index changes.
- No changes to balance mutation, recurrence, debt, goal, or summary behavior.

## Decisions

### 1. Conditional Predicate Composition in `listTransactions`

```
┌─────────────────────────────────────────────────────────────────────────┐
│               WALLET-INCLUSIVE PREDICATE DECISION FLOW                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   walletIds = parseMultiIdFilter(walletId)                              │
│   targetWalletIds = parseMultiIdFilter(targetWalletId)                  │
│                                                                         │
│       both non-empty? ── YES ──> AND(source IN walletIds,               │
│                                      target IN targetWalletIds)          │
│                                                                         │
│       only walletIds? ── YES ──> OR(source IN walletIds,                │
│                                      target IN walletIds)                │
│                                                                         │
│       only targets? ── YES ──> target IN targetWalletIds                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

- **Decision**: Preserve the existing `parseMultiIdFilter` normalizer and branch on nonempty collections:
  - Build reusable source and destination predicates with `eq()` for one identifier and `inArray()` for several.
  - Combine source and destination membership with Drizzle `or()` when only `walletId` is supplied.
  - Combine source membership and destination membership with `and()` when both wallet filters are supplied.
  - Keep the existing destination-only condition when only `targetWalletId` is supplied.
- **Alternatives Considered**:
  - *Always union source and destination regardless of targetWalletId*:
    *Rejected*: makes directed-flow filtering (`BCA ➔ MANDIRI`) impossible.
  - *Duplicate both result sets and merge in application code*:
    *Rejected*: doubles database I/O, complicates pagination, risks duplicate rows for internal transfers, and obscures total counts.
- **Rationale**: Keeps a single declarative query; SQL automatically returns an internal transfer (`BCA ➔ MANDIRI`) once even when both ends are selected.

### 2. Index and RLS Strategy

- **Decision**: Rely on existing RLS (`transaction_user_id`) and existing indexes (`transactions_wallet_id_idx`, `transactions_target_wallet_id_idx`). No additional retrieval, aggregation, count, envelope, pagination, search, or status behavior changes.
- **Rationale**: No schema evolution is required.

### 3. Transport and Tool Contract Stability

- **Decision**: Keep the REST query parameter names (`walletId`, `targetWalletId`) and MCP `list_transactions` argument names unchanged; update their prose in OpenAPI and `/llms.txt` to say `walletId` means statement participation (source or destination) while `targetWalletId` means directed destination.
- **Rationale**: Corrects behavior without forcing agents or clients to migrate to new arguments.

## Risks / Trade-offs

- **[Risk: Existing consumers expected source-only matching]** ➔ **Mitigation**: Existing wallet views were incomplete by construction; return previously missing incoming transfers and document the corrected statement semantics.
- **[Risk: `OR` condition performance on large tables]** ➔ **Mitigation**: Both sides are indexed UUID columns and the tenant predicate remains selective; run typecheck, unit, and local E2E tests to confirm zero regressions.
