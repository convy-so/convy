import { nanoid } from "nanoid";

import { getDb } from "@/db";
import { notifications } from "@/db/schema";
import { getPrimaryStudentMembership } from "@/lib/learning/access";
import {
  buildOnboardingGreeting,
  runInterestOnboardingTurn,
  shouldRefreshInterestProfile,
} from "@/lib/learning/onboarding";
import { generateTeacherOnboardingSummary } from "@/lib/learning/reporting";
import {
  appendLearningMessage,
  completeLearningSession,
  createLearningSession,
  createStudentModelSnapshot,
  getActiveLearningSession,
  listLearningMessages,
  markStudentOnboardingComplete,
  upsertInterestProfile,
} from "@/lib/learning/storage";
import { studentModelService } from "@/lib/learning/student-model-service";

export async function getOnboardingState(userId: string) {
  const membership = await getPrimaryStudentMembership(userId);
  if (!membership) return { membership: null, completed: false as const };

  if (membership.interestProfile && !shouldRefreshInterestProfile(membership.interestProfile.profile)) {
    return { membership, completed: true as const, profile: membership.interestProfile.profile };
  }

  let activeSession = await getActiveLearningSession({
    classroomStudentId: membership.id,
    topicId: null,
    sessionType: "interest_onboarding",
  });

  if (!activeSession) {
    activeSession = await createLearningSession({ classroomStudentId: membership.id, topicId: null, sessionType: "interest_onboarding" });
    await appendLearningMessage({ sessionId: activeSession.id, role: "assistant", content: buildOnboardingGreeting(membership.fullName) });
  }

  const messages = await listLearningMessages(activeSession.id);
  return { membership, completed: false as const, sessionId: activeSession.id, messages };
}

export async function ensureOnboardingSession(classroomStudentId: string) {
  return (
    (await getActiveLearningSession({ classroomStudentId, topicId: null, sessionType: "interest_onboarding" })) ??
    (await createLearningSession({ classroomStudentId, topicId: null, sessionType: "interest_onboarding" }))
  );
}

export async function runOnboardingTurn(params: {
  userId: string;
  latestUserText: string;
}) {
  const membership = await getPrimaryStudentMembership(params.userId);
  if (!membership) return { membership: null };

  const activeSession = await ensureOnboardingSession(membership.id);
  await appendLearningMessage({ sessionId: activeSession.id, role: "user", content: params.latestUserText });

  const transcript = await listLearningMessages(activeSession.id);
  const studentModel = await studentModelService.ensureModel({ classroomStudentId: membership.id, studentUserId: params.userId });
  const latestSnapshot = await studentModelService.getLatestSnapshot(studentModel.id);
  const result = await runInterestOnboardingTurn({
    studentName: membership.fullName,
    existingProfile: membership.interestProfile?.profile ?? null,
    existingStudentModel: latestSnapshot?.snapshot ?? null,
    messages: transcript.map((message) => ({ role: message.role === "assistant" ? "assistant" : "user", content: message.content })),
  });

  await appendLearningMessage({
    sessionId: activeSession.id,
    role: "assistant",
    content: result.response,
    metadata: { status: result.status },
  });

  return { membership, activeSession, studentModel, result };
}

export async function finalizeCompletedOnboarding(params: {
  membership: NonNullable<Awaited<ReturnType<typeof getPrimaryStudentMembership>>>;
  studentModelId: string;
  activeSessionId: string;
  expectedStateVersion: number;
  interestProfile: Parameters<typeof upsertInterestProfile>[0]["profile"];
  studentModelSnapshot: Parameters<typeof createStudentModelSnapshot>[0]["snapshot"];
}) {
  await upsertInterestProfile({ classroomStudentId: params.membership.id, profile: params.interestProfile });
  const snapshot = await createStudentModelSnapshot({
    studentModelId: params.studentModelId,
    snapshot: params.studentModelSnapshot,
    sourceType: "onboarding",
    sourceId: params.activeSessionId,
  });

  await markStudentOnboardingComplete(params.membership.id);
  const teacherSummary = await generateTeacherOnboardingSummary({
    studentName: params.membership.fullName,
    profile: { interestProfile: params.interestProfile, studentModelSnapshot: params.studentModelSnapshot },
  });

  await getDb().insert(notifications).values({
    id: nanoid(),
    userId: params.membership.classroom.teacherUserId,
    title: `${params.membership.fullName} onboarding summary`,
    message: teacherSummary.summary,
    type: "info",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await completeLearningSession({
    sessionId: params.activeSessionId,
    summary: `Onboarding complete. Student model snapshot ${snapshot.version} created.`,
    expectedStateVersion: params.expectedStateVersion,
  });
}
