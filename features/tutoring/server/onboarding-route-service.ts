import { nanoid } from "nanoid";

import { getDb } from "@/shared/db";
import { notifications } from "@/shared/db/schema";
import {
  getPrimaryStudentMembership,
  getUniversalStudentInterestProfile,
} from "@/features/tutoring/server/access";
import {
  buildOnboardingGreeting,
  runInterestOnboardingTurn,
  shouldRefreshInterestProfile,
  streamInterestOnboardingTurn,
} from "@/features/tutoring/server/onboarding";
import { captureOnboardingPatternMemory } from "@/features/tutoring/server/pattern-memory-service";
import { generateTeacherOnboardingSummary } from "@/features/tutoring/server/reporting";
import {
  appendLearningMessage,
  completeLearningSession,
  createLearningSession,
  getActiveLearningSession,
  listLearningMessages,
  markStudentOnboardingComplete,
} from "@/features/tutoring/public-server";
import {
  markStudentOnboardingCompleteForUser,
  upsertInterestProfileForUserMemberships,
} from "@/features/tutoring/server/student-profile-storage";
import type { StudentInterestProfile } from "@/features/tutoring/public-server";
import {
  LEARNING_STATUS,
  ONBOARDING_TURN_STATUS,
} from "@/shared/learning/constants";

export async function getOnboardingState(userId: string) {
  const membership = await getPrimaryStudentMembership(userId);
  if (!membership) return { membership: null, completed: false as const };

  const universalInterestProfile = await getUniversalStudentInterestProfile(userId);

  if (
    universalInterestProfile &&
    !shouldRefreshInterestProfile(universalInterestProfile.profile)
  ) {
    return {
      membership,
      completed: true as const,
      profile: universalInterestProfile.profile,
    };
  }

  let activeSession = await getActiveLearningSession({
    classroomStudentId: membership.id,
    topicId: null,
    sessionType: LEARNING_STATUS.sessionTypeInterestOnboarding,
  });

  if (!activeSession) {
    activeSession = await createLearningSession({
      classroomStudentId: membership.id,
      topicId: null,
      sessionType: LEARNING_STATUS.sessionTypeInterestOnboarding,
    });
    await appendLearningMessage({
      sessionId: activeSession.id,
      role: "assistant",
      content: buildOnboardingGreeting(membership.fullName),
    });
  }

  const messages = await listLearningMessages(activeSession.id);
  return {
    membership,
    completed: false as const,
    sessionId: activeSession.id,
    messages,
  };
}

export async function ensureOnboardingSession(classroomStudentId: string) {
  return (
    (await getActiveLearningSession({
      classroomStudentId,
      topicId: null,
      sessionType: LEARNING_STATUS.sessionTypeInterestOnboarding,
    })) ??
    (await createLearningSession({
      classroomStudentId,
      topicId: null,
      sessionType: LEARNING_STATUS.sessionTypeInterestOnboarding,
    }))
  );
}

export async function prepareOnboardingTurn(params: {
  userId: string;
  latestUserText: string;
}) {
  const membership = await getPrimaryStudentMembership(params.userId);
  if (!membership) return { membership: null };

  const activeSession = await ensureOnboardingSession(membership.id);
  await appendLearningMessage({
    sessionId: activeSession.id,
    role: "user",
    content: params.latestUserText,
  });

  const transcript = await listLearningMessages(activeSession.id);
  const universalInterestProfile =
    await getUniversalStudentInterestProfile(params.userId);

  return {
    membership,
    activeSession,
    transcript: transcript.map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content,
    })) as Array<{ role: "assistant" | "user"; content: string }>,
    existingProfile: universalInterestProfile?.profile ?? null,
  };
}

export async function createOnboardingResponseStream(params: {
  membership: NonNullable<Awaited<ReturnType<typeof getPrimaryStudentMembership>>>;
  transcript: Array<{ role: "assistant" | "user"; content: string }>;
  existingProfile: StudentInterestProfile | null;
}) {
  return streamInterestOnboardingTurn({
    studentName: params.membership.fullName,
    existingProfile: params.existingProfile,
    messages: params.transcript,
  });
}

export async function finalizeOnboardingTurn(params: {
  membership: NonNullable<Awaited<ReturnType<typeof getPrimaryStudentMembership>>>;
  activeSessionId: string;
  expectedStateVersion: number;
  transcript: Array<{ role: "assistant" | "user"; content: string }>;
  assistantResponse: string;
  existingProfile: StudentInterestProfile | null;
}) {
  const result = await runInterestOnboardingTurn({
    studentName: params.membership.fullName,
    existingProfile: params.existingProfile,
    messages: [
      ...params.transcript,
      { role: "assistant", content: params.assistantResponse },
    ],
  });

  await appendLearningMessage({
    sessionId: params.activeSessionId,
    role: "assistant",
    content: params.assistantResponse,
    metadata: { status: result.status },
  });

  if (
    result.status === ONBOARDING_TURN_STATUS.COMPLETE &&
    result.interestProfile
  ) {
    await finalizeCompletedOnboarding({
      membership: params.membership,
      activeSessionId: params.activeSessionId,
      expectedStateVersion: params.expectedStateVersion,
      interestProfile: result.interestProfile,
      transcript: [
        ...params.transcript,
        { role: "assistant", content: params.assistantResponse },
      ],
    });
  }

  return result;
}

export async function finalizeCompletedOnboarding(params: {
  membership: NonNullable<Awaited<ReturnType<typeof getPrimaryStudentMembership>>>;
  activeSessionId: string;
  expectedStateVersion: number;
  interestProfile: StudentInterestProfile;
  transcript: Array<{ role: "assistant" | "user"; content: string }>;
}) {
  if (params.membership.userId) {
    await upsertInterestProfileForUserMemberships({
      userId: params.membership.userId,
      profile: params.interestProfile,
    });
    await markStudentOnboardingCompleteForUser(params.membership.userId);
  } else {
    await markStudentOnboardingComplete(params.membership.id);
  }

  if (params.membership.userId) {
    await captureOnboardingPatternMemory({
      studentName: params.membership.fullName,
      studentUserId: params.membership.userId,
      classroomStudentId: params.membership.id,
      classroomId: params.membership.classroomId,
      sessionId: params.activeSessionId,
      interestProfile: params.interestProfile,
      transcript: params.transcript,
    });
  }

  const teacherSummary = await generateTeacherOnboardingSummary({
    studentName: params.membership.fullName,
    profile: params.interestProfile,
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
    summary: "Onboarding complete. Interest profile captured for future tutoring.",
    expectedStateVersion: params.expectedStateVersion,
  });
}
