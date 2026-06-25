import { defaultAppLocale } from "@/shared/i18n/config";

export const LEARNING_DEFAULT_LOCALE = defaultAppLocale;

export const GRADE_BAND_VALUES = [
  "nursery",
  "primary",
  "secondary",
  "university",
] as const;

export const MOTIVATIONAL_STYLE_VALUES = [
  "competition",
  "creativity",
  "helping_others",
  "financial_success",
  "recognition",
  "personal_mastery",
] as const;

export const LEARNING_RELATIONSHIP_VALUES = [
  "positive",
  "neutral",
  "damaged",
] as const;

export const SESSION_OPENING_STRATEGY_VALUES = [
  "world_connection",
  "story",
  "provocation",
  "question",
] as const;

export const LEARNING_INTERACTION_TYPE_VALUES = [
  "onboarding_turn",
  "student_message",
  "tutor_message",
  "framework_transition",
  "out_of_session_question",
  "agent_answer",
  "session_event",
  "expert_review",
  "report_event",
] as const;

export const QUESTION_INTENT_VALUES = [
  "phase_response",
  "clarification",
  "curiosity",
  "off_topic",
] as const;

export const QUESTION_INTENT = {
  PHASE_RESPONSE: QUESTION_INTENT_VALUES[0],
  CLARIFICATION: QUESTION_INTENT_VALUES[1],
  CURIOSITY: QUESTION_INTENT_VALUES[2],
  OFF_TOPIC: QUESTION_INTENT_VALUES[3],
} as const;

export const SESSION_COMPARISON_TREND_VALUES = [
  "improved",
  "steady",
  "regressed",
  "unknown",
] as const;

export const SESSION_COMPARISON_TREND = {
  IMPROVED: SESSION_COMPARISON_TREND_VALUES[0],
  STEADY: SESSION_COMPARISON_TREND_VALUES[1],
  REGRESSED: SESSION_COMPARISON_TREND_VALUES[2],
  UNKNOWN: SESSION_COMPARISON_TREND_VALUES[3],
} as const;

export const PRODUCTIVE_STRUGGLE_TARGET_BAND_VALUES = [
  "high_support",
  "balanced",
  "high_challenge",
] as const;

export const PRODUCTIVE_STRUGGLE_TARGET_BAND = {
  HIGH_SUPPORT: PRODUCTIVE_STRUGGLE_TARGET_BAND_VALUES[0],
  BALANCED: PRODUCTIVE_STRUGGLE_TARGET_BAND_VALUES[1],
  HIGH_CHALLENGE: PRODUCTIVE_STRUGGLE_TARGET_BAND_VALUES[2],
} as const;

export const PRODUCTIVE_STRUGGLE_READINESS_VALUES = [
  "fragile",
  "steady",
  "ready_for_more",
] as const;

export const PRODUCTIVE_STRUGGLE_READINESS = {
  FRAGILE: PRODUCTIVE_STRUGGLE_READINESS_VALUES[0],
  STEADY: PRODUCTIVE_STRUGGLE_READINESS_VALUES[1],
  READY_FOR_MORE: PRODUCTIVE_STRUGGLE_READINESS_VALUES[2],
} as const;

export const STUDENT_MASTERY_LEVEL_VALUES = [
  "surface",
  "applied",
  "generative",
] as const;

export const STUDENT_MASTERY_LEVEL = {
  SURFACE: STUDENT_MASTERY_LEVEL_VALUES[0],
  APPLIED: STUDENT_MASTERY_LEVEL_VALUES[1],
  GENERATIVE: STUDENT_MASTERY_LEVEL_VALUES[2],
} as const;

export const REPORT_TRANSFER_READINESS_VALUES = [
  "not_yet",
  "emerging",
  "ready",
] as const;

export const REPORT_TRANSFER_READINESS = {
  NOT_YET: REPORT_TRANSFER_READINESS_VALUES[0],
  EMERGING: REPORT_TRANSFER_READINESS_VALUES[1],
  READY: REPORT_TRANSFER_READINESS_VALUES[2],
} as const;

export const REPORT_ORIGINALITY_LEVEL_VALUES = [
  "low",
  "emerging",
  "strong",
] as const;

export const REPORT_ORIGINALITY_LEVEL = {
  LOW: REPORT_ORIGINALITY_LEVEL_VALUES[0],
  EMERGING: REPORT_ORIGINALITY_LEVEL_VALUES[1],
  STRONG: REPORT_ORIGINALITY_LEVEL_VALUES[2],
} as const;

