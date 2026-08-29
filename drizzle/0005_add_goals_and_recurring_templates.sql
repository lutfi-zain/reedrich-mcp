CREATE TABLE IF NOT EXISTS `goals` (
	`goal_id` text PRIMARY KEY NOT NULL,
	`goal_user_id` text NOT NULL,
	`goal_name` text NOT NULL,
	`goal_target_amount` real NOT NULL,
	`goal_current_amount` real DEFAULT 0.0 NOT NULL,
	`goal_currency` text DEFAULT 'IDR' NOT NULL,
	`goal_target_date` text,
	`goal_wallet_id` text,
	`goal_category_id` text,
	`goal_status` text DEFAULT 'in_progress' NOT NULL,
	`goal_notes` text,
	`goal_created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`goal_user_id`) REFERENCES `users`(`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`goal_wallet_id`) REFERENCES `wallets`(`wallet_id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`goal_category_id`) REFERENCES `categories`(`category_id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `goals_user_status_idx` ON `goals` (`goal_user_id`, `goal_status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `goals_user_target_date_idx` ON `goals` (`goal_user_id`, `goal_target_date`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `goals_wallet_id_idx` ON `goals` (`goal_wallet_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `recurring_templates` (
	`template_id` text PRIMARY KEY NOT NULL,
	`template_user_id` text NOT NULL,
	`template_name` text NOT NULL,
	`template_wallet_id` text NOT NULL,
	`template_target_wallet_id` text,
	`template_category_id` text,
	`template_amount` real NOT NULL,
	`template_admin_fee` real DEFAULT 0.0 NOT NULL,
	`template_type` text DEFAULT 'expense' NOT NULL,
	`template_frequency` text DEFAULT 'monthly' NOT NULL,
	`template_interval` integer DEFAULT 1 NOT NULL,
	`template_start_date` text NOT NULL,
	`template_next_run_date` text NOT NULL,
	`template_end_date` text,
	`template_is_active` integer DEFAULT 1 NOT NULL,
	`template_notes` text,
	`template_created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`template_user_id`) REFERENCES `users`(`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_wallet_id`) REFERENCES `wallets`(`wallet_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_target_wallet_id`) REFERENCES `wallets`(`wallet_id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`template_category_id`) REFERENCES `categories`(`category_id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `recurring_templates_user_active_idx` ON `recurring_templates` (`template_user_id`, `template_is_active`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `recurring_templates_next_run_idx` ON `recurring_templates` (`template_user_id`, `template_next_run_date`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `recurring_templates_wallet_id_idx` ON `recurring_templates` (`template_wallet_id`);
