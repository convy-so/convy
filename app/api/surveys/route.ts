import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import {
  classrooms,
  surveyBriefs,
  surveyCreationConversations,
  surveys,
  users,
} from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { buildCreationGreeting } from "@/lib/education/creation-agent";
import { resolveUiLocaleForContentCreation } from "@/lib/i18n/resolve-locale";
import { getTeacherClassroomAccess } from "@/lib/learning/access";
import {
  getSurveyPermissionContext,
  hasSurveyPermission,
} from "@/lib/survey-access";
import { createSurveySchema } from "@/lib/validation/survey-schemas";
import { SURVEY_LIMITS } from "@/lib/config";

type SurveyPermission = NonNullable<
  Awaited<ReturnType<typeof getSurveyPermissionContext>>
>;

export async function GET() {
  try {
    const session = await getVerifiedSession();

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
      .where(eq(surveys.userId, session.user.id))
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
      rows.map((survey) => getSurveyPermissionContext(session.user.id, survey.id)),
    );
    const permissionBySurveyId = new Map<string, SurveyPermission>();
    for (const permission of permissions) {
      if (permission) {
        permissionBySurveyId.set(permission.surveyId, permission);
      }
    }

    return NextResponse.json({
      surveys: rows.flatMap((survey) => {
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
          coreObjective:
            briefBySurveyId.get(survey.id)?.brief?.researchGoal || null,
          brief: briefBySurveyId.get(survey.id)?.brief || null,
          briefStatus:
            briefBySurveyId.get(survey.id)?.completenessStatus || "draft",
        }];
      }),
    });
  } catch (error) {
    if (error instanceof Error && (error.message === "UNAUTHENTICATED" || error.message === "EMAIL_NOT_VERIFIED")) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("Error fetching surveys:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getVerifiedSession();
    
    // Parse and validate request body
    const rawBody = await request.json().catch(() => null);
    if (!rawBody) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const validationResult = createSurveySchema.safeParse(rawBody);
    if (!validationResult.success) {
      return NextResponse.json(
        { 
          error: "Validation failed", 
          details: validationResult.error.errors[0]?.message 
        },
        { status: 400 }
      );
    }

    const body = validationResult.data;
    const surveyId = nanoid();
    const now = new Date();
    const deliveryMode = body.deliveryMode;
    const classroomId = body.classroomId;
    const requestedLanguage = body.language;
    const language = await resolveUiLocaleForContentCreation({
      explicitLocale: requestedLanguage,
      session,
    });

    if (deliveryMode === "classroom_assigned" && !classroomId) {
      return NextResponse.json(
        { error: "Class-linked surveys must target a classroom." },
        { status: 400 },
      );
    }

    const classroomAccess = classroomId
      ? await getTeacherClassroomAccess(session.user.id, classroomId)
      : null;

    if (classroomId && !classroomAccess) {
      return NextResponse.json(
        { error: "You need classroom access before creating a class-linked survey." },
        { status: 403 },
      );
    }

    const existingSurveys = await getDb()
      .select({ id: surveys.id, isVoice: surveys.isVoice })
      .from(surveys)
      .where(eq(surveys.userId, session.user.id));

    const isVoice = body.isVoice;
    if (existingSurveys.length >= SURVEY_LIMITS.MAX_SURVEYS_PER_SCOPE) {
      return NextResponse.json(
        { error: `Limit reached: You can only have ${SURVEY_LIMITS.MAX_SURVEYS_PER_SCOPE} surveys in your account` },
        { status: 403 },
      );
    }
    if (isVoice && existingSurveys.filter((item) => item.isVoice).length >= SURVEY_LIMITS.MAX_VOICE_SURVEYS_PER_SCOPE) {
      return NextResponse.json(
        { error: `Limit reached: You can only have ${SURVEY_LIMITS.MAX_VOICE_SURVEYS_PER_SCOPE} voice surveys in your account` },
        { status: 403 },
      );
    }

    const greeting = buildCreationGreeting(language);

    let createdSurvey: typeof surveys.$inferSelect | undefined;
    await getDb().transaction(async (tx) => {
      const [inserted] = await tx
        .insert(surveys)
        .values({
          id: surveyId,
          userId: session.user.id,
          classroomId: classroomAccess?.id ?? null,
          deliveryMode,
          title:
            deliveryMode === "classroom_assigned"
              ? `Untitled ${classroomAccess?.title ?? "Classroom"} Survey`
              : "Untitled Education Study",
          status: "creating",
          language,
          isVoice,
          participantLimit: SURVEY_LIMITS.DEFAULT_PARTICIPANT_LIMIT,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      createdSurvey = inserted;

      await tx.insert(surveyCreationConversations).values({
        id: nanoid(),
        surveyId,
        messages: [
          {
            id: nanoid(),
            role: "assistant",
            content: greeting,
            parts: [{ type: "text", text: greeting }],
            timestamp: now.toISOString(),
          },
        ],
        status: "in_progress",
        collectedInfo: {},
        extractedData: {},
        createdAt: now,
        updatedAt: now,
      });
    });

    return NextResponse.json({
      ...createdSurvey,
      messages: [
        {
          id: nanoid(),
          role: "assistant",
          content: greeting,
          parts: [{ type: "text", text: greeting }],
          timestamp: now.toISOString(),
        },
      ],
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: "Validation failed", 
          details: error.errors[0]?.message 
        },
        { status: 400 }
      );
    }
    if (error instanceof Error && (error.message === "UNAUTHENTICATED" || error.message === "EMAIL_NOT_VERIFIED")) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("Error creating survey:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