export const REPORT_INTERVENTION_RECOMMENDATION_VALUES = [
  "reteach",
  "challenge",
  "practice",
  "confidence_check",
  "none",
] as const;

export const REPORT_INTERVENTION_RECOMMENDATION = {
  RETEACH: REPORT_INTERVENTION_RECOMMENDATION_VALUES[0],
  CHALLENGE: REPORT_INTERVENTION_RECOMMENDATION_VALUES[1],
  PRACTICE: REPORT_INTERVENTION_RECOMMENDATION_VALUES[2],
  CONFIDENCE_CHECK: REPORT_INTERVENTION_RECOMMENDATION_VALUES[3],
  NONE: REPORT_INTERVENTION_RECOMMENDATION_VALUES[4],
} as const;

export const OUT_OF_SESSION_CLASSIFICATION_VALUES = [
  "in_scope",
  "borderline",
  "off_scope",
] as const;

export const OUT_OF_SESSION_CLASSIFICATION = {
  IN_SCOPE: OUT_OF_SESSION_CLASSIFICATION_VALUES[0],
  BORDERLINE: OUT_OF_SESSION_CLASSIFICATION_VALUES[1],
  OFF_SCOPE: OUT_OF_SESSION_CLASSIFICATION_VALUES[2],
} as const;

export const ONBOARDING_TURN_STATUS_VALUES = [
  "continue",
  "complete",
] as const;

export const ONBOARDING_TURN_STATUS = {
  CONTINUE: ONBOARDING_TURN_STATUS_VALUES[0],
  COMPLETE: ONBOARDING_TURN_STATUS_VALUES[1],
} as const;

export const LEARNING_RESPONSE_STATUS_VALUES = [
  "completed",
  "in_progress",
  "not_started",
] as const;

export const LEARNING_RESPONSE_STATUS = {
  COMPLETED: LEARNING_RESPONSE_STATUS_VALUES[0],
  IN_PROGRESS: LEARNING_RESPONSE_STATUS_VALUES[1],
  NOT_STARTED: LEARNING_RESPONSE_STATUS_VALUES[2],
} as const;

export const LEARNING_PATTERN_SCOPE_VALUES = ["global", "subject"] as const;

export const PATTERN_CONFIDENCE_LABEL_VALUES = [
  "early",
  "emerging",
  "well_supported",
] as const;

export const PATTERN_CONFIDENCE_LABEL = {
  EARLY: PATTERN_CONFIDENCE_LABEL_VALUES[0],
  EMERGING: PATTERN_CONFIDENCE_LABEL_VALUES[1],
  WELL_SUPPORTED: PATTERN_CONFIDENCE_LABEL_VALUES[2],
} as const;

export const EXPLANATION_APPROACH_TYPE_VALUES = [
  "direct_conceptual",
  "interest_domain_analogy",
  "outside_domain_analogy",
  "historical_story",
  "visual_spatial",
  "step_by_step",
  "real_world_application",
  "contrast_explanation",
] as const;

export const CONCEPT_ENTRY_POINT_PREFERENCE_VALUES = [
  "big_picture_first",
  "parts_first",
  "mixed",
] as const;

export const ABSTRACTION_TOLERANCE_VALUES = [
  "example_first",
  "abstract_friendly",
  "mixed",
] as const;

export const CHALLENGE_RESPONSE_PATTERN_VALUES = [
  "leans_in",
  "threshold_based",
  "avoidant",
] as const;

export const PROCESSING_PREFERENCE_VALUES = [
  "fast_broad",
  "slow_deep",
  "mixed",
] as const;

export const SOCIAL_LEARNING_ORIENTATION_VALUES = [
  "social",
  "independent",
  "mixed",
] as const;

export const MEMORY_APPROACH_VALUES = [
  "memorization_oriented",
  "understanding_oriented",
  "mixed",
] as const;

export const RELATIONSHIP_WITH_WRONG_VALUES = [
  "safe",
  "guarded",
  "mixed",
] as const;

export const RESPONSE_WHEN_WRONG_VALUES = [
  "engaged",
  "guarded",
  "mixed",
] as const;

export const MISCONCEPTION_STATUS_VALUES = [
  "single_occurrence",
  "recurring",
  "persistent",
] as const;

export const ENGAGEMENT_TREND_DIRECTION_VALUES = [
  "upward",
  "stable",
  "declining",
] as const;

export const COGNITIVE_PATTERN_STYLE_VALUES = [
  "examples",
  "analytical",
  "relational",
  "divergent",
  "mixed",
] as const;

