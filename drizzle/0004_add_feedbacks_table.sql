CREATE TABLE IF NOT EXISTS `feedbacks` (
	`feedback_id` text PRIMARY KEY NOT NULL,
	`feedback_user_id` text,
	`feedback_title` text NOT NULL,
	`feedback_content` text NOT NULL,
	`feedback_type` text DEFAULT 'feedback' NOT NULL,
	`feedback_submitter_name` text NOT NULL,
	`feedback_submitter_email` text NOT NULL,
	`feedback_status` text DEFAULT 'new' NOT NULL,
	`feedback_created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`feedback_user_id`) REFERENCES `users`(`user_id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `feedbacks_user_id_idx` ON `feedbacks` (`feedback_user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `feedbacks_type_idx` ON `feedbacks` (`feedback_type`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `feedbacks_status_idx` ON `feedbacks` (`feedback_status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `feedbacks_created_at_idx` ON `feedbacks` (`feedback_created_at`);
