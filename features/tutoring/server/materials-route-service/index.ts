export {
  buildUploadAttemptFailure,
  inferMaterialKind,
  isMaterialAnalysisFailed,
  normalizeDetectedLearningMaterialMime,
  normalizeLearningMaterialUploadAttemptStage,
  type LearningMaterialUploadAttemptStage,
  type LearningMaterialUploadAttemptStatus,
} from "./material-upload-attempt-state";
export {
  getActiveBatchAttempts,
  getLatestMaterialBatchGateState,
  getTopicActivationMaterialGate,
  type MaterialBatchGateState,
} from "./material-batch-gates";
export {
  processLearningMaterialUploadAttempt,
} from "./material-upload-attempt-processor";
export { indexMaterialAndSyncBoundary } from "./material-indexing";
export {
  createLearningMaterialUploadAttempt,
  updateLearningMaterialUploadAttempt,
} from "./material-upload-attempt-store";
export {
  markLearningMaterialBatchFinalizerFailed,
  processLearningMaterialBatchFinalizer,
} from "./material-batch-finalizer";
export { getTeacherTopicAccess as getTeacherTopicOrNull } from "@/features/tutoring/server/access";
