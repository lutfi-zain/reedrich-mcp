# wallet-inclusive-filtering Specification

## Purpose

Defines the behavioral specification and query-matching contract for wallet-inclusive transaction statement filtering, ensuring destination wallets expose incoming transfers while preserving directed-flow filtering and full tenant isolation.

## Requirements

### Requirement: Wallet-Inclusive Statement Filtering

The system MUST interpret the `walletId` filter on `GET /api/v1/transactions` and MCP tool `list_transactions` as a wallet-statement filter matching transactions where the wallet participates either as source or destination:

1. **Source-or-Destination Matching**:
   - If `walletId` is supplied without `targetWalletId`, the system MUST return transactions where the wallet appears in `transactionWalletId` (outgoing presence) OR `transactionTargetWalletId` (incoming presence).
   - Both single identifiers and multi-value collections (comma-separated strings, repeated query parameters, or JSON arrays) MUST follow this inclusive semantic.

2. **Directed-Flow Narrowing**:
   - If both `walletId` AND `targetWalletId` are supplied, the system MUST return only transactions where the source belongs to `walletId` AND the destination belongs to `targetWalletId`.
   - This directed interpretation preserves use cases such as isolating transfers from BCA specifically into MANDIRI.

3. **Destination-Only Matching**:
   - If only `targetWalletId` is supplied, the system MUST return only transactions directed into the supplied destination wallet(s).

#### Scenario: Incoming transfer appears in destination wallet history

- **GIVEN** an authenticated user with a transfer transaction from wallet `BCA` (`transactionWalletId`) to wallet `MANDIRI` (`transactionTargetWalletId`)
- **WHEN** the client invokes `GET /api/v1/transactions?walletId=MANDIRI`
- **THEN** the system MUST respond with HTTP `200 OK`
- **THEN** the response MUST include the transfer transaction

#### Scenario: Outgoing transfer appears in source wallet history

- **GIVEN** an authenticated user with a transfer transaction from wallet `BCA` to wallet `MANDIRI`
- **WHEN** the client invokes `GET /api/v1/transactions?walletId=BCA`
- **THEN** the system MUST respond with HTTP `200 OK`
- **THEN** the response MUST include the transfer transaction

#### Scenario: Directed flow narrows to specified source and destination

- **GIVEN** an authenticated user with transfers `BCA` to `MANDIRI` and `OVO` to `MANDIRI`
- **WHEN** the client invokes `GET /api/v1/transactions?walletId=BCA&targetWalletId=MANDIRI`
- **THEN** the system MUST return only the `BCA` to `MANDIRI` transfer
- **THEN** the system MUST NOT return the `OVO` to `MANDIRI` transfer

#### Scenario: Multi-wallet query lists internal transfer once

- **GIVEN** an authenticated user with a transfer from wallet `BCA` to wallet `MANDIRI`
- **WHEN** the client invokes `GET /api/v1/transactions?walletId=BCA,MANDIRI`
- **THEN** the transfer transaction MUST appear exactly once in the response
- **THEN** pagination totals MUST count the transfer only once
