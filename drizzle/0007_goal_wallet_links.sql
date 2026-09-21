CREATE TABLE IF NOT EXISTS `goal_wallets` (
	`goal_id` text NOT NULL,
	`wallet_id` text NOT NULL,
	`goal_wallet_created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`goal_id`, `wallet_id`),
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`goal_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`wallet_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `goal_wallets_goal_id_idx` ON `goal_wallets` (`goal_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `goal_wallets_wallet_id_idx` ON `goal_wallets` (`wallet_id`);
