ALTER TABLE `roadmap_plan_events` ADD `priority` text NOT NULL DEFAULT 'core';
--> statement-breakpoint
ALTER TABLE `roadmap_plan_events` ADD `description` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `student_activities_v2` ADD `linked_plan_title` text;
