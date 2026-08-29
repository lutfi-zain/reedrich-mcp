## Context

Reedrich MCP provides personal finance management over MCP and ChatGPT Custom Actions. To support user feature requests for long-term goal pacing, multi-currency net worth, and recurring transaction templates, this design defines database schemas, edge-safe conversion algorithms, and atomic transaction application workflows.

## Schema & Data Modeling

### 1. Drizzle Schema Additions (`src/db/schema.ts`)

```typescript
export const goals = sqliteTable("goals", {
  goalId: text("goal_id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  goalUserId: text("goal_user_id")
    .notNull()
    .references(() => users.userId, { onDelete: "cascade" }),
  goalName: text("goal_name").notNull(),
  goalTargetAmount: real("goal_target_amount").notNull(),
  goalCurrentAmount: real("goal_current_amount").notNull().default(0.0),
  goalCurrency: text("goal_currency").notNull().default("IDR"),
  goalTargetDate: text("goal_target_date"), // YYYY-MM-DD
  goalWalletId: text("goal_wallet_id").references(() => wallets.walletId, { onDelete: "set null" }),
  goalCategoryId: text("goal_category_id").references(() => categories.categoryId, { onDelete: "set null" }),
  goalStatus: text("goal_status").notNull().default("in_progress"), // "in_progress" | "completed" | "cancelled"
  goalNotes: text("goal_notes"),
  goalCreatedAt: text("goal_created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("goals_user_status_idx").on(table.goalUserId, table.goalStatus),
  index("goals_user_target_date_idx").on(table.goalUserId, table.goalTargetDate),
  index("goals_wallet_id_idx").on(table.goalWalletId),
]);

export const recurringTemplates = sqliteTable("recurring_templates", {
  templateId: text("template_id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  templateUserId: text("template_user_id")
    .notNull()
    .references(() => users.userId, { onDelete: "cascade" }),
  templateName: text("template_name").notNull(),
  templateWalletId: text("template_wallet_id")
    .notNull()
    .references(() => wallets.walletId, { onDelete: "cascade" }),
  templateTargetWalletId: text("template_target_wallet_id")
    .references(() => wallets.walletId, { onDelete: "set null" }),
  templateCategoryId: text("template_category_id")
    .references(() => categories.categoryId, { onDelete: "set null" }),
  templateAmount: real("template_amount").notNull(),
  templateAdminFee: real("template_admin_fee").notNull().default(0.0),
  templateType: text("template_type").notNull().default("expense"), // "expense" | "income" | "transfer"
  templateFrequency: text("template_frequency").notNull().default("monthly"), // "daily" | "weekly" | "monthly" | "yearly"
  templateInterval: integer("template_interval").notNull().default(1),
  templateStartDate: text("template_start_date").notNull(), // YYYY-MM-DD
  templateNextRunDate: text("template_next_run_date").notNull(), // YYYY-MM-DD
  templateEndDate: text("template_end_date"), // YYYY-MM-DD nullable
  templateIsActive: integer("template_is_active").notNull().default(1), // 1 or 0
  templateNotes: text("template_notes"),
  templateCreatedAt: text("template_created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("recurring_templates_user_active_idx").on(table.templateUserId, table.templateIsActive),
  index("recurring_templates_next_run_idx").on(table.templateUserId, table.templateNextRunDate),
  index("recurring_templates_wallet_id_idx").on(table.templateWalletId),
]);
```

### 2. Migration Script (`drizzle/0005_add_goals_and_recurring_templates.sql`)
- Purely additive `CREATE TABLE IF NOT EXISTS goals (...)` and `CREATE TABLE IF NOT EXISTS recurring_templates (...)` statements with indices.
- Adheres to the **Zero-Remote-Deletion Invariant**: no existing tables or columns are modified or dropped.

## Mathematical Models & Core Algorithms

### 1. Goal Pacing & Velocity Algorithm
Given:
- Target Amount $T$, Current Amount $C$, Remaining Amount $R = \max(0, T - C)$
- Today Date $D_{\text{today}}$, Target Date $D_{\text{target}}$
- Remaining Days $N_{\text{days}} = \max(1, \lceil(D_{\text{target}} - D_{\text{today}}) / 86400000\rceil)$
- Remaining Months $N_{\text{months}} = \max(0.1, N_{\text{days}} / 30.4375)$

Formulas:
- Progress Percentage: $P = \min(100.0, (C / T) \times 100)$
- Required Daily Savings: $S_{\text{daily}} = R / N_{\text{days}}$
- Required Monthly Savings: $S_{\text{monthly}} = R / N_{\text{months}}$
- Status: If $C \ge T$, status is auto-marked `"completed"`.

### 2. Consolidated FX Engine with Edge Fallback Baseline
To prevent external API failures from crashing Workers:
1. **Live Rate Fetching**: Query lightweight public FX API (e.g. open exchange rates endpoint or Cloudflare KV cache) with a strict 3000ms `AbortController` timeout.
2. **Static Edge Fallback Rates** (Against USD base):
   - USD: 1.0
   - IDR: 16,350.0
   - EUR: 0.92
   - SGD: 1.34
   - JPY: 155.0
   - GBP: 0.78
3. **Cross-Rate Conversion Formula**:
   $$\text{Amount}_{\text{target}} = \text{Amount}_{\text{source}} \times \left(\frac{\text{Rate}(\text{Target})}{\text{Rate}(\text{Source})}\right)$$
4. **Base Currency Auto-Detection**: If no `base_currency` is provided, find the currency holding the majority of wallet balances or transaction frequency, defaulting to `"IDR"`.

### 3. Recurring Transaction Next Run & Forward Virtual Cashflow Projection
- **Advancement Logic**:
  - `daily`: $+ (1 \times \text{interval})$ days
  - `weekly`: $+ (7 \times \text{interval})$ days
  - `monthly`: $+ (1 \times \text{interval})$ months (preserving day-of-month or clamped to last day)
  - `yearly`: $+ (1 \times \text{interval})$ years
- **Virtual Forward Projection**:
  - Given lookahead window $[D_{\text{now}}, D_{\text{now}} + W_{\text{days}}]$ (default $W=30$).
  - For each active template, simulate next dates up to $D_{\text{now}} + W_{\text{days}}$ in-memory.
  - Sum virtual income and virtual expenses to calculate projected cashflow delta. Zero database writes are performed during projection.

### 4. Template Execution (Atomic Apply)
When applying template $T$:
1. Read template and verify `template_user_id == authenticated_user_id`.
2. Insert new transaction record with date = `template_next_run_date`.
3. Update wallet balance atomically (debit wallet for expense, credit for income, transfer logic for transfer).
4. Compute and update template's `template_next_run_date` to next scheduled occurrence.

## Security & Multi-Tenancy (RLS)

- Every query against `goals` includes `where: eq(goals.goalUserId, userId)`.
- Every query against `recurring_templates` includes `where: eq(recurringTemplates.templateUserId, userId)`.
- Foreign key checks ensure users cannot link wallets or categories belonging to other users.

## Risks & Mitigations

- **[Risk] External FX API latency or downtime** -> **Mitigation**: 3-second timeout and hardcoded edge fallback table ensuring 100% uptime on Cloudflare Workers.
- **[Risk] Leap year or variable month-length date math** -> **Mitigation**: Use robust date arithmetic utilities (like `Date` UTC setters with month end clamping).
- **[Risk] Unintended double application of recurring templates** -> **Mitigation**: Immediate atomic advancement of `template_next_run_date` in the same D1 execution transaction.
