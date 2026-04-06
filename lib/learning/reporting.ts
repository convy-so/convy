import { generateText, Output } from "ai";
import { z } from "zod";

import { analysisModel } from "@/lib/ai";
import type { LearningSessionState, TeacherProgressReport } from "@/lib/learning/types";
import { teacherOnboardingSummarySchema, teacherProgressReportSchema } from "@/lib/learning/types";

const reportNarrativeSchema = z.object({
  studentSummary: z.string(),
  comparisonToPreviousSession: z.string(),
  recommendedTeacherActions: z.array(z.string()).default([]),
  riskFlags: z.array(z.string()).default([]),
});

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundMetric(value: number | null) {
  if (value == null || Number.isNaN(value)) return null;
  return Math.round(value * 10) / 10;
}

function topEntries(items: string[], limit = 3) {
  const counts = new Map<string, number>();

  for (const item of items) {
    const normalized = item.trim();
    if (!normalized) continue;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([value]) => value);
}

export function buildClassroomTopicReportSummary(
  reports: Array<{
    masteryPercent: number;
    updatedAt: Date | string;
    student?: { id: string };
    report: TeacherProgressReport;
  }>,
) {
  const latestReports = reports.reduce<typeof reports>((accumulator, report) => {
    const studentId = report.student?.id;
    if (!studentId) {
      accumulator.push(report);
      return accumulator;
    }

    if (accumulator.some((candidate) => candidate.student?.id === studentId)) {
      return accumulator;
    }

    accumulator.push(report);
    return accumulator;
  }, []);

  const masteryValues = latestReports.map((report) => report.masteryPercent);
  const confidenceValues = latestReports.flatMap((report) =>
    report.report.studentConfidenceScore == null
      ? []
      : [report.report.studentConfidenceScore],
  );
  const durationValues = latestReports.map(
    (report) => report.report.sessionDurationMinutes,
  );
  const lowConfidenceCount = latestReports.filter(
    (report) =>
      report.report.studentConfidenceScore != null &&
      report.report.studentConfidenceScore <= 4,
  ).length;
  const studentsNeedingAttention = latestReports.filter((report) => {
    const confidence = report.report.studentConfidenceScore;
    return (
      report.masteryPercent < 70 ||
      (confidence != null && confidence <= 4) ||
      (report.report.riskFlags?.length ?? 0) > 0 ||
      (report.report.identifiedGaps?.length ?? 0) >= 2
    );
  }).length;

  const commonGaps = topEntries(
    latestReports.flatMap((report) => report.report.identifiedGaps ?? []),
  );
  const commonRiskFlags = topEntries(
    latestReports.flatMap((report) => report.report.riskFlags ?? []),
  );

  const recommendedTeacherFocus = [
    ...commonGaps
      .slice(0, 2)
      .map((gap) => `Reteach or recheck the misconception around ${gap}.`),
    ...commonRiskFlags
      .slice(0, 1)
      .map((flag) => `Review students showing this concern: ${flag}.`),
    ...(lowConfidenceCount > 0
      ? [
          `Plan a quick confidence check for ${lowConfidenceCount} student${
            lowConfidenceCount === 1 ? "" : "s"
          } who may understand less securely than their answers suggest.`,
        ]
      : []),
  ].slice(0, 4);

  const latestReportAt =
    reports.length === 0
      ? null
      : reports
          .map((report) => new Date(report.updatedAt).getTime())
          .sort((left, right) => right - left)[0];

  return {
    reportCount: reports.length,
    studentCount: latestReports.length,
    averageMasteryPercent: latestReports.length
      ? roundMetric(average(masteryValues))
      : null,
    averageConfidenceScore: confidenceValues.length
      ? roundMetric(average(confidenceValues))
      : null,
    averageSessionDurationMinutes: durationValues.length
      ? roundMetric(average(durationValues))
      : null,
    studentsNeedingAttention,
    studentsStrongMastery: latestReports.filter(
      (report) =>
        report.masteryPercent >= 85 && (report.report.riskFlags?.length ?? 0) === 0,
    ).length,
    studentsDeveloping: latestReports.filter(
      (report) => report.masteryPercent >= 70 && report.masteryPercent < 85,
    ).length,
    studentsWithLowConfidence: lowConfidenceCount,
    latestReportAt:
      latestReportAt == null ? null : new Date(latestReportAt).toISOString(),
    commonGaps,
    commonRiskFlags,
    recommendedTeacherFocus,
  };
}

export async function generateTeacherOnboardingSummary(params: {
  studentName: string;
  profile: {
    primaryInterests: Array<{ label: string; details: string }>;
    aspirations: string[];
    curiosityAreas: string[];
    motivationalStyle: string[];
    learningRelationship: string;
    contextTags: string[];
  };
}) {
  const { output } = await generateText({
    model: analysisModel,
    output: Output.object({
      schema: teacherOnboardingSummarySchema,
    }),
    prompt: `Write a single concise teacher-facing paragraph about this student.

Student: ${params.studentName}
Profile: ${JSON.stringify(params.profile)}

Rules:
- keep it human and practical
- mention only information that helps the teacher teach well
- do not expose private details beyond what supports learning
- mention likely framing/motivation cues
- mention their relationship with learning when relevant`,
  });

  return output;
}

