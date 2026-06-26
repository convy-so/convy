export class StudentSessionStateConflictError extends Error {
  constructor(message = "Student session state update conflict.") {
    super(message);
    this.name = "StudentSessionStateConflictError";
  }
}

export function isStudentSessionStateConflictError(
  error: unknown,
): error is StudentSessionStateConflictError {
  return error instanceof StudentSessionStateConflictError;
}
