import { eq, and, sql, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/shared/db";
import { classrooms, classroomStudents, surveys, surveyConversations } from "@/shared/db/schema";
import { normalizeGradeBand } from "@/features/tutoring/server/grade-band-normalization";
import { getPersonalClassroomDirectory, getTeacherClassroomAccess } from "@/features/tutoring/server/access";
import {
  LEARNING_RESPONSE_STATUS,
  LEARNING_STATUS,
  LEARNING_SUBJECT_DEFAULTS,
} from "@/shared/learning/constants";
import {
  SURVEY_DELIVERY_MODE,
  SURVEY_STATUS,
} from "@/shared/surveys/constants";

/**
 * Create a new classroom
 */
export async function createClassroom(params: {
  teacherUserId: string;
  title: string;
  description?: string;
  subject?: string;
  gradeLabel?: string;
  defaultContentLocale: "en" | "fr" | "de";
}) {
  const classroomId = nanoid();
  const now = new Date();
  const gradeLabel = params.gradeLabel || LEARNING_SUBJECT_DEFAULTS.label;
  const gradeBand = normalizeGradeBand(gradeLabel);

  const [classroom] = await getDb().insert(classrooms).values({
    id: classroomId,
    teacherUserId: params.teacherUserId,
    title: params.title,
    description: params.description || null,
    subject: params.subject || null,
    defaultContentLocale: params.defaultContentLocale,
    gradeBand,
    gradeLabel,
    status: LEARNING_STATUS.classroomActive,
    createdAt: now,
    updatedAt: now,
  }).returning();

  return {
    ...classroom,
    accessLevel: "owner" as const,
  };
}

/**
 * Get all classrooms for a teacher
 */
export async function getTeacherClassrooms(teacherUserId: string) {
  return await getPersonalClassroomDirectory(teacherUserId);
}

/**
 * Get progress for surveys assigned to a classroom
 */
export async function getClassroomSurveyProgress(params: {
  classroomId: string;
  teacherUserId: string;
}) {
  const classroomAccess = await getTeacherClassroomAccess(params.teacherUserId, params.classroomId);

  if (!classroomAccess) {
    throw new Error("Classroom not found or access denied");
  }

  const [roster, classroomSurveys] = await Promise.all([
    getDb().query.classroomStudents.findMany({
      where: eq(classroomStudents.classroomId, params.classroomId),
      orderBy: (table, { asc }) => [asc(table.fullName)],
    }),
    getDb().query.surveys.findMany({
      where: and(
        eq(surveys.classroomId, params.classroomId),
        eq(surveys.deliveryMode, SURVEY_DELIVERY_MODE.CLASSROOM_ASSIGNED),
        eq(surveys.status, SURVEY_STATUS.ACTIVE),
        sql`${surveys.shareableLink} is not null`,
      ),
      orderBy: (table, { desc }) => [desc(table.updatedAt)],
    }),
  ]);

  if (!roster.length || !classroomSurveys.length) {
    return classroomSurveys.map((survey) => ({
      id: survey.id,
      title: survey.title,
      status: survey.status,
      shareableLink: survey.shareableLink ?? null,
      createdAt: survey.createdAt?.toISOString() ?? null,
      assignedCount: roster.length,
      completedCount: 0,
      inProgressCount: 0,
      notStartedCount: roster.length,
      completionRate: 0,
      students: roster.map((student) => ({
        classroomStudentId: student.id,
        fullName: student.fullName,
        email: student.email,
        inviteStatus: student.inviteStatus,
        onboardingStatus: student.onboardingStatus,
        responseStatus: LEARNING_RESPONSE_STATUS.NOT_STARTED,
        completedAt: null,
      })),
    }));
  }

  const surveyIds = classroomSurveys.map((survey) => survey.id);
  const studentIds = roster.map((student) => student.id);
  
  const conversations = await getDb().query.surveyConversations.findMany({
    where: and(
      inArray(surveyConversations.surveyId, surveyIds),
      inArray(surveyConversations.participantId, studentIds)
    ),
    orderBy: (table, { desc }) => [desc(table.updatedAt)],
  });

  const latestConversationByKey = conversations.reduce<
    Map<string, (typeof conversations)[number]>
  >((entries, conversation) => {
    const participantId = conversation.participantId;
    if (!participantId) return entries;

    const key = `${conversation.surveyId}:${participantId}`;
    if (!entries.has(key)) {
      entries.set(key, conversation);
    }
    return entries;
  }, new Map());

  return classroomSurveys.map((survey) => {
    const studentStates = roster.map((student) => {
      const conversation = latestConversationByKey.get(`${survey.id}:${student.id}`);
      const responseStatus:
        | typeof LEARNING_RESPONSE_STATUS.COMPLETED
        | typeof LEARNING_RESPONSE_STATUS.IN_PROGRESS
        | typeof LEARNING_RESPONSE_STATUS.NOT_STARTED =
        conversation?.completed
          ? LEARNING_RESPONSE_STATUS.COMPLETED
          : conversation
            ? LEARNING_RESPONSE_STATUS.IN_PROGRESS
            : LEARNING_RESPONSE_STATUS.NOT_STARTED;

      return {
        classroomStudentId: student.id,
        fullName: student.fullName,
        email: student.email,
        inviteStatus: student.inviteStatus,
        onboardingStatus: student.onboardingStatus,
        responseStatus,
        completedAt:
          responseStatus === LEARNING_RESPONSE_STATUS.COMPLETED
            ? conversation?.updatedAt?.toISOString() ?? null
            : null,
      };
    });

    const completedCount = studentStates.filter(
      (student) => student.responseStatus === LEARNING_RESPONSE_STATUS.COMPLETED,
    ).length;
    const inProgressCount = studentStates.filter(
      (student) => student.responseStatus === LEARNING_RESPONSE_STATUS.IN_PROGRESS,
    ).length;
    const assignedCount = studentStates.length;
    const notStartedCount = assignedCount - completedCount - inProgressCount;

    return {
      id: survey.id,
      title: survey.title,
      status: survey.status,
      shareableLink: survey.shareableLink ?? null,
      createdAt: survey.createdAt?.toISOString() ?? null,
      assignedCount,
      completedCount,
      inProgressCount,
      notStartedCount,
      completionRate:
        assignedCount > 0
          ? Math.round((completedCount / assignedCount) * 100)
          : 0,
      students: studentStates,
    };
  });
}
