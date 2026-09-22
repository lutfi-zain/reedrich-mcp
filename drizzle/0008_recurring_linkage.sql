ALTER TABLE `transactions` ADD COLUMN `transaction_template_id` text;
--> statement-breakpoint
ALTER TABLE `transactions` ADD COLUMN `transaction_occurrence_date` text;
--> statement-breakpoint
ALTER TABLE `transactions` ADD COLUMN `transaction_realized_at` text;
--> statement-breakpoint
ALTER TABLE `transactions` ADD COLUMN `transaction_planned_amount` real;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `transactions_template_planned_date_idx` ON `transactions` (`transaction_template_id`, `transaction_is_planned`, `transaction_date`);
