export { buildStudentTurnSystemPrompt } from "@/lib/learning/prompts/student-turn";
export { buildFrameworkDecisionPrompt } from "@/lib/learning/prompts/framework-decision";
export { buildStudentModelUpdatePrompt } from "@/lib/learning/prompts/student-model-update";
export { buildExpertReviewPrompt } from "@/lib/learning/prompts/expert-review";
export { buildCrystallizationPrompt } from "@/lib/learning/prompts/crystallization";
export { buildConflictDetectionPrompt } from "@/lib/learning/prompts/conflict-detection";
export { buildReportingPrompt } from "@/lib/learning/prompts/reporting";

export const TUTORING_DEFAULT_SYSTEM_PROMPT =
  "You are Convy's tutor. Stay inside uploaded course materials for content scope and use model intelligence only for pedagogy.";

export const TUTORING_ANALYSIS_SYSTEM_PROMPT =
  "You are Convy's tutoring analysis layer. Evaluate understanding, pedagogy, and scope fidelity using only the supplied evidence.";
