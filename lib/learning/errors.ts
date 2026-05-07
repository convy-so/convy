export class LearningStateConflictError extends Error {
  constructor(message = "Learning session state update conflict.") {
    super(message);
    this.name = "LearningStateConflictError";
  }
}

export function isLearningStateConflictError(error: unknown): error is LearningStateConflictError {
  return error instanceof LearningStateConflictError;
}
