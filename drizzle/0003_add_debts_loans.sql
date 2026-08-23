CREATE TABLE IF NOT EXISTS `debts_loans` (
	`debt_loan_id` text PRIMARY KEY NOT NULL,
	`debt_loan_user_id` text NOT NULL,
	`debt_loan_person_name` text NOT NULL,
	`debt_loan_type` text DEFAULT 'loan' NOT NULL,
	`debt_loan_amount` real NOT NULL,
	`debt_loan_remaining_amount` real NOT NULL,
	`debt_loan_wallet_id` text,
	`debt_loan_due_date` text,
	`debt_loan_status` text DEFAULT 'unpaid' NOT NULL,
	`debt_loan_notes` text,
	`debt_loan_created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`debt_loan_user_id`) REFERENCES `users`(`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`debt_loan_wallet_id`) REFERENCES `wallets`(`wallet_id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `debts_loans_user_status_idx` ON `debts_loans` (`debt_loan_user_id`, `debt_loan_status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `debts_loans_user_due_date_idx` ON `debts_loans` (`debt_loan_user_id`, `debt_loan_due_date`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `debts_loans_wallet_id_idx` ON `debts_loans` (`debt_loan_wallet_id`);