export const APPLICATION_STRENGTH_VALUES = [
  "stronger_than_recall",
  "balanced",
  "weaker_than_recall",
] as const;

export const PRIMARY_MOTIVATIONAL_STYLE_VALUES = [
  "competition",
  "collaboration",
  "future_oriented",
  "present_oriented",
  "autonomy",
  "direction",
  "mixed",
] as const;

export const CONFIDENCE_GAP_TREND_VALUES = [
  "narrowing",
  "stable",
  "widening",
] as const;

export const LEARNING_MEMORY_CLASS_VALUES = [
  "observation",
  "playbook",
] as const;

export const LEARNING_PLAYBOOK_BEHAVIOR_WEIGHT_VALUES = [
  "supplementary",
  "favored",
  "primary",
] as const;

export const CLASSROOM_STATUS_VALUES = ["active"] as const;
export const CLASSROOM_INVITE_STATUS_VALUES = [
  "pending",
  "accepted",
  "rejected",
  "cancelled",
] as const;
export const CLASSROOM_ONBOARDING_STATUS_VALUES = [
  "interest_profile_pending",
  "completed",
] as const;
export const COURSE_STATUS_VALUES = ["active"] as const;
export const LEARNING_TOPIC_STATUS_VALUES = [
  "draft",
  "active",
  "paused",
  "archived",
] as const;
export const LEARNING_TOPIC_OPENING_PREFERENCE_VALUES = ["auto"] as const;
export const MATERIAL_PIPELINE_STATUS_VALUES = [
  "pending",
  "processing",
  "completed",
  "failed",
] as const;
export const MATERIAL_UPLOAD_ATTEMPT_STATUS_VALUES = [
  "queued",
  "processing",
  "succeeded",
  "failed",
] as const;
export const MATERIAL_UPLOAD_ATTEMPT_STAGE_VALUES = [
  "upload",
  "extraction",
  "review",
  "analysis",
  "indexing",
  "pack_build",
] as const;
export const MATERIAL_UPLOAD_ATTEMPT_REVIEW_ALIAS =
  MATERIAL_UPLOAD_ATTEMPT_STAGE_VALUES[2];
export const STUDENT_INTEREST_VISIBILITY_VALUES = [
  "private_to_student_and_agent",
] as const;
export const LEARNING_SESSION_STATUS_VALUES = [
  "active",
  "completed",
  "abandoned",
] as const;
export const LEARNING_SESSION_TYPE_VALUES = [
  "interest_onboarding",
  "tutoring",
] as const;
export const LEARNING_EVIDENCE_SOURCE_TYPE_VALUES = [
  "material",
  "report",
  "interaction",
  "pattern",
] as const;
export const REPORT_VISIBILITY_VALUES = [
  "teacher_only",
  "teacher_and_guardian",
  "teacher_student_shared",
] as const;
export const EXPERT_FRAMEWORK_STATUS_VALUES = [
  "draft",
  "active",
  "inactive",
  "archived",
] as const;
export const EXPERT_FRAMEWORK_SEED_SOURCE_VALUES = [
  "expert_authored",
] as const;
export const EXPERT_REVIEW_CASE_STATUS_VALUES = [
  "open",
  "crystallized",
  "dismissed",
] as const;
export const EXPERT_REVIEW_RELEVANCE_SCOPE_VALUES = [
  "general",
  "framework_specific",
] as const;
export const LEARNING_INTERVENTION_TYPE_VALUES = [
  "reteach",
  "check_in",
  "practice",
  "family_follow_up",
] as const;
export const LEARNING_INTERVENTION_STATUS_VALUES = [
  "planned",
  "in_progress",
  "completed",
  "dismissed",
] as const;
export const LEARNING_PRIORITY_VALUES = ["low", "medium", "high"] as const;
export const EXPERT_CRYSTALLIZATION_STATUS_VALUES = [
  "draft",
  "approved",
  "archived",
] as const;
export const EXPERT_CONFLICT_STATUS_VALUES = [
  "open",
  "resolved",
  "ignored",
] as const;
export const TEACHING_MEDIA_SOURCE_TYPE_VALUES = [
  "teacher_curated",
] as const;
export const TEACHING_MEDIA_STATUS_VALUES = [
  "draft",
  "approved",
] as const;
export const MATERIAL_BATCH_GATE_STATUS_VALUES = [
  "idle",
  "processing",
  "failed",
  "succeeded",
] as const;

