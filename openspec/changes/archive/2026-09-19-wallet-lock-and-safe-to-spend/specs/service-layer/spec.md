## MODIFIED Requirements

### Requirement: Service-MCP Output Equivalence

For every MCP tool that delegates to a service function, the MCP transport adapter MUST produce output compatible with downstream consumers while incorporating new liquidity segregation fields. The JSON structure, field names, field order, and error messages MUST NOT change, except for backward-compatible additive properties for wallet locking and liquidity analytics.

#### Scenario: financial_summary produces identical output after refactor

- **GIVEN** a user with wallets, transactions, budgets, goals, debts, and recurring templates
- **WHEN** the `financial_summary` MCP tool is called with `startDate` and `endDate` parameters
- **THEN** the response JSON SHALL contain the same fields in the same structure as the current implementation: `netWorthByCurrency`, `netWorthByInstitution`, `consolidatedNetWorth`, `totalIncome`, `totalExpense`, `totalAdminFees`, `netSavings`, `totalDebt`, `totalReceivable`, `activeGoals`, `cashflowProjections`, `walletsCount`, `transactionsCount`, `transfersCount`, `categoryBreakdown`
- **THEN** the response JSON SHALL additively include `spendableCash`, `lockedCash`, `safeToSpend`, and `dailySafeToSpend`

#### Scenario: manage_wallet list produces identical output after refactor

- **WHEN** the `manage_wallet` MCP tool is called with `action: "list"`
- **THEN** the response SHALL be identical in structure and content to the current implementation, with each wallet object additively containing `walletIsLocked` (integer `0` or `1`)
