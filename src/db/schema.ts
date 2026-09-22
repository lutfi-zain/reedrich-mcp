import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, real, index, uniqueIndex, primaryKey } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  userId: text("user_id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userFirstName: text("user_first_name").notNull(),
  userLastName: text("user_last_name").notNull(),
  userEmail: text("user_email").notNull().unique(),
  userWhatsappNumber: text("user_whatsapp_number").notNull(),
  userApiKeyHash: text("user_api_key_hash").notNull().unique(),
  userCreatedAt: text("user_created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("users_email_idx").on(table.userEmail),
  uniqueIndex("users_api_key_hash_idx").on(table.userApiKeyHash),
]);

export const wallets = sqliteTable("wallets", {
  walletId: text("wallet_id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  walletUserId: text("wallet_user_id")
    .notNull()
    .references(() => users.userId, { onDelete: "cascade" }),
  walletName: text("wallet_name").notNull(),
  walletInstitution: text("wallet_institution").notNull().default("General"),
  walletType: text("wallet_type").notNull().default("bank"),
  walletBalance: real("wallet_balance").notNull().default(0.0),
  walletCurrency: text("wallet_currency").notNull().default("IDR"),
  walletIsLocked: integer("wallet_is_locked")
    .notNull()
    .default(0),
  walletCreatedAt: text("wallet_created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("wallets_user_id_idx").on(table.walletUserId),
  index("wallets_institution_idx").on(table.walletInstitution),
  index("wallets_user_locked_idx").on(table.walletUserId, table.walletIsLocked),
]);

export const categories = sqliteTable("categories", {
  categoryId: text("category_id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  categoryUserId: text("category_user_id")
    .notNull()
    .references(() => users.userId, { onDelete: "cascade" }),
  categoryName: text("category_name").notNull(),
  categoryType: text("category_type").notNull().default("expense"),
  categoryIcon: text("category_icon"),
  categoryCreatedAt: text("category_created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("categories_user_id_idx").on(table.categoryUserId),
]);

export const budgets = sqliteTable("budgets", {
  budgetId: text("budget_id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  budgetUserId: text("budget_user_id")
    .notNull()
    .references(() => users.userId, { onDelete: "cascade" }),
  budgetName: text("budget_name").notNull(),
  budgetCategoryId: text("budget_category_id").references(() => categories.categoryId, { onDelete: "set null" }),
  budgetAmount: real("budget_amount").notNull(),
  budgetPeriodStart: text("budget_period_start").notNull(),
  budgetPeriodEnd: text("budget_period_end").notNull(),
  budgetCreatedAt: text("budget_created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("budgets_user_period_idx").on(table.budgetUserId, table.budgetPeriodStart, table.budgetPeriodEnd),
  index("budgets_category_id_idx").on(table.budgetCategoryId),
]);

export const transactions = sqliteTable("transactions", {
  transactionId: text("transaction_id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  transactionUserId: text("transaction_user_id")
    .notNull()
    .references(() => users.userId, { onDelete: "cascade" }),
  transactionWalletId: text("transaction_wallet_id")
    .notNull()
    .references(() => wallets.walletId, { onDelete: "cascade" }),
  transactionTargetWalletId: text("transaction_target_wallet_id")
    .references(() => wallets.walletId, { onDelete: "set null" }),
  transactionCategoryId: text("transaction_category_id")
    .references(() => categories.categoryId, { onDelete: "set null" }),
  transactionBudgetId: text("transaction_budget_id").references(() => budgets.budgetId, { onDelete: "set null" }),
  transactionAmount: real("transaction_amount").notNull(),
  transactionAdminFee: real("transaction_admin_fee").notNull().default(0.0),
  transactionType: text("transaction_type").notNull().default("expense"), // "expense" | "income" | "transfer"
  transactionDescription: text("transaction_description"),
  transactionIsPlanned: integer("transaction_is_planned").notNull().default(0), // 0 or 1
  transactionTemplateId: text("transaction_template_id")
    .references(() => recurringTemplates.templateId, { onDelete: "set null" }),
  transactionOccurrenceDate: text("transaction_occurrence_date"), // YYYY-MM-DD
  transactionRealizedAt: text("transaction_realized_at"), // ISO-8601, set on realize flip
  transactionPlannedAmount: real("transaction_planned_amount"), // populated only on override realizes
  transactionDate: text("transaction_date").notNull(), // ISO-8601 string with timezone
  transactionCreatedAt: text("transaction_created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("transactions_user_date_idx").on(table.transactionUserId, table.transactionDate),
  index("transactions_wallet_id_idx").on(table.transactionWalletId),
  index("transactions_target_wallet_id_idx").on(table.transactionTargetWalletId),
  index("transactions_category_id_idx").on(table.transactionCategoryId),
  index("transactions_budget_id_idx").on(table.transactionBudgetId),
  index("transactions_template_planned_date_idx").on(table.transactionTemplateId, table.transactionIsPlanned, table.transactionDate),
]);

export const debtsLoans = sqliteTable("debts_loans", {
  debtLoanId: text("debt_loan_id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  debtLoanUserId: text("debt_loan_user_id")
    .notNull()
    .references(() => users.userId, { onDelete: "cascade" }),
  debtLoanPersonName: text("debt_loan_person_name").notNull(),
  debtLoanType: text("debt_loan_type").notNull().default("loan"), // "debt" | "loan"
  debtLoanAmount: real("debt_loan_amount").notNull(),
  debtLoanRemainingAmount: real("debt_loan_remaining_amount").notNull(),
  debtLoanWalletId: text("debt_loan_wallet_id")
    .references(() => wallets.walletId, { onDelete: "set null" }),
  debtLoanDueDate: text("debt_loan_due_date"), // YYYY-MM-DD or ISO-8601 string
  debtLoanStatus: text("debt_loan_status").notNull().default("unpaid"), // "unpaid" | "partially_paid" | "paid"
  debtLoanNotes: text("debt_loan_notes"),
  debtLoanCreatedAt: text("debt_loan_created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("debts_loans_user_status_idx").on(table.debtLoanUserId, table.debtLoanStatus),
  index("debts_loans_user_due_date_idx").on(table.debtLoanUserId, table.debtLoanDueDate),
  index("debts_loans_wallet_id_idx").on(table.debtLoanWalletId),
]);

export const feedbacks = sqliteTable("feedbacks", {
  feedbackId: text("feedback_id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  feedbackUserId: text("feedback_user_id")
    .references(() => users.userId, { onDelete: "set null" }),
  feedbackTitle: text("feedback_title").notNull(),
  feedbackContent: text("feedback_content").notNull(),
  feedbackType: text("feedback_type").notNull().default("feedback"),
  feedbackSubmitterName: text("feedback_submitter_name").notNull(),
  feedbackSubmitterEmail: text("feedback_submitter_email").notNull(),
  feedbackStatus: text("feedback_status").notNull().default("new"),
  feedbackCreatedAt: text("feedback_created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("feedbacks_user_id_idx").on(table.feedbackUserId),
  index("feedbacks_type_idx").on(table.feedbackType),
  index("feedbacks_status_idx").on(table.feedbackStatus),
  index("feedbacks_created_at_idx").on(table.feedbackCreatedAt),
]);

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

export const goalWallets = sqliteTable("goal_wallets", {
  goalId: text("goal_id")
    .notNull()
    .references(() => goals.goalId, { onDelete: "cascade" }),
  walletId: text("wallet_id")
    .notNull()
    .references(() => wallets.walletId, { onDelete: "cascade" }),
  goalWalletCreatedAt: text("goal_wallet_created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  primaryKey({ columns: [table.goalId, table.walletId] }),
  index("goal_wallets_goal_id_idx").on(table.goalId),
  index("goal_wallets_wallet_id_idx").on(table.walletId),
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