export const MATERIAL_BATCH_GATE_STATUS = {
  IDLE: MATERIAL_BATCH_GATE_STATUS_VALUES[0],
  PROCESSING: MATERIAL_BATCH_GATE_STATUS_VALUES[1],
  FAILED: MATERIAL_BATCH_GATE_STATUS_VALUES[2],
  SUCCEEDED: MATERIAL_BATCH_GATE_STATUS_VALUES[3],
} as const;

export const STUDENT_TUTORING_ACCESS_REASON_VALUES = [
  "topic_unavailable",
  "interest_profile_required",
] as const;

export const STUDENT_TUTORING_ACCESS_REASON = {
  TOPIC_UNAVAILABLE: STUDENT_TUTORING_ACCESS_REASON_VALUES[0],
  INTEREST_PROFILE_REQUIRED: STUDENT_TUTORING_ACCESS_REASON_VALUES[1],
} as const;

export const TUTORING_COMPLETION_REASON_VALUES = [
  "student_finished",
  "tutor_finished",
] as const;

export const TUTORING_COMPLETION_REASON = {
  STUDENT_FINISHED: TUTORING_COMPLETION_REASON_VALUES[0],
  TUTOR_FINISHED: TUTORING_COMPLETION_REASON_VALUES[1],
} as const;

export const LEARNING_STATUS = {
  classroomActive: CLASSROOM_STATUS_VALUES[0],
  invitePending: CLASSROOM_INVITE_STATUS_VALUES[0],
  inviteAccepted: CLASSROOM_INVITE_STATUS_VALUES[1],
  inviteRejected: CLASSROOM_INVITE_STATUS_VALUES[2],
  inviteCancelled: CLASSROOM_INVITE_STATUS_VALUES[3],
  onboardingInterestProfilePending: CLASSROOM_ONBOARDING_STATUS_VALUES[0],
  onboardingCompleted: CLASSROOM_ONBOARDING_STATUS_VALUES[1],
  courseActive: COURSE_STATUS_VALUES[0],
  topicDraft: LEARNING_TOPIC_STATUS_VALUES[0],
  topicActive: LEARNING_TOPIC_STATUS_VALUES[1],
  topicPaused: LEARNING_TOPIC_STATUS_VALUES[2],
  topicArchived: LEARNING_TOPIC_STATUS_VALUES[3],
  topicOpeningAuto: LEARNING_TOPIC_OPENING_PREFERENCE_VALUES[0],
  materialPending: MATERIAL_PIPELINE_STATUS_VALUES[0],
  materialProcessing: MATERIAL_PIPELINE_STATUS_VALUES[1],
  materialCompleted: MATERIAL_PIPELINE_STATUS_VALUES[2],
  materialFailed: MATERIAL_PIPELINE_STATUS_VALUES[3],
  uploadQueued: MATERIAL_UPLOAD_ATTEMPT_STATUS_VALUES[0],
  uploadProcessing: MATERIAL_UPLOAD_ATTEMPT_STATUS_VALUES[1],
  uploadSucceeded: MATERIAL_UPLOAD_ATTEMPT_STATUS_VALUES[2],
  uploadFailed: MATERIAL_UPLOAD_ATTEMPT_STATUS_VALUES[3],
  uploadStageUpload: MATERIAL_UPLOAD_ATTEMPT_STAGE_VALUES[0],
  uploadStageExtraction: MATERIAL_UPLOAD_ATTEMPT_STAGE_VALUES[1],
  uploadStageAnalysis: MATERIAL_UPLOAD_ATTEMPT_STAGE_VALUES[3],
  uploadStageIndexing: MATERIAL_UPLOAD_ATTEMPT_STAGE_VALUES[4],
  uploadStagePackBuild: MATERIAL_UPLOAD_ATTEMPT_STAGE_VALUES[5],
  studentInterestPrivateToStudentAndAgent: STUDENT_INTEREST_VISIBILITY_VALUES[0],
  sessionActive: LEARNING_SESSION_STATUS_VALUES[0],
  sessionCompleted: LEARNING_SESSION_STATUS_VALUES[1],
  sessionAbandoned: LEARNING_SESSION_STATUS_VALUES[2],
  sessionTypeInterestOnboarding: LEARNING_SESSION_TYPE_VALUES[0],
  sessionTypeTutoring: LEARNING_SESSION_TYPE_VALUES[1],
  reportTeacherOnly: REPORT_VISIBILITY_VALUES[0],
  frameworkDraft: EXPERT_FRAMEWORK_STATUS_VALUES[0],
  frameworkActive: EXPERT_FRAMEWORK_STATUS_VALUES[1],
  frameworkInactive: EXPERT_FRAMEWORK_STATUS_VALUES[2],
  frameworkArchived: EXPERT_FRAMEWORK_STATUS_VALUES[3],
  frameworkSeedExpertAuthored: EXPERT_FRAMEWORK_SEED_SOURCE_VALUES[0],
  reviewCaseOpen: EXPERT_REVIEW_CASE_STATUS_VALUES[0],
  reviewCaseCrystallized: EXPERT_REVIEW_CASE_STATUS_VALUES[1],
  reviewCaseDismissed: EXPERT_REVIEW_CASE_STATUS_VALUES[2],
  relevanceGeneral: EXPERT_REVIEW_RELEVANCE_SCOPE_VALUES[0],
  relevanceFrameworkSpecific: EXPERT_REVIEW_RELEVANCE_SCOPE_VALUES[1],
  interventionReteach: LEARNING_INTERVENTION_TYPE_VALUES[0],
  interventionCheckIn: LEARNING_INTERVENTION_TYPE_VALUES[1],
  interventionPractice: LEARNING_INTERVENTION_TYPE_VALUES[2],
  interventionFamilyFollowUp: LEARNING_INTERVENTION_TYPE_VALUES[3],
  interventionPlanned: LEARNING_INTERVENTION_STATUS_VALUES[0],
  interventionInProgress: LEARNING_INTERVENTION_STATUS_VALUES[1],
  interventionCompleted: LEARNING_INTERVENTION_STATUS_VALUES[2],
  interventionDismissed: LEARNING_INTERVENTION_STATUS_VALUES[3],
  priorityLow: LEARNING_PRIORITY_VALUES[0],
  priorityMedium: LEARNING_PRIORITY_VALUES[1],
  priorityHigh: LEARNING_PRIORITY_VALUES[2],
  crystallizationDraft: EXPERT_CRYSTALLIZATION_STATUS_VALUES[0],
  crystallizationApproved: EXPERT_CRYSTALLIZATION_STATUS_VALUES[1],
  crystallizationArchived: EXPERT_CRYSTALLIZATION_STATUS_VALUES[2],
  conflictOpen: EXPERT_CONFLICT_STATUS_VALUES[0],
  conflictResolved: EXPERT_CONFLICT_STATUS_VALUES[1],
  conflictIgnored: EXPERT_CONFLICT_STATUS_VALUES[2],
  teachingMediaTeacherCurated: TEACHING_MEDIA_SOURCE_TYPE_VALUES[0],
  teachingMediaDraft: TEACHING_MEDIA_STATUS_VALUES[0],
  teachingMediaApproved: TEACHING_MEDIA_STATUS_VALUES[1],
} as const;

