CREATE TABLE `school_record_courses` (
	`id` text PRIMARY KEY NOT NULL,
	`import_id` text NOT NULL,
	`student_id` text NOT NULL,
	`grade` integer NOT NULL,
	`semester` integer NOT NULL,
	`subject` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `school_record_import_items` (
	`id` text PRIMARY KEY NOT NULL,
	`import_id` text NOT NULL,
	`activity_id` text NOT NULL,
	`grade` integer NOT NULL,
	`semester` integer NOT NULL,
	`date_basis` text NOT NULL,
	`confidence` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `school_record_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`file_name` text NOT NULL,
	`total_pages` integer NOT NULL,
	`course_count` integer NOT NULL,
	`entry_count` integer NOT NULL,
	`status` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
