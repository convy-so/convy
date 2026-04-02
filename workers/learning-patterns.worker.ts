import { Worker, Job } from "bullmq";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { learningSessions, studentProgressReports } from "@/db/schema";
import {
  addLearningPatternObservations,
  isMem0Configured,
  listLearningPatternMemories,
} from "@/lib/learning/mem0";
import {
  analyzeOnboardingLearningPatterns,
  analyzeSessionLearningPatterns,
  buildConfidenceByDimension,
  confidenceToPercent,
  deriveSubjectInfo,
} from "@/lib/learning/patterns";
import {
  completeLearningPatternAnalysis,
  createLearningPatternAnalysis,
  failLearningPatternAnalysis,
  listLearningInteractions,
  listRecentOutOfSessionInteractions,
  listStudentLearningPatternProfiles,
  markLearningPatternAnalysisRunning,
  upsertStudentLearningPatternProfile,
} from "@/lib/learning/storage";
import type { LearningPatternAnalysisJobData } from "@/lib/queue";
import type { StudentLearningPatternProfile } from "@/lib/learning/pattern-types";
import { getRedisClient } from "@/lib/redis";
import { learningSessionStateSchema } from "@/lib/learning/types";

const jobDataSchema = z.object({
  sourceType: z.enum(["onboarding", "session"]),
  sourceId: z.string().min(1),
  organizationId: z.string().min(1),
  studentUserId: z.string().min(1),
  classroomStudentId: z.string().nullable().optional(),
  topicId: z.string().nullable().optional(),
  subjectKey: z.string().nullable().optional(),
});

function profileScopeRef(profile: StudentLearningPatternProfile) {
  return profile.scopeType === "subject"
    ? profile.subjectKey ?? "general"
    : "global";
}

function buildPlaybookObservations(
  profiles: StudentLearningPatternProfile[],
): Array<{
  scopeType: "global" | "subject";
  subjectKey: string | null;
  subjectLabel: string | null;
  memoryClass: "playbook";
  dimension: string;
  text: string;
  patternConfidence: number;
  metadata: Record<string, unknown>;
}> {
  return profiles.map((profile) => ({
    scopeType: profile.scopeType,
    subjectKey: profile.subjectKey ?? null,
    subjectLabel: profile.subjectLabel ?? null,
    memoryClass: "playbook",
    dimension: "teaching_playbook",
    text:
      profile.scopeType === "subject"
        ? `Current ${profile.subjectLabel ?? profile.subjectKey ?? "subject"} teaching playbook: ${profile.teacherSummary}`
        : `Current cross-subject teaching playbook: ${profile.teacherSummary}`,
    patternConfidence: profile.patternConfidence,
    metadata: {
      confidenceLabel: profile.confidenceLabel,
      summary: profile.teacherSummary,
    },
  }));
}

