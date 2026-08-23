# onboarding Specification

## Purpose

Provides dynamic onboarding state evaluation for new users, enriching authentication responses with setup completeness indicators and enabling bulk seeding of standard categories to streamline first-time account setup.

## ADDED Requirements

### Requirement: Onboarding Status in Authentication Responses
The system SHALL include an `onboarding` object in the JSON response of both `register_user` and `login_user` tools, dynamically computed from the user's current wallet and category counts.

The `onboarding` object MUST contain:
- `isComplete` (boolean): `true` when the user has at least 1 wallet AND at least 1 category.
- `needs` (string array): lists required items that are missing (values: `"wallet"`, `"categories"`). Empty when `isComplete` is `true`.
- `suggestions` (string array): lists optional setup items the user may benefit from (e.g., `"budget"`). Present regardless of `isComplete`.
- `message` (string): human-readable summary for the AI agent to convey to the user.

#### Scenario: New user registers with no wallets or categories
- **WHEN** a user calls `register_user` with valid credentials
- **THEN** the response MUST include `onboarding.isComplete: false`, `onboarding.needs: ["wallet", "categories"]`, and a `message` suggesting the user set up a wallet and categories first

#### Scenario: User logs in with wallet but no categories
- **WHEN** a user with 1 wallet and 0 categories calls `login_user`
- **THEN** the response MUST include `onboarding.isComplete: false`, `onboarding.needs: ["categories"]`, and `suggestions: ["budget"]`

#### Scenario: User logs in with both wallet and categories set up
- **WHEN** a user with ≥1 wallet and ≥1 category calls `login_user`
- **THEN** the response MUST include `onboarding.isComplete: true`, `onboarding.needs: []`

#### Scenario: Budget is never a blocking requirement
- **WHEN** evaluating onboarding completeness
- **THEN** the system MUST NOT include `"budget"` in the `needs` array; budget setup SHALL only appear in `suggestions`

---

### Requirement: Seed Default Categories
The `manage_category` tool SHALL support a `seed_defaults` action that bulk-creates a predefined set of standard expense and income categories for the authenticated user in a single invocation.

The default categories MUST include at minimum:
- **Expense categories**: Makanan & Minuman, Transportasi, Belanja, Tagihan & Utilitas, Hiburan, Kesehatan
- **Income categories**: Gaji, Investasi & Bunga, Usaha / Freelance, Pemasukan Lainnya

Each seeded category SHALL have a descriptive emoji `icon`.

#### Scenario: Successfully seed default categories for a new user
- **WHEN** an authenticated user with 0 existing categories calls `manage_category` with `action: "seed_defaults"`
- **THEN** the system MUST create all predefined default categories for that user and return the complete list of created categories

#### Scenario: Seed defaults when user already has categories
- **WHEN** an authenticated user who already has ≥1 existing category calls `manage_category` with `action: "seed_defaults"`
- **THEN** the system MUST skip categories whose names conflict with existing category names (case-insensitive) and only create the missing defaults, returning both skipped and created counts

#### Scenario: Multi-tenant isolation of seeded categories
- **WHEN** default categories are seeded for user A
- **THEN** the seeded categories MUST be associated solely with user A's `userId` and MUST NOT appear in any other user's category list

---

### Requirement: Precondition Guardrails on Transaction Tools
The `record_transaction` tool SHALL validate that the authenticated user has at least 1 wallet before proceeding. If the user has 0 wallets, the tool MUST reject the request with a descriptive error message guiding the agent toward onboarding setup.

The `transfer_funds` tool SHALL apply the same precondition check.

#### Scenario: Record transaction rejected when user has no wallets
- **WHEN** an authenticated user with 0 wallets calls `record_transaction`
- **THEN** the system MUST return an error with `isError: true` and a message indicating that the user needs to create a wallet first, suggesting the `manage_wallet` tool or the `onboarding_assistant` prompt

#### Scenario: Transfer funds rejected when user has no wallets
- **WHEN** an authenticated user with 0 wallets calls `transfer_funds`
- **THEN** the system MUST return an error with `isError: true` and a message indicating that at least 2 wallets are required for transfers, suggesting wallet creation first

#### Scenario: Transaction proceeds normally when user has wallets
- **WHEN** an authenticated user with ≥1 wallet calls `record_transaction` with valid parameters
- **THEN** the system MUST process the transaction normally without any onboarding-related blocking
