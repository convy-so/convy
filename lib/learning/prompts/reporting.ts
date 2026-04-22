import type { LearningSessionState } from "@/lib/learning/types";

export function buildReportingPrompt(params: {
  studentName: string;
  topicTitle: string;
  sessionState: LearningSessionState;
  studentModel: Record<string, unknown> | null;
  transcript: Array<{ role: string; content: string; metadata?: Record<string, unknown> | null }>;
  previousReport?: Record<string, unknown> | null;
}) {
  return `Write a teacher-facing tutoring report.

Student: ${params.studentName}
Topic: ${params.topicTitle}

Session state:
${JSON.stringify(params.sessionState)}

Student model:
${JSON.stringify(params.studentModel)}

Transcript:
${JSON.stringify(params.transcript)}

Previous report:
${JSON.stringify(params.previousReport ?? null)}

Focus on:
- what the student genuinely understood
- where understanding remained shallow or unstable
- what motivational hooks and struggle calibration mattered
- whether expert review is recommended`;
}
