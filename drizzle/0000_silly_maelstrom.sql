CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`subject` text NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`concepts` text NOT NULL,
	`completed_at` text NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `recommendation_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`student_id` text NOT NULL,
	`recommendation_id` text NOT NULL,
	`action` text NOT NULL,
	`reason` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recommendation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`task` text NOT NULL,
	`input_json` text NOT NULL,
	`output_json` text NOT NULL,
	`provider` text DEFAULT 'mock' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `students` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`grade` integer NOT NULL,
	`target_career` text NOT NULL,
	`interests` text NOT NULL,
	`strengths` text NOT NULL,
	`gaps` text NOT NULL,
	`color` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
