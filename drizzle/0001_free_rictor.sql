CREATE TABLE `assignment_analyses` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`task` text NOT NULL,
	`result_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reconciliation_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`activity_id` text NOT NULL,
	`roadmap_id` text NOT NULL,
	`node_id` text,
	`match_type` text NOT NULL,
	`rationale` text NOT NULL,
	`action` text NOT NULL,
	`confidence` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `roadmap_nodes` (
	`id` text PRIMARY KEY NOT NULL,
	`roadmap_id` text NOT NULL,
	`student_id` text NOT NULL,
	`order_index` integer NOT NULL,
	`grade` integer NOT NULL,
	`semester` integer NOT NULL,
	`narrative_stage` text NOT NULL,
	`title` text NOT NULL,
	`objective` text NOT NULL,
	`candidate_subjects_json` text NOT NULL,
	`competency_goals_json` text NOT NULL,
	`status` text NOT NULL,
	`instantiated_activity_id` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `roadmaps` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`version` integer NOT NULL,
	`career_track` text NOT NULL,
	`template_id` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `student_activities_v2` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`activity_type` text NOT NULL,
	`subject` text NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`concepts_json` text NOT NULL,
	`outputs_json` text NOT NULL,
	`status` text NOT NULL,
	`roadmap_node_id` text,
	`completed_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `student_workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`grade` integer NOT NULL,
	`semester` integer NOT NULL,
	`target_career` text NOT NULL,
	`target_majors_json` text NOT NULL,
	`interests_json` text NOT NULL,
	`preferred_subjects_json` text NOT NULL,
	`strengths_json` text NOT NULL,
	`gaps_json` text NOT NULL,
	`constraints_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
