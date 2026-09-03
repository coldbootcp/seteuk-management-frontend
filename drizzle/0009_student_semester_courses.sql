CREATE TABLE `student_semester_courses` (
  `id` text PRIMARY KEY NOT NULL,
  `student_id` text NOT NULL,
  `roadmap_node_id` text NOT NULL,
  `grade` integer NOT NULL,
  `semester` integer NOT NULL,
  `subject` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX `idx_semester_courses_student_node` ON `student_semester_courses` (`student_id`,`roadmap_node_id`);
