CREATE TABLE `roadmap_plan_events` (
	`id` text PRIMARY KEY NOT NULL,
	`roadmap_id` text NOT NULL,
	`node_id` text NOT NULL,
	`student_id` text NOT NULL,
	`month_day` text NOT NULL,
	`category` text NOT NULL,
	`subject` text NOT NULL,
	`title` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `student_workspaces` ADD `motivation_trigger` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `student_workspaces` ADD `career_resolution` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `student_workspaces` ADD `current_engagement_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `student_workspaces` ADD `output_preference` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `student_workspaces` ADD `collaboration_style` text DEFAULT '' NOT NULL;