const learningPatternsWorker = new Worker<LearningPatternAnalysisJobData>(
  "learning-pattern-analysis",
  async (job: Job<LearningPatternAnalysisJobData>) => {
    const validated = jobDataSchema.parse(job.data);

    if (!isMem0Configured()) {
      throw new Error("Mem0 is not configured.");
    }

    const analysis = await createLearningPatternAnalysis({
      organizationId: validated.organizationId,
      studentUserId: validated.studentUserId,
      classroomStudentId: validated.classroomStudentId ?? null,
      topicId: validated.topicId ?? null,
      sourceType: validated.sourceType,
      sourceId: validated.sourceId,
    });

    if (analysis.status === "completed") {
      await job.updateProgress(100);
      return {
        success: true,
        skipped: "already_completed",
        sourceType: validated.sourceType,
        sourceId: validated.sourceId,
      };
    }

    await markLearningPatternAnalysisRunning(analysis.id);

    try {
      const currentProfiles = (
        await listStudentLearningPatternProfiles({
          organizationId: validated.organizationId,
          studentUserId: validated.studentUserId,
        })
      ).map((item) => item.profile);

      let nextProfiles: StudentLearningPatternProfile[] = [];
      let observations:
        | Awaited<ReturnType<typeof analyzeOnboardingLearningPatterns>>["observations"]
        | Awaited<ReturnType<typeof analyzeSessionLearningPatterns>>["observations"] = [];

      if (validated.sourceType === "onboarding") {
        const onboardingSession = await getDb().query.learningSessions.findFirst({
          where: and(
            eq(learningSessions.id, validated.sourceId),
            eq(learningSessions.sessionType, "interest_onboarding"),
          ),
          with: {
            classroomStudent: {
              with: {
                classroom: true,
                interestProfile: true,
              },
            },
            messages: {
              orderBy: (table, { asc }) => [asc(table.createdAt)],
            },
          },
        });

        if (
          !onboardingSession ||
          !onboardingSession.classroomStudent.userId ||
          !onboardingSession.classroomStudent.interestProfile
        ) {
          throw new Error("Onboarding source data is incomplete.");
        }

        const relevantMemories = await listLearningPatternMemories({
          studentUserId: validated.studentUserId,
          limit: 20,
        });

        const result = await analyzeOnboardingLearningPatterns({
          studentName: onboardingSession.classroomStudent.fullName,
          organizationId: validated.organizationId,
          studentUserId: validated.studentUserId,
          classroomStudentId: onboardingSession.classroomStudent.id,
          interestProfile: onboardingSession.classroomStudent.interestProfile.profile,
          transcript: onboardingSession.messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          currentProfiles,
          relevantMemories,
        });

        nextProfiles = result.profiles;
        observations = result.observations;
      } else {
        const tutoringSession = await getDb().query.learningSessions.findFirst({
          where: and(
            eq(learningSessions.id, validated.sourceId),
            eq(learningSessions.sessionType, "tutoring"),
          ),
          with: {
            classroomStudent: {
              with: {
                classroom: true,
                interestProfile: true,
              },
            },
            topic: true,
          },
        });

        if (
          !tutoringSession ||
          !tutoringSession.classroomStudent.userId ||
          !tutoringSession.classroomStudent.interestProfile ||
          !tutoringSession.topic
        ) {
          throw new Error("Tutoring source data is incomplete.");
        }

        const report = await getDb().query.studentProgressReports.findFirst({
          where: eq(studentProgressReports.generatedFromSessionId, tutoringSession.id),
          orderBy: (table, { desc }) => [desc(table.createdAt)],
        });

        if (!report) {
          throw new Error("No completed progress report found for tutoring session.");
        }

        const interactions = await listLearningInteractions({
          classroomStudentId: tutoringSession.classroomStudentId,
          sessionId: tutoringSession.id,
        });

        const outOfSession = await listRecentOutOfSessionInteractions({
          classroomStudentId: tutoringSession.classroomStudentId,
          topicId: tutoringSession.topic.id,
          since: tutoringSession.createdAt,
        });

        const subjectInfo = deriveSubjectInfo({
          subjectKey: tutoringSession.topic.subjectKey,
          subjectLabel: tutoringSession.topic.subjectLabel,
          subject: tutoringSession.topic.subject,
        });

        const relevantMemories = [
          ...(await listLearningPatternMemories({
            studentUserId: validated.studentUserId,
            scopeType: "global",
            limit: 12,
          })),
          ...(await listLearningPatternMemories({
            studentUserId: validated.studentUserId,
            scopeType: "subject",
            subjectKey: subjectInfo.subjectKey,
            limit: 12,
          })),
        ];

        const result = await analyzeSessionLearningPatterns({
          studentName: tutoringSession.classroomStudent.fullName,
          subjectKey: subjectInfo.subjectKey,
          subjectLabel: subjectInfo.subjectLabel,
          topicTitle: tutoringSession.topic.title,
          interestProfile: tutoringSession.classroomStudent.interestProfile.profile,
          state: learningSessionStateSchema.parse(tutoringSession.state ?? {}),
          report: report.report,
          transcript: interactions.map((interaction) => ({
            role: interaction.role,
            content: interaction.content,
            metadata: interaction.metadata as Record<string, unknown> | null,
          })),
          outOfSessionEvidence: outOfSession
            .filter((interaction) => {
              const relevance = interaction.metadata?.relevance;
              const length = interaction.content.trim().length;
              return (
                (relevance === "on_topic" || relevance === "near_topic") &&
                length >= 25
              );
            })
            .map((interaction) => ({
              role: interaction.role,
              content: interaction.content,
              metadata: interaction.metadata as Record<string, unknown> | null,
            })),
          currentProfiles,
          relevantMemories,
        });

        nextProfiles = result.profiles;
        observations = result.observations;
      }

      const mem0References = await addLearningPatternObservations({
        studentUserId: validated.studentUserId,
        organizationId: validated.organizationId,
        classroomStudentId: validated.classroomStudentId ?? null,
        topicId: validated.topicId ?? null,
        sourceType: validated.sourceType,
        sourceId: validated.sourceId,
        observations: [...observations, ...buildPlaybookObservations(nextProfiles)],
      });

      const now = new Date();
      const profileScopeRefs: Array<Record<string, string | null>> = [];

      for (const profile of nextProfiles) {
        const scopeRef = profileScopeRef(profile);
        await upsertStudentLearningPatternProfile({
          organizationId: validated.organizationId,
          studentUserId: validated.studentUserId,
          scopeType: profile.scopeType,
          scopeRef,
          subjectKey: profile.subjectKey ?? null,
          subjectLabel: profile.subjectLabel ?? null,
          patternConfidencePercent: confidenceToPercent(profile.patternConfidence),
          confidenceByDimension: buildConfidenceByDimension(profile),
          profile,
          teacherSummary: profile.teacherSummary,
          studentSummary: profile.studentSummary,
          engagementTrend: profile.engagementTrend.direction,
          lastAnalyzedSourceType: validated.sourceType,
          lastAnalyzedSourceId: validated.sourceId,
          lastMem0SyncAt: now,
        });

        profileScopeRefs.push({
          scopeType: profile.scopeType,
          scopeRef,
          subjectKey: profile.subjectKey ?? null,
        });
      }

      await completeLearningPatternAnalysis({
        analysisId: analysis.id,
        mem0References,
        profileScopeRefs,
      });

      await job.updateProgress(100);
      return {
        success: true,
        sourceType: validated.sourceType,
        sourceId: validated.sourceId,
        profileCount: nextProfiles.length,
      };
    } catch (error) {
      await failLearningPatternAnalysis({
        analysisId: analysis.id,
        errorMessage: error instanceof Error ? error.message : "Unknown analysis failure",
      });
      throw error;
    }
  },
  {
    connection: getRedisClient(),
    concurrency: 2,
  },
);

export default learningPatternsWorker;
