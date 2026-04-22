import { teacherOnboardingSummarySchema, teacherProgressReportSchema, type LearningSessionState, type TeacherProgressReport } from "@/lib/learning/types";
import { generateStructuredOutput } from "@/lib/ai/runtime";
import { buildReportingPrompt } from "@/lib/learning/prompting";

export async function generateTeacherOnboardingSummary(params: {
  studentName: string;
  profile: Record<string, unknown>;
}) {
  return await generateStructuredOutput({
    schema: teacherOnboardingSummarySchema,
    prompt: `Write a concise teacher-facing onboarding summary.

Student: ${params.studentName}
Profile:
${JSON.stringify(params.profile)}

Focus on what the tutor learned about motivation, confidence, and likely teaching entry points.`,
  });
}

export async function generateTeacherProgressReport(params: {
  studentName: string;
  topicTitle: string;
  state: LearningSessionState;
  transcript: Array<{
    role: string;
    content: string;
    metadata?: Record<string, unknown> | null;
  }>;
  previousReport?: TeacherProgressReport | null;
  studentModel?: Record<string, unknown> | null;
}) {
  return await generateStructuredOutput({
    schema: teacherProgressReportSchema,
    prompt: buildReportingPrompt({
      studentName: params.studentName,
      topicTitle: params.topicTitle,
      sessionState: params.state,
      studentModel: params.studentModel ?? null,
      transcript: params.transcript,
      previousReport: params.previousReport ?? null,
    }),
  });
}

export function buildClassroomTopicReportSummary(
  reports: Array<{
    masteryPercent: number;
    report: TeacherProgressReport;
  }>,
) {
  if (reports.length === 0) {
    return {
      reportCount: 0,
      averageMasteryPercent: 0,
      riskFlagCount: 0,
      identifiedGapCount: 0,
    };
  }

  return {
    reportCount: reports.length,
    averageMasteryPercent: Math.round(
      reports.reduce((sum, report) => sum + report.masteryPercent, 0) / reports.length,
    ),
    riskFlagCount: reports.reduce(
      (sum, report) => sum + (report.report.riskFlags?.length ?? 0),
      0,
    ),
    identifiedGapCount: reports.reduce(
      (sum, report) => sum + (report.report.identifiedGaps?.length ?? 0),
      0,
    ),
  };
}
