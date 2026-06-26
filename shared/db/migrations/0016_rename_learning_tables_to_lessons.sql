ALTER TABLE IF EXISTS "learning_lessons" RENAME TO "lessons";
ALTER TABLE IF EXISTS "learning_sessions" RENAME TO "student_sessions";
ALTER TABLE IF EXISTS "learning_evidence_embeddings" RENAME TO "lesson_evidence_embeddings";
ALTER TABLE IF EXISTS "learning_teacher_chat_sessions" RENAME TO "teacher_student_chat_sessions";
ALTER TABLE IF EXISTS "learning_messages" RENAME TO "student_session_messages";
ALTER TABLE IF EXISTS "learning_interactions" RENAME TO "student_interactions";
ALTER TABLE IF EXISTS "student_progress_reports" RENAME TO "student_lesson_reports";
ALTER TABLE IF EXISTS "learning_interventions" RENAME TO "lesson_interventions";
--> statement-breakpoint
ALTER INDEX IF EXISTS "learning_lessons_classroom_id_idx" RENAME TO "lessons_classroom_id_idx";
ALTER INDEX IF EXISTS "learning_lessons_created_by_user_id_idx" RENAME TO "lessons_created_by_user_id_idx";
ALTER INDEX IF EXISTS "learning_lessons_course_id_idx" RENAME TO "lessons_course_id_idx";
ALTER INDEX IF EXISTS "learning_lessons_status_idx" RENAME TO "lessons_status_idx";
--> statement-breakpoint
ALTER INDEX IF EXISTS "learning_sessions_lesson_id_idx" RENAME TO "student_sessions_lesson_id_idx";
ALTER INDEX IF EXISTS "learning_sessions_student_id_idx" RENAME TO "student_sessions_student_id_idx";
ALTER INDEX IF EXISTS "learning_sessions_type_idx" RENAME TO "student_sessions_type_idx";
ALTER INDEX IF EXISTS "learning_sessions_active_lesson_unique" RENAME TO "student_sessions_active_lesson_unique";
ALTER INDEX IF EXISTS "learning_sessions_active_non_lesson_unique" RENAME TO "student_sessions_active_non_lesson_unique";
ALTER TABLE IF EXISTS "student_sessions" RENAME CONSTRAINT "learning_sessions_status_check" TO "student_sessions_status_check";
--> statement-breakpoint
ALTER INDEX IF EXISTS "learning_evidence_embeddings_lesson_idx" RENAME TO "lesson_evidence_embeddings_lesson_idx";
ALTER INDEX IF EXISTS "learning_evidence_embeddings_classroom_idx" RENAME TO "lesson_evidence_embeddings_classroom_idx";
ALTER INDEX IF EXISTS "learning_evidence_embeddings_student_idx" RENAME TO "lesson_evidence_embeddings_student_idx";
ALTER INDEX IF EXISTS "learning_evidence_embeddings_user_idx" RENAME TO "lesson_evidence_embeddings_user_idx";
ALTER INDEX IF EXISTS "learning_evidence_embeddings_source_idx" RENAME TO "lesson_evidence_embeddings_source_idx";
ALTER INDEX IF EXISTS "learning_evidence_embeddings_language_idx" RENAME TO "lesson_evidence_embeddings_language_idx";
ALTER INDEX IF EXISTS "learning_evidence_embeddings_subject_idx" RENAME TO "lesson_evidence_embeddings_subject_idx";
ALTER INDEX IF EXISTS "learning_evidence_embeddings_embedding_idx" RENAME TO "lesson_evidence_embeddings_embedding_idx";
ALTER INDEX IF EXISTS "learning_evidence_embeddings_source_chunk_unique" RENAME TO "lesson_evidence_embeddings_source_chunk_unique";
ALTER INDEX IF EXISTS "learning_evidence_embeddings_retrieval_en_idx" RENAME TO "lesson_evidence_embeddings_retrieval_en_idx";
ALTER INDEX IF EXISTS "learning_evidence_embeddings_retrieval_de_idx" RENAME TO "lesson_evidence_embeddings_retrieval_de_idx";
ALTER INDEX IF EXISTS "learning_evidence_embeddings_retrieval_fr_idx" RENAME TO "lesson_evidence_embeddings_retrieval_fr_idx";
--> statement-breakpoint
ALTER INDEX IF EXISTS "learning_teacher_chat_sessions_student_idx" RENAME TO "teacher_student_chat_sessions_student_idx";
ALTER INDEX IF EXISTS "learning_teacher_chat_sessions_user_idx" RENAME TO "teacher_student_chat_sessions_user_idx";
ALTER INDEX IF EXISTS "learning_messages_session_id_idx" RENAME TO "student_session_messages_session_id_idx";
ALTER INDEX IF EXISTS "learning_interactions_student_id_idx" RENAME TO "student_interactions_student_id_idx";
ALTER INDEX IF EXISTS "learning_interactions_lesson_id_idx" RENAME TO "student_interactions_lesson_id_idx";
ALTER INDEX IF EXISTS "learning_interactions_session_id_idx" RENAME TO "student_interactions_session_id_idx";
ALTER INDEX IF EXISTS "learning_interactions_phase_idx" RENAME TO "student_interactions_phase_idx";
--> statement-breakpoint
ALTER INDEX IF EXISTS "student_progress_reports_lesson_id_idx" RENAME TO "student_lesson_reports_lesson_id_idx";
ALTER INDEX IF EXISTS "student_progress_reports_student_id_idx" RENAME TO "student_lesson_reports_student_id_idx";
ALTER TABLE IF EXISTS "student_lesson_reports" RENAME CONSTRAINT "student_progress_reports_visibility_check" TO "student_lesson_reports_visibility_check";
ALTER INDEX IF EXISTS "learning_interventions_classroom_idx" RENAME TO "lesson_interventions_classroom_idx";
ALTER INDEX IF EXISTS "learning_interventions_lesson_idx" RENAME TO "lesson_interventions_lesson_idx";
ALTER INDEX IF EXISTS "learning_interventions_student_idx" RENAME TO "lesson_interventions_student_idx";
ALTER INDEX IF EXISTS "learning_interventions_status_idx" RENAME TO "lesson_interventions_status_idx";
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'lesson_materials'
      AND column_name = 'coverage_review'
  ) THEN
    ALTER TABLE "lesson_materials" RENAME COLUMN "coverage_review" TO "coverage_analysis";
  END IF;
END $$;