export const LEARNING_NUMERIC_DEFAULTS = {
  zero: 0,
  initialVersion: 1,
  defaultMediaBindingPriority: 50,
} as const;

export const NORMALIZED_SCORE_RANGE = {
  min: 0,
  max: 1,
  defaultValue: 0,
} as const;

export const PERCENTAGE_RANGE = {
  min: 0,
  max: 100,
  defaultValue: 0,
} as const;

export const TEN_POINT_SCORE_RANGE = {
  min: 1,
  max: 10,
} as const;

export const LEARNING_DEFAULTS = {
  chatTitle: "New Chat",
  sessionLocale: LEARNING_DEFAULT_LOCALE,
} as const;

export const LEARNING_SUBJECT_DEFAULTS = {
  key: "general",
  label: "General",
} as const;

export const LEARNING_LIMITS = {
  assessmentPreviewGroundingBudgetTokens: 1_000,
  assessmentPreviewGroundingMaxUnits: 6,
  attentionGapThreshold: 2,
  defaultLearningOutcomeMasteryThreshold: 70,
  heuristicTopicOverlapMinimum: 1,
  heuristicStrongTopicOverlapMinimum: 3,
  interestProfileRefreshDays: 30,
  lowConfidenceScoreThreshold: 4,
  normalizedOutcomeMaxOutputTokens: 1_400,
  onboardingEvaluationMaxOutputTokens: 1_100,
  onboardingStreamMaxOutputTokens: 280,
  outOfSessionGroundingBudgetTokens: 900,
  outOfSessionGroundingMaxUnits: 6,
  outOfSessionTokenMinLength: 4,
  reportingEvidenceMaxOutputTokens: 1_400,
  reportingMaxOutputTokens: 1_600,
  reportingTopItemsLimit: 5,
  strongMasteryPercent: 80,
  teacherChatTitlePreviewLength: 72,
  topicGroundingPackMaxOutputTokens: 4_800,
  tutoringAttentionMasteryPercent: 60,
} as const;
