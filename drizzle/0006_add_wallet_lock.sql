ALTER TABLE `wallets` ADD COLUMN `wallet_is_locked` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `wallets_user_locked_idx` ON `wallets` (`wallet_user_id`, `wallet_is_locked`);
