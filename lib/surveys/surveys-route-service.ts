import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import {
  classrooms,
  surveyBriefs,
  surveyCreationConversations,
  surveys,
  users,
} from "@/db/schema";
import { buildCreationGreeting } from "@/lib/education/creation-agent";
import { resolveUiLocaleForContentCreation } from "@/lib/i18n/resolve-locale";
import { resolveTeacherClassroomAccess } from "@/lib/access/classroom-access";
import { getSurveyPermissionContext, hasSurveyPermission } from "@/lib/survey-access";
import { SURVEY_LIMITS } from "@/lib/config";

import { getVerifiedSession } from "@/lib/auth/dal";
import type { createSurveySchema } from "@/lib/validation/survey-schemas";
import type { z } from "zod";

type SurveyPermission = NonNullable<
  Awaited<ReturnType<typeof getSurveyPermissionContext>>
>;

export async function listSurveysForUser(userId: string) {
  const rows = await getDb()
    .select({
      id: surveys.id,
      title: surveys.title,
      status: surveys.status,
      deliveryMode: surveys.deliveryMode,
      classroomId: surveys.classroomId,
      shareableLink: surveys.shareableLink,
      createdAt: surveys.createdAt,
      updatedAt: surveys.updatedAt,
      currentParticipants: surveys.currentParticipants,
      participantLimit: surveys.participantLimit,
      isVoice: surveys.isVoice,
      programId: surveys.programId,
      folderId: surveys.folderId,
      creatorName: users.name,
      classroomTitle: classrooms.title,
    })
    .from(surveys)
    .leftJoin(users, eq(surveys.userId, users.id))
    .leftJoin(classrooms, eq(surveys.classroomId, classrooms.id))
    .where(eq(surveys.userId, userId))
    .orderBy(desc(surveys.createdAt));

  const briefs = await getDb()
    .select({
      surveyId: surveyBriefs.surveyId,
      completenessStatus: surveyBriefs.completenessStatus,
      brief: surveyBriefs.brief,
    })
    .from(surveyBriefs);
  const briefBySurveyId = new Map(briefs.map((row) => [row.surveyId, row]));
  const permissions = await Promise.all(
    rows.map((survey) => getSurveyPermissionContext(userId, survey.id)),
  );
  const permissionBySurveyId = new Map<string, SurveyPermission>();
  for (const permission of permissions) {
    if (permission) permissionBySurveyId.set(permission.surveyId, permission);
  }

  return rows.flatMap((survey) => {
    const permission = permissionBySurveyId.get(survey.id);
    const canOpen = hasSurveyPermission(permission, "canView");
    const accessLevel = permission?.accessLevel ?? "none";
    const isOwner = permission?.isSurveyCreator ?? false;

    return [{
      id: survey.id,
      title: survey.title || "Untitled Survey",
      status: survey.status,
      deliveryMode: survey.deliveryMode,
      classroomId: survey.classroomId,
      classroomTitle: survey.classroomTitle ?? null,
      shareableLink: survey.shareableLink,
      responses: survey.currentParticipants,
      completionRate: 0,
      createdAt: survey.createdAt?.toISOString().split("T")[0] || "",
      lastResponse: "Never",
      isVoice: survey.isVoice || false,
      programId: survey.programId,
      folderId: survey.folderId,
      creatorName: survey.creatorName ?? null,
      isOwner,
      accessLevel,
      canOpen,
      canEdit: hasSurveyPermission(permission, "canEdit"),
      canDelete: hasSurveyPermission(permission, "canDelete"),
      isLocked: false,
      sharedBy: !isOwner ? (survey.creatorName ?? null) : null,
      role: accessLevel,
      coreObjective: briefBySurveyId.get(survey.id)?.brief?.researchGoal || null,
      brief: briefBySurveyId.get(survey.id)?.brief || null,
      briefStatus: briefBySurveyId.get(survey.id)?.completenessStatus || "draft",
    }];
  });
}

export async function createSurveyForUser(params: {
  session: Awaited<ReturnType<typeof getVerifiedSession>>;
  body: z.infer<typeof createSurveySchema>;
}) {
  const surveyId = nanoid();
  const now = new Date();
  const deliveryMode = params.body.deliveryMode;
  const classroomId = params.body.classroomId;
  const requestedLanguage = params.body.language;
  const language = await resolveUiLocaleForContentCreation({
    explicitLocale: requestedLanguage,
    session: params.session,
  });

  const classroomAccessResult = classroomId
    ? await resolveTeacherClassroomAccess({ teacherUserId: params.session.user.id, classroomId })
    : null;

  const classroomAccess = classroomAccessResult && "classroom" in classroomAccessResult
    ? classroomAccessResult.classroom
    : null;

  const existingSurveys = await getDb()
    .select({ id: surveys.id, isVoice: surveys.isVoice })
    .from(surveys)
    .where(eq(surveys.userId, params.session.user.id));

  const greeting = buildCreationGreeting(language);

  let createdSurvey: typeof surveys.$inferSelect | undefined;
  await getDb().transaction(async (tx) => {
    const [inserted] = await tx
      .insert(surveys)
      .values({
        id: surveyId,
        userId: params.session.user.id,
        classroomId: classroomAccess?.id ?? null,
        deliveryMode,
        title:
          deliveryMode === "classroom_assigned"
            ? `Untitled ${classroomAccess?.title ?? "Classroom"} Survey`
            : "Untitled Education Study",
        status: "creating",
        language,
        isVoice: params.body.isVoice,
        participantLimit: SURVEY_LIMITS.DEFAULT_PARTICIPANT_LIMIT,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    createdSurvey = inserted;

    await tx.insert(surveyCreationConversations).values({
      id: nanoid(),
      surveyId,
      messages: [{ id: nanoid(), role: "assistant", content: greeting, parts: [{ type: "text", text: greeting }], timestamp: now.toISOString() }],
      status: "in_progress",
      collectedInfo: {},
      extractedData: {},
      createdAt: now,
      updatedAt: now,
    });
  });

  return {
    createdSurvey,
    greeting,
    existingSurveys,
  };
}
