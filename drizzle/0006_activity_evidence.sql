CREATE TABLE `activity_attachments` (
  `id` text PRIMARY KEY NOT NULL,
  `activity_id` text NOT NULL,
  `student_id` text NOT NULL,
  `file_name` text NOT NULL,
  `content_type` text NOT NULL,
  `size_bytes` integer NOT NULL,
  `storage_key` text NOT NULL,
  `extracted_text` text DEFAULT '' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_activity_attachments_student_activity` ON `activity_attachments` (`student_id`,`activity_id`);
--> statement-breakpoint
CREATE TABLE `activity_reviews` (
  `activity_id` text PRIMARY KEY NOT NULL,
  `student_id` text NOT NULL,
  `plan_event_id` text,
  `alignment` text NOT NULL,
  `result_json` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_activity_reviews_student_created` ON `activity_reviews` (`student_id`,`created_at`);
