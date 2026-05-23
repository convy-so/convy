export function buildTeacherOnboardingSummaryPrompt(input: {
  studentName: string;
  profile: Record<string, unknown>;
}) {
  return `Write a concise teacher-facing onboarding summary.

Student: ${input.studentName}
Profile:
${JSON.stringify(input.profile)}

Focus on what the tutor learned about motivation, confidence, and likely teaching entry points.`;
}

export function buildReportingPrompt(input: {
  studentName: string;
  topicTitle: string;
  sessionState: unknown;
  studentModel: Record<string, unknown> | null;
  transcript: Array<{
    role: string;
    content: string;
    metadata?: Record<string, unknown> | null;
  }>;
  previousReport: unknown;
}) {
  return `Generate a teacher-facing progress report for one tutoring session.

Student: ${input.studentName}
Topic: ${input.topicTitle}
Session state:
${JSON.stringify(input.sessionState)}

Student model:
${JSON.stringify(input.studentModel)}

Previous report:
${JSON.stringify(input.previousReport)}

Transcript:
${input.transcript
    .map((item) => `${item.role}: ${item.content}`)
    .join("\n\n")}

Rules:
- Ground claims in the transcript and session state.
- Be explicit about uncertainty when evidence is limited.
- Focus on understanding, misconceptions, confidence, and next instructional moves.
- If the session state contains framework phase, level, or closure signals, reflect them in frameworkPhase, frameworkLevel, and frameworkProgressSummary.`;
}
