import { z } from "zod";

import { teacherOnboardingSummarySchema, teacherProgressReportSchema, type LearningSessionState, type TeacherProgressReport } from "@/lib/learning/types";
import { generateStructuredOutput } from "@/lib/ai/runtime";
import { buildReportingPrompt } from "@/lib/learning/prompting";
import { buildTeacherOnboardingSummaryPrompt } from "@/lib/learning/prompts/reporting";
import { buildPromptFrame, renderPreviousReport, renderReportState, renderTaggedSection, renderTranscript } from "@/lib/learning/prompt-serializers";

const reportingEvidenceSchema = z.object({
  studentSummary: z.string(),
  pedagogicalSummary: z.string().default(""),
  conceptProgress: z
    .array(
      z.object({
        conceptKey: z.string(),
        title: z.string(),
        masteryLevel: z.enum(["surface", "applied", "generative"]),
        confidence: z.number().min(0).max(1).default(0),
        misconceptions: z.array(z.string()).default([]),
        evidence: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  motivationalHooksUsed: z.array(z.string()).default([]),
  productiveStruggleNotes: z.array(z.string()).default([]),
  longitudinalSignals: z.array(z.string()).default([]),
  recommendedTeacherActions: z.array(z.string()).default([]),
  homeworkAssigned: z.array(z.string()).default([]),
  studentConfidenceScore: z.number().int().min(1).max(10).nullable().default(null),
  identifiedGaps: z.array(z.string()).default([]),
  riskFlags: z.array(z.string()).default([]),
  comparisonToPreviousSession: z.string().default(""),
  transferReadiness: z.enum(["not_yet", "emerging", "ready"]).default("not_yet"),
  originalityWithinConstraint: z.enum(["low", "emerging", "strong"]).default("low"),
  evidenceNotes: z.array(z.string()).default([]),
});

function buildReportingEvidenceExtractionPrompt(params: {
  studentName: string;
  topicTitle: string;
  state: LearningSessionState;
  teachingPlaybook?: Record<string, unknown> | null;
  transcript: Array<{
    role: string;
    content: string;
    metadata?: Record<string, unknown> | null;
  }>;
  previousReport?: TeacherProgressReport | null;
}) {
  return [
    buildPromptFrame({
      role: "Extract session evidence for a teacher progress report.",
      goal: `Summarize grounded evidence about ${params.studentName}'s progress in ${params.topicTitle}.`,
      constraints: [
        "Use only the transcript, session state, and previous report context.",
        "Capture evidence, not polished report prose.",
        "Use the teaching playbook only as low-priority personalization context.",
      ],
      outputContract: ["Return only the structured evidence extraction object."],
    }),
    renderTaggedSection("student", params.studentName),
    renderTaggedSection("topic", params.topicTitle),
    renderTaggedSection("session_state", renderReportState(params.state, params.teachingPlaybook)),
    renderTaggedSection("previous_report", renderPreviousReport(params.previousReport)),
    renderTaggedSection("transcript", renderTranscript(params.transcript)),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function generateTeacherOnboardingSummary(params: {
  studentName: string;
  profile: Record<string, unknown>;
}) {
  return await generateStructuredOutput({
    schema: teacherOnboardingSummarySchema,
    prompt: buildTeacherOnboardingSummaryPrompt(params),
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
  teachingPlaybook?: Record<string, unknown> | null;
}) {
  const extractedEvidence = await generateStructuredOutput({
    schema: reportingEvidenceSchema,
    prompt: buildReportingEvidenceExtractionPrompt({
      studentName: params.studentName,
      topicTitle: params.topicTitle,
      state: params.state,
      teachingPlaybook: params.teachingPlaybook ?? null,
      transcript: params.transcript,
      previousReport: params.previousReport ?? null,
    }),
    maxOutputTokens: 1_400,
  });

  return await generateStructuredOutput({
    schema: teacherProgressReportSchema,
    prompt: buildReportingPrompt({
      studentName: params.studentName,
      topicTitle: params.topicTitle,
      sessionState: params.state,
      teachingPlaybook: params.teachingPlaybook ?? null,
      transcript: [
        ...params.transcript,
        {
          role: "system_evidence",
          content: [
            `Student summary: ${extractedEvidence.studentSummary}`,
            `Pedagogical summary: ${extractedEvidence.pedagogicalSummary}`,
            `Concept progress: ${extractedEvidence.conceptProgress
              .map((item) => `${item.title}=${item.masteryLevel}`)
              .join("; ") || "none"}`,
            `Gaps: ${extractedEvidence.identifiedGaps.join("; ") || "none"}`,
            `Risk flags: ${extractedEvidence.riskFlags.join("; ") || "none"}`,
            `Recommended teacher actions: ${extractedEvidence.recommendedTeacherActions.join("; ") || "none"}`,
            `Evidence notes: ${extractedEvidence.evidenceNotes.join("; ") || "none"}`,
          ].join("\n"),
        },
      ],
      previousReport: params.previousReport ?? null,
    }),
    maxOutputTokens: 1_600,
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