export async function generateTeacherProgressReport(params: {
  studentName: string;
  topicTitle: string;
  state: LearningSessionState;
  interactions: Array<{
    role: string;
    interactionType: string;
    content: string;
    metadata?: Record<string, unknown> | null;
  }>;
  sessionStartedAt: Date;
  sessionCompletedAt?: Date | null;
  previousReport?: TeacherProgressReport | null;
}) {
  const sessionDurationMinutes = Math.max(
    0,
    Math.round(
      ((params.sessionCompletedAt ?? new Date()).getTime() -
        params.sessionStartedAt.getTime()) /
        60000,
    ),
  );

  const performanceByConcept = params.state.conceptsToCover.map((concept) => {
    const conceptState = params.state.conceptStates[concept.key];
    const score =
      conceptState?.masteryScore ??
      Math.round(
        average(
          params.state.quizItems
            .filter((item) => item.conceptKey === concept.key)
            .map((item) => item.score ?? 0),
        ),
      );

    const confidenceLevel = conceptState?.confidence ?? "low";
    const status =
      score >= 80
        ? "mastered"
        : score >= 60
          ? "developing"
          : "needs_support";

    return {
      concept: concept.title,
      score,
      confidenceLevel,
      explanationAttempts: conceptState?.explanationAttempts ?? 0,
      status,
    } as const;
  });

  const questionsAskedByStudent = params.interactions
    .filter((interaction) => {
      if (interaction.role !== "user") return false;
      const questionType = interaction.metadata?.questionType;
      return typeof questionType === "string" && questionType !== "phase_response";
    })
    .map((interaction) => ({
      content: interaction.content,
      type:
        (interaction.metadata?.questionType as
          | "phase_response"
          | "clarification"
          | "curiosity"
          | "off_topic") ?? "phase_response",
    }));

  const quizResults = params.state.quizItems
    .filter((item) => item.studentAnswer !== null && item.correct !== null)
    .map((item) => ({
      concept:
        params.state.conceptsToCover.find((concept) => concept.key === item.conceptKey)
          ?.title ?? item.conceptKey,
      prompt: item.prompt,
      studentAnswer: item.studentAnswer ?? "",
      correct: item.correct ?? false,
      difficulty: item.difficulty,
      explanation: item.explanation,
    }));

  const currentAverage = average(performanceByConcept.map((item) => item.score));
  const previousAverage = average(
    params.previousReport?.performanceByConcept.map((item) => item.score) ?? [],
  );
  const comparisonTrend =
    params.previousReport == null
      ? "unknown"
      : currentAverage >= previousAverage + 8
        ? "improved"
        : currentAverage <= previousAverage - 8
          ? "regressed"
          : "steady";

  const evidence = [
    ...questionsAskedByStudent.slice(0, 4).map((question) => ({
      type: "question" as const,
      note: question.content,
    })),
    ...quizResults.slice(0, 4).map((result) => ({
      type: "quiz" as const,
      note: `${result.concept}: ${result.correct ? "correct" : "incorrect"} (${result.difficulty})`,
    })),
    ...(params.state.studentConfidenceScore
      ? [
          {
            type: "reflection" as const,
            note: `Student rated confidence ${params.state.studentConfidenceScore}/10.`,
          },
        ]
      : []),
    ...(params.state.homeworkStatus !== "not_applicable"
      ? [
          {
            type: "homework" as const,
            note: `Homework status: ${params.state.homeworkStatus}.`,
          },
        ]
      : []),
  ];

  const narrativeInput = {
    studentName: params.studentName,
    topicTitle: params.topicTitle,
    performanceByConcept,
    identifiedGaps: params.state.gapsIdentified,
    homeworkAssigned: params.state.personalizedHomework,
    studentConfidenceScore: params.state.studentConfidenceScore,
    momentOfUnderstanding: params.state.momentOfUnderstanding,
    previousReport: params.previousReport ?? null,
  };

  const { output: narrative } = await generateText({
    model: analysisModel,
    output: Output.object({
      schema: reportNarrativeSchema,
    }),
    prompt: `Generate a teacher-facing academic interpretation of this session.

Data:
${JSON.stringify(narrativeInput)}

Rules:
- keep studentSummary grounded in demonstrated learning, not personality speculation
- comparisonToPreviousSession must be specific
- recommendedTeacherActions should be practical and short
- riskFlags should be empty unless there is a real academic or engagement concern`,
  });

  return teacherProgressReportSchema.parse({
    studentName: params.studentName,
    topicTitle: params.topicTitle,
    studentSummary: narrative.studentSummary,
    conceptsCovered: params.state.conceptsToCover.map((concept) => concept.title),
    sessionDurationMinutes,
    sessionCompleted: params.state.reportReady,
    performanceByConcept,
    questionsAskedByStudent,
    quizResults,
    identifiedGaps: params.state.gapsIdentified,
    homeworkAssigned: params.state.personalizedHomework,
    homeworkStatus: params.state.homeworkStatus,
    studentConfidenceScore: params.state.studentConfidenceScore,
    momentOfUnderstanding: params.state.momentOfUnderstanding,
    comparisonToPreviousSession: narrative.comparisonToPreviousSession,
    comparisonTrend,
    recommendedTeacherActions: narrative.recommendedTeacherActions,
    evidence,
    riskFlags: narrative.riskFlags,
  });
}
