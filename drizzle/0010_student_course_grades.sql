CREATE TABLE `student_course_grades` (
  `id` text PRIMARY KEY NOT NULL,
  `student_id` text NOT NULL,
  `semester_course_id` text NOT NULL,
  `rank` integer,
  `score` integer,
  `note` text DEFAULT '' NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX `idx_course_grades_student_course` ON `student_course_grades` (`student_id`,`semester_course_id`);
