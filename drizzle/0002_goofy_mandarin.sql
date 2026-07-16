CREATE TABLE `recommendation_feedback_v2` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`analysis_id` text NOT NULL,
	`recommendation_id` text NOT NULL,
	`action` text NOT NULL,
	`reason` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
