## Purpose

Defines the behavior contract for retrieving individual domain entities by their unique identifier (UUID) across REST API endpoints. This capability allows frontend dashboards, mobile clients, and detail modals to inspect single items directly without unbounded full-list fetches.

## ADDED Requirements

### Requirement: Single Wallet Retrieval by Identifier

The system MUST expose `GET /api/v1/wallets/:walletId` that returns the specific wallet belonging to the authenticated user.

If the wallet does not exist or belongs to another user, the system MUST respond with HTTP `404 Not Found` with `{ "error": "NOT_FOUND" }`.

The response SHALL include all wallet properties and its latest non-planned transaction metadata (`lastTransaction`) or `null` if none exist.

#### Scenario: Retrieve existing wallet by ID

- **GIVEN** an authenticated user with a wallet `w1` named "BCA Main"
- **WHEN** the client invokes `GET /api/v1/wallets/w1` with a valid Bearer token
- **THEN** the system MUST respond with HTTP `200 OK` and the wallet JSON object with `walletId: "w1"` and `walletName: "BCA Main"`

#### Scenario: Retrieve non-existent wallet returns 404

- **WHEN** the client invokes `GET /api/v1/wallets/00000000-0000-0000-0000-000000000000`
- **THEN** the system MUST respond with HTTP `404 Not Found` with `{ "error": "NOT_FOUND" }`

---

### Requirement: Single Category Retrieval by Identifier

The system MUST expose `GET /api/v1/categories/:categoryId` that returns the category object for the authenticated user.

#### Scenario: Retrieve existing category by ID

- **GIVEN** an authenticated user with category `cat1` ("Groceries", `icon: "🛒"`)
- **WHEN** the client invokes `GET /api/v1/categories/cat1`
- **THEN** the system MUST respond with HTTP `200 OK` and the category JSON object

#### Scenario: Category not found returns 404

- **WHEN** the client invokes `GET /api/v1/categories/non-existent-uuid`
- **THEN** the system MUST respond with HTTP `404 Not Found`

---

### Requirement: Single Budget Retrieval by Identifier

The system MUST expose `GET /api/v1/budgets/:budgetId` that returns the budget object along with live spending utilization, remaining limit, and percentage used for the active period.

#### Scenario: Retrieve existing budget with utilization

- **GIVEN** an authenticated user with budget `b1` of amount 2,000,000 IDR and 800,000 IDR spent
- **WHEN** the client invokes `GET /api/v1/budgets/b1`
- **THEN** the system MUST respond with HTTP `200 OK` and a budget object including `spent: 800000`, `remaining: 1200000`, and `percentUsed: 40.0`

#### Scenario: Budget not found returns 404

- **WHEN** the client invokes `GET /api/v1/budgets/non-existent-uuid`
- **THEN** the system MUST respond with HTTP `404 Not Found`

---

### Requirement: Single Transaction Retrieval by Identifier

The system MUST expose `GET /api/v1/transactions/:transactionId` that returns the detailed transaction record for the authenticated user.

#### Scenario: Retrieve existing transaction by ID

- **GIVEN** an authenticated user with transaction `tx1` of amount 150,000 IDR
- **WHEN** the client invokes `GET /api/v1/transactions/tx1`
- **THEN** the system MUST respond with HTTP `200 OK` and the transaction JSON object

#### Scenario: Transaction not found returns 404

- **WHEN** the client invokes `GET /api/v1/transactions/non-existent-uuid`
- **THEN** the system MUST respond with HTTP `404 Not Found`

---

### Requirement: Single Debt or Loan Retrieval by Identifier

The system MUST expose `GET /api/v1/debts-loans/:debtLoanId` that returns the liability/receivable record for the authenticated user.

#### Scenario: Retrieve debt by ID

- **GIVEN** an authenticated user with debt `d1` for contact "Budi"
- **WHEN** the client invokes `GET /api/v1/debts-loans/d1`
- **THEN** the system MUST respond with HTTP `200 OK` and the debt/loan JSON object

#### Scenario: Debt not found returns 404

- **WHEN** the client invokes `GET /api/v1/debts-loans/non-existent-uuid`
- **THEN** the system MUST respond with HTTP `404 Not Found`

---

### Requirement: Single Goal Retrieval by Identifier

The system MUST expose `GET /api/v1/goals/:goalId` that returns the goal object with derived linked wallet progress and dynamic timeline pacing metrics.

#### Scenario: Retrieve goal with derived progress

- **GIVEN** an authenticated user with goal `g1` linked to wallet `w1`
- **WHEN** the client invokes `GET /api/v1/goals/g1`
- **THEN** the system MUST respond with HTTP `200 OK` and a goal object containing `isDerived`, `linkedWallets`, and `pacing` metrics

#### Scenario: Goal not found returns 404

- **WHEN** the client invokes `GET /api/v1/goals/non-existent-uuid`
- **THEN** the system MUST respond with HTTP `404 Not Found`

---

### Requirement: Single Recurring Template Retrieval by Identifier

The system MUST expose `GET /api/v1/recurring-templates/:templateId` that returns the recurring template definition for the authenticated user.

#### Scenario: Retrieve recurring template by ID

- **GIVEN** an authenticated user with template `t1` ("Gym Membership")
- **WHEN** the client invokes `GET /api/v1/recurring-templates/t1`
- **THEN** the system MUST respond with HTTP `200 OK` and the template JSON object

#### Scenario: Recurring template not found returns 404

- **WHEN** the client invokes `GET /api/v1/recurring-templates/non-existent-uuid`
- **THEN** the system MUST respond with HTTP `404 Not Found`
