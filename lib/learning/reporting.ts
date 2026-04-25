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
  sessionId?: string | null;
  userId?: string | null;
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
    student: {
      id: string;
    };
    masteryPercent: number;
    updatedAt?: string | Date | null;
    report: TeacherProgressReport;
  }>,
) {
  const latestByStudent = Array.from(
    new Map(reports.map((report) => [report.student.id, report])).values(),
  );

  if (reports.length === 0) {
    return {
      reportCount: 0,
      studentCount: 0,
      averageMasteryPercent: null,
      averageConfidenceScore: null,
      averageSessionDurationMinutes: null,
      studentsNeedingAttention: 0,
      studentsStrongMastery: 0,
      studentsDeveloping: 0,
      studentsWithLowConfidence: 0,
      latestReportAt: null,
      commonGaps: [] as string[],
      commonRiskFlags: [] as string[],
      recommendedTeacherFocus: [] as string[],
    };
  }

  const confidenceScores = latestByStudent
    .map((report) => report.report.studentConfidenceScore)
    .filter((value): value is number => typeof value === "number");

  const collectTopItems = (
    items: string[],
    limit = 5,
  ) =>
    Array.from(
      items.reduce((counts, item) => {
        counts.set(item, (counts.get(item) ?? 0) + 1);
        return counts;
      }, new Map<string, number>()),
    )
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, limit)
      .map(([item]) => item);

  const studentsWithLowConfidence = latestByStudent.filter(
    (report) =>
      typeof report.report.studentConfidenceScore === "number" &&
      report.report.studentConfidenceScore <= 4,
  ).length;
  const studentsNeedingAttention = latestByStudent.filter((report) => {
    const confidence = report.report.studentConfidenceScore;
    return (
      report.masteryPercent < 60 ||
      (report.report.riskFlags?.length ?? 0) > 0 ||
      (report.report.identifiedGaps?.length ?? 0) >= 2 ||
      (typeof confidence === "number" && confidence <= 4)
    );
  }).length;
  const studentsStrongMastery = latestByStudent.filter(
    (report) =>
      report.masteryPercent >= 80 &&
      (report.report.riskFlags?.length ?? 0) === 0,
  ).length;

  return {
    reportCount: reports.length,
    studentCount: latestByStudent.length,
    averageMasteryPercent: Math.round(
      latestByStudent.reduce((sum, report) => sum + report.masteryPercent, 0) /
        latestByStudent.length,
    ),
    averageConfidenceScore:
      confidenceScores.length > 0
        ? Number(
            (
              confidenceScores.reduce((sum, score) => sum + score, 0) /
              confidenceScores.length
            ).toFixed(1),
          )
        : null,
    averageSessionDurationMinutes: null,
    studentsNeedingAttention,
    studentsStrongMastery,
    studentsDeveloping:
      latestByStudent.length - studentsStrongMastery - studentsNeedingAttention,
    studentsWithLowConfidence,
    latestReportAt:
      reports[0]?.updatedAt instanceof Date
        ? reports[0].updatedAt.toISOString()
        : typeof reports[0]?.updatedAt === "string"
          ? reports[0].updatedAt
          : null,
    commonGaps: collectTopItems(
      latestByStudent.flatMap((report) => report.report.identifiedGaps ?? []),
    ),
    commonRiskFlags: collectTopItems(
      latestByStudent.flatMap((report) => report.report.riskFlags ?? []),
    ),
    recommendedTeacherFocus: collectTopItems(
      latestByStudent.flatMap(
        (report) => report.report.recommendedTeacherActions ?? [],
      ),
    ),
  };
}
