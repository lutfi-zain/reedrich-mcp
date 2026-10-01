-- Reedrich MCP PostgreSQL Schema
-- Targets PostgreSQL 16+

CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  user_first_name TEXT NOT NULL,
  user_last_name TEXT NOT NULL,
  user_email TEXT NOT NULL UNIQUE,
  user_whatsapp_number TEXT NOT NULL,
  user_api_key_hash TEXT NOT NULL UNIQUE,
  user_created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users (user_email);
CREATE UNIQUE INDEX IF NOT EXISTS users_api_key_hash_idx ON users (user_api_key_hash);

CREATE TABLE IF NOT EXISTS wallets (
  wallet_id TEXT PRIMARY KEY,
  wallet_user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  wallet_name TEXT NOT NULL,
  wallet_institution TEXT NOT NULL DEFAULT 'General',
  wallet_type TEXT NOT NULL DEFAULT 'bank',
  wallet_balance DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  wallet_currency TEXT NOT NULL DEFAULT 'IDR',
  wallet_is_locked INTEGER NOT NULL DEFAULT 0,
  wallet_created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS wallets_user_id_idx ON wallets (wallet_user_id);
CREATE INDEX IF NOT EXISTS wallets_institution_idx ON wallets (wallet_institution);
CREATE INDEX IF NOT EXISTS wallets_user_locked_idx ON wallets (wallet_user_id, wallet_is_locked);

CREATE TABLE IF NOT EXISTS categories (
  category_id TEXT PRIMARY KEY,
  category_user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  category_name TEXT NOT NULL,
  category_type TEXT NOT NULL DEFAULT 'expense',
  category_icon TEXT,
  category_created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS categories_user_id_idx ON categories (category_user_id);

CREATE TABLE IF NOT EXISTS budgets (
  budget_id TEXT PRIMARY KEY,
  budget_user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  budget_name TEXT NOT NULL,
  budget_category_id TEXT REFERENCES categories(category_id) ON DELETE SET NULL,
  budget_amount DOUBLE PRECISION NOT NULL,
  budget_period_start TEXT NOT NULL,
  budget_period_end TEXT NOT NULL,
  budget_created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS budgets_user_period_idx ON budgets (budget_user_id, budget_period_start, budget_period_end);
CREATE INDEX IF NOT EXISTS budgets_category_id_idx ON budgets (budget_category_id);

CREATE TABLE IF NOT EXISTS recurring_templates (
  template_id TEXT PRIMARY KEY,
  template_user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  template_name TEXT NOT NULL,
  template_wallet_id TEXT NOT NULL REFERENCES wallets(wallet_id) ON DELETE CASCADE,
  template_target_wallet_id TEXT REFERENCES wallets(wallet_id) ON DELETE SET NULL,
  template_category_id TEXT REFERENCES categories(category_id) ON DELETE SET NULL,
  template_amount DOUBLE PRECISION NOT NULL,
  template_admin_fee DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  template_type TEXT NOT NULL DEFAULT 'expense',
  template_frequency TEXT NOT NULL DEFAULT 'monthly',
  template_interval INTEGER NOT NULL DEFAULT 1,
  template_start_date TEXT NOT NULL,
  template_next_run_date TEXT NOT NULL,
  template_end_date TEXT,
  template_is_active INTEGER NOT NULL DEFAULT 1,
  template_notes TEXT,
  template_created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS recurring_templates_user_active_idx ON recurring_templates (template_user_id, template_is_active);
CREATE INDEX IF NOT EXISTS recurring_templates_next_run_idx ON recurring_templates (template_user_id, template_next_run_date);
CREATE INDEX IF NOT EXISTS recurring_templates_wallet_id_idx ON recurring_templates (template_wallet_id);

CREATE TABLE IF NOT EXISTS transactions (
  transaction_id TEXT PRIMARY KEY,
  transaction_user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  transaction_wallet_id TEXT NOT NULL REFERENCES wallets(wallet_id) ON DELETE CASCADE,
  transaction_target_wallet_id TEXT REFERENCES wallets(wallet_id) ON DELETE SET NULL,
  transaction_category_id TEXT REFERENCES categories(category_id) ON DELETE SET NULL,
  transaction_budget_id TEXT REFERENCES budgets(budget_id) ON DELETE SET NULL,
  transaction_amount DOUBLE PRECISION NOT NULL,
  transaction_admin_fee DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  transaction_type TEXT NOT NULL DEFAULT 'expense',
  transaction_description TEXT,
  transaction_is_planned INTEGER NOT NULL DEFAULT 0,
  transaction_template_id TEXT REFERENCES recurring_templates(template_id) ON DELETE SET NULL,
  transaction_occurrence_date TEXT,
  transaction_realized_at TEXT,
  transaction_planned_amount DOUBLE PRECISION,
  transaction_date TEXT NOT NULL,
  transaction_created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS transactions_user_date_idx ON transactions (transaction_user_id, transaction_date);
CREATE INDEX IF NOT EXISTS transactions_wallet_id_idx ON transactions (transaction_wallet_id);
CREATE INDEX IF NOT EXISTS transactions_target_wallet_id_idx ON transactions (transaction_target_wallet_id);
CREATE INDEX IF NOT EXISTS transactions_category_id_idx ON transactions (transaction_category_id);
CREATE INDEX IF NOT EXISTS transactions_budget_id_idx ON transactions (transaction_budget_id);
CREATE INDEX IF NOT EXISTS transactions_template_planned_date_idx ON transactions (transaction_template_id, transaction_is_planned, transaction_date);

CREATE TABLE IF NOT EXISTS debts_loans (
  debt_loan_id TEXT PRIMARY KEY,
  debt_loan_user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  debt_loan_person_name TEXT NOT NULL,
  debt_loan_type TEXT NOT NULL DEFAULT 'loan',
  debt_loan_amount DOUBLE PRECISION NOT NULL,
  debt_loan_remaining_amount DOUBLE PRECISION NOT NULL,
  debt_loan_wallet_id TEXT REFERENCES wallets(wallet_id) ON DELETE SET NULL,
  debt_loan_due_date TEXT,
  debt_loan_status TEXT NOT NULL DEFAULT 'unpaid',
  debt_loan_notes TEXT,
  debt_loan_created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS debts_loans_user_status_idx ON debts_loans (debt_loan_user_id, debt_loan_status);
CREATE INDEX IF NOT EXISTS debts_loans_user_due_date_idx ON debts_loans (debt_loan_user_id, debt_loan_due_date);
CREATE INDEX IF NOT EXISTS debts_loans_wallet_id_idx ON debts_loans (debt_loan_wallet_id);

CREATE TABLE IF NOT EXISTS feedbacks (
  feedback_id TEXT PRIMARY KEY,
  feedback_user_id TEXT REFERENCES users(user_id) ON DELETE SET NULL,
  feedback_title TEXT NOT NULL,
  feedback_content TEXT NOT NULL,
  feedback_type TEXT NOT NULL DEFAULT 'feedback',
  feedback_submitter_name TEXT NOT NULL,
  feedback_submitter_email TEXT NOT NULL,
  feedback_status TEXT NOT NULL DEFAULT 'new',
  feedback_created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS feedbacks_user_id_idx ON feedbacks (feedback_user_id);
CREATE INDEX IF NOT EXISTS feedbacks_type_idx ON feedbacks (feedback_type);
CREATE INDEX IF NOT EXISTS feedbacks_status_idx ON feedbacks (feedback_status);
CREATE INDEX IF NOT EXISTS feedbacks_created_at_idx ON feedbacks (feedback_created_at);

CREATE TABLE IF NOT EXISTS goals (
  goal_id TEXT PRIMARY KEY,
  goal_user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  goal_name TEXT NOT NULL,
  goal_target_amount DOUBLE PRECISION NOT NULL,
  goal_current_amount DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  goal_currency TEXT NOT NULL DEFAULT 'IDR',
  goal_target_date TEXT,
  goal_wallet_id TEXT REFERENCES wallets(wallet_id) ON DELETE SET NULL,
  goal_category_id TEXT REFERENCES categories(category_id) ON DELETE SET NULL,
  goal_status TEXT NOT NULL DEFAULT 'in_progress',
  goal_notes TEXT,
  goal_created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS goals_user_status_idx ON goals (goal_user_id, goal_status);
CREATE INDEX IF NOT EXISTS goals_user_target_date_idx ON goals (goal_user_id, goal_target_date);
CREATE INDEX IF NOT EXISTS goals_wallet_id_idx ON goals (goal_wallet_id);

CREATE TABLE IF NOT EXISTS goal_wallets (
  goal_id TEXT NOT NULL REFERENCES goals(goal_id) ON DELETE CASCADE,
  wallet_id TEXT NOT NULL REFERENCES wallets(wallet_id) ON DELETE CASCADE,
  goal_wallet_created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (goal_id, wallet_id)
);

CREATE INDEX IF NOT EXISTS goal_wallets_goal_id_idx ON goal_wallets (goal_id);
CREATE INDEX IF NOT EXISTS goal_wallets_wallet_id_idx ON goal_wallets (wallet_id);
