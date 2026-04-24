import { eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import {
  analyticsChatSessions,
  classroomStudents,
  deletionJobs,
  participantFeedback,
  privacyRequests,
  respondentAccessTokens,
  surveyAnalyticsFacts,
  surveyConversations,
  surveyEvidence,
  surveySessionInsights,
  surveySessions,
  surveyTurns,
  surveys,
  topicMaterials,
  users,
  voiceChunks,
  voiceQualityMetrics,
  voiceSessions,
} from "@/db/schema";
import { deleteLearningPatternMemoriesForUser, isMem0Configured } from "@/lib/learning/mem0";
import { deleteLearningMaterial, clearSurveyMedia } from "@/lib/storage";

export async function createPrivacyRequest(input: {
  surveyId?: string | null;
  userId?: string | null;
  classroomStudentId?: string | null;
  subjectType: string;
  requestType: string;
  requestPayload?: Record<string, unknown>;
}) {
  const [request] = await getDb()
    .insert(privacyRequests)
    .values({
      id: nanoid(),
      surveyId: input.surveyId ?? null,
      userId: input.userId ?? null,
      classroomStudentId: input.classroomStudentId ?? null,
      subjectType: input.subjectType,
      requestType: input.requestType,
      status: "pending",
      requestPayload: input.requestPayload ?? {},
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return request;
}

export async function markPrivacyRequestResolved(input: {
  requestId: string;
  status: "completed" | "failed";
  resultPayload?: Record<string, unknown>;
}) {
  await getDb()
    .update(privacyRequests)
    .set({
      status: input.status,
      resultPayload: input.resultPayload ?? {},
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(privacyRequests.id, input.requestId));
}

export async function createDeletionJob(input: {
  privacyRequestId: string;
  jobType: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}) {
  const [job] = await getDb()
    .insert(deletionJobs)
    .values({
      id: nanoid(),
      privacyRequestId: input.privacyRequestId,
      jobType: input.jobType,
      targetType: input.targetType,
      targetId: input.targetId,
      status: "pending",
      metadata: input.metadata ?? {},
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return job;
}

export async function markDeletionJobStatus(input: {
  deletionJobId: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  lastError?: string | null;
}) {
  await getDb()
    .update(deletionJobs)
    .set({
      status: input.status,
      lastError: input.lastError ?? null,
      startedAt: input.status === "in_progress" ? new Date() : undefined,
      completedAt:
        input.status === "completed" || input.status === "failed"
          ? new Date()
          : undefined,
      updatedAt: new Date(),
    })
    .where(eq(deletionJobs.id, input.deletionJobId));
}

export async function exportUserPrivacyData(userId: string) {
  const [user, ownedSurveys, uploadedMaterials, memberships, userPrivacyRequests] = await Promise.all([
    getDb().query.users.findFirst({
      where: eq(users.id, userId),
    }),
    getDb().query.surveys.findMany({
      where: eq(surveys.userId, userId),
    }),
    getDb().query.topicMaterials.findMany({
      where: eq(topicMaterials.uploadedByUserId, userId),
    }),
    getDb().query.classroomStudents.findMany({
      where: eq(classroomStudents.userId, userId),
      with: {
        classroom: true,
      },
    }),
    getDb().query.privacyRequests.findMany({
      where: eq(privacyRequests.userId, userId),
    }),
  ]);

  return {
    user,
    ownedSurveys,
    uploadedMaterials,
    studentMemberships: memberships,
    privacyRequests: userPrivacyRequests,
  };
}

export async function exportRespondentPrivacyData(conversationId: string) {
  const [conversation, feedback, voiceSessionRows] = await Promise.all([
    getDb().query.surveyConversations.findFirst({
      where: eq(surveyConversations.id, conversationId),
    }),
    getDb().query.participantFeedback.findMany({
      where: eq(participantFeedback.conversationId, conversationId),
    }),
    getDb().query.voiceSessions.findMany({
      where: eq(voiceSessions.conversationId, conversationId),
    }),
  ]);
  if (!conversation) return null;

  const sessions = await getDb().query.surveySessions.findMany({
    where: eq(surveySessions.sourceConversationId, conversationId),
  });

  return {
    conversation,
    sessions,
    feedback,
    voiceSessions: voiceSessionRows,
  };
}

async function deleteSurveySessionArtifacts(sessionIds: string[]) {
  if (sessionIds.length === 0) return;

  await getDb().transaction(async (tx) => {
    await tx.delete(surveyAnalyticsFacts).where(inArray(surveyAnalyticsFacts.sessionId, sessionIds));
    await tx.delete(surveySessionInsights).where(inArray(surveySessionInsights.sessionId, sessionIds));
    await tx.delete(surveyEvidence).where(inArray(surveyEvidence.sessionId, sessionIds));
    await tx.delete(surveyTurns).where(inArray(surveyTurns.sessionId, sessionIds));
    await tx.delete(voiceQualityMetrics).where(inArray(voiceQualityMetrics.sessionId, sessionIds));
    await tx.delete(voiceChunks).where(inArray(voiceChunks.sessionId, sessionIds));
    await tx.delete(surveySessions).where(inArray(surveySessions.id, sessionIds));
  });
}

export async function deleteRespondentPrivacyData(conversationId: string) {
  const sessions = await getDb().query.surveySessions.findMany({
    where: eq(surveySessions.sourceConversationId, conversationId),
  });

  await deleteSurveySessionArtifacts(sessions.map((session) => session.id));
  await getDb()
    .delete(participantFeedback)
    .where(eq(participantFeedback.conversationId, conversationId));
  await getDb()
    .delete(voiceSessions)
    .where(eq(voiceSessions.conversationId, conversationId));
  await getDb()
    .delete(respondentAccessTokens)
    .where(eq(respondentAccessTokens.conversationId, conversationId));
  await getDb()
    .delete(surveyConversations)
    .where(eq(surveyConversations.id, conversationId));
}

export async function deleteUserPrivacyData(userId: string) {
  const ownedSurveys = await getDb().query.surveys.findMany({
    where: eq(surveys.userId, userId),
  });
  const materials = await getDb().query.topicMaterials.findMany({
    where: eq(topicMaterials.uploadedByUserId, userId),
  });

  for (const survey of ownedSurveys) {
    await clearSurveyMedia(survey.id).catch(() => undefined);
  }

  for (const material of materials) {
    if (material.storagePath) {
      await deleteLearningMaterial(material.storagePath).catch(() => undefined);
    }
  }

  if (isMem0Configured()) {
    await deleteLearningPatternMemoriesForUser(userId).catch(() => undefined);
  }

  await getDb().transaction(async (tx) => {
    await tx
      .delete(analyticsChatSessions)
      .where(eq(analyticsChatSessions.userId, userId));
    await tx.delete(users).where(eq(users.id, userId));
  });
}
