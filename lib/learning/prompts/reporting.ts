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
  teachingPlaybook: Record<string, unknown> | null;
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

Teaching playbook:
${JSON.stringify(input.teachingPlaybook)}

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
- Use the teaching playbook only as personalization context. Do not claim it as fresh evidence unless the transcript supports it.`;
}
