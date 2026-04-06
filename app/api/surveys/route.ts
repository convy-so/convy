import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import {
  classrooms,
  surveyBriefs,
  surveyCreationConversations,
  surveyEditorRequests,
  surveys,
  users,
} from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { buildCreationGreeting } from "@/lib/education/creation-agent";
import {
  isAppLocale,
} from "@/lib/i18n/config";
import { resolveUiLocaleForContentCreation } from "@/lib/i18n/resolve-locale";
import { getWorkspaceLocaleSettings } from "@/lib/i18n/workspace-settings";
import { getTeacherClassroomAccess } from "@/lib/learning/access";
import {
  getSurveyPermissionContext,
  hasSurveyPermission,
} from "@/lib/workspace-access";
import {
  recordRealtimeEvent,
} from "@/lib/collaboration-service";

type SurveyDeliveryMode = "link" | "classroom_assigned";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getSurveyDeliveryMode(value: unknown): SurveyDeliveryMode {
  return value === "classroom_assigned" ? "classroom_assigned" : "link";
}

type SurveyPermission = NonNullable<
  Awaited<ReturnType<typeof getSurveyPermissionContext>>
>;

export async function GET() {
  try {
    const session = await getVerifiedSession();
    const activeOrgId = session.session.activeOrganizationId;

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
        projectId: surveys.projectId,
        creatorName: users.name,
        classroomTitle: classrooms.title,
      })
      .from(surveys)
      .leftJoin(users, eq(surveys.userId, users.id))
      .leftJoin(classrooms, eq(surveys.classroomId, classrooms.id))
      .where(
        activeOrgId
          ? eq(surveys.organizationId, activeOrgId)
          : and(eq(surveys.userId, session.user.id), isNull(surveys.organizationId)),
      )
      .orderBy(desc(surveys.createdAt));

    const briefs = await getDb()
      .select({
        surveyId: surveyBriefs.surveyId,
        completenessStatus: surveyBriefs.completenessStatus,
        brief: surveyBriefs.brief,
      })
      .from(surveyBriefs);
    const briefBySurveyId = new Map(briefs.map((row) => [row.surveyId, row]));
    const surveyIds = rows.map((row) => row.id);
    const pendingRequests =
      activeOrgId && surveyIds.length > 0
        ? await getDb()
            .select({
              surveyId: surveyEditorRequests.surveyId,
            })
            .from(surveyEditorRequests)
            .where(
              and(
                inArray(surveyEditorRequests.surveyId, surveyIds),
                eq(surveyEditorRequests.requesterId, session.user.id),
                eq(surveyEditorRequests.status, "pending"),
              ),
            )
        : [];
    const pendingRequestSurveyIds = new Set(
      pendingRequests.map((request) => request.surveyId),
    );
    const permissions = await Promise.all(
      rows.map((survey) =>
        getSurveyPermissionContext(session.user.id, survey.id, {
          activeWorkspaceId: activeOrgId ?? null,
        }),
      ),
    );
    const permissionBySurveyId = new Map<string, SurveyPermission>();
    for (const permission of permissions) {
      if (permission) {
        permissionBySurveyId.set(permission.surveyId, permission);
      }
    }

    return NextResponse.json({
      surveys: rows.map((survey) => {
        const permission = permissionBySurveyId.get(survey.id);
        const canOpen = hasSurveyPermission(permission, "canView");
        const accessLevel = permission?.accessLevel ?? "none";
        const isOwner = permission?.isSurveyCreator ?? false;

        return {
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
          projectId: survey.projectId,
          creatorName: survey.creatorName ?? null,
          isOwner,
          accessLevel,
          canOpen,
          canEdit: hasSurveyPermission(permission, "canEdit"),
          canDelete: hasSurveyPermission(permission, "canDelete"),
          canRequestAccess: hasSurveyPermission(permission, "canRequestAccess"),
          pendingAccessRequest: pendingRequestSurveyIds.has(survey.id),
          isLocked: activeOrgId ? !canOpen : false,
          sharedBy: !isOwner ? (survey.creatorName ?? null) : null,
          role: accessLevel,
          coreObjective:
            briefBySurveyId.get(survey.id)?.brief?.researchGoal || null,
          brief: briefBySurveyId.get(survey.id)?.brief || null,
          briefStatus:
            briefBySurveyId.get(survey.id)?.completenessStatus || "draft",
        };
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
    const rawBody = await request.json().catch(() => ({}));
    const body = isRecord(rawBody) ? rawBody : {};
    const surveyId = nanoid();
    const now = new Date();
    const activeOrgId = session.session.activeOrganizationId;
    const deliveryMode = getSurveyDeliveryMode(body.deliveryMode);
    const classroomId =
      typeof body.classroomId === "string" && body.classroomId.trim().length > 0
        ? body.classroomId.trim()
        : null;
    const requestedLanguage = isAppLocale(body.language) ? body.language : null;
    const workspaceSettings = activeOrgId
      ? await getWorkspaceLocaleSettings(activeOrgId)
      : null;
    const language = await resolveUiLocaleForContentCreation({
      explicitLocale: requestedLanguage,
      session,
      workspaceId: activeOrgId,
    });

    if (deliveryMode === "classroom_assigned" && !classroomId) {
      return NextResponse.json(
        { error: "Class-linked surveys must target a classroom." },
        { status: 400 },
      );
    }

    if (classroomId && !activeOrgId) {
      return NextResponse.json(
        { error: "Class-linked surveys can only be created inside a workspace." },
        { status: 400 },
      );
    }

    if (
      activeOrgId &&
      requestedLanguage &&
      workspaceSettings &&
      !workspaceSettings.allowedLocales.includes(requestedLanguage)
    ) {
      return NextResponse.json(
        { error: "That language is not enabled for the active workspace." },
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

    if (
      classroomAccess &&
      activeOrgId &&
      classroomAccess.organizationId !== activeOrgId
    ) {
      return NextResponse.json(
        { error: "The selected classroom does not belong to the active workspace." },
        { status: 400 },
      );
    }

    const existingSurveys = await getDb()
      .select({ id: surveys.id, isVoice: surveys.isVoice })
      .from(surveys)
      .where(
        activeOrgId
          ? eq(surveys.organizationId, activeOrgId)
          : and(eq(surveys.userId, session.user.id), isNull(surveys.organizationId)),
      );

    const isVoice = typeof body.isVoice === "boolean" ? body.isVoice : false;
    if (existingSurveys.length >= 5) {
      return NextResponse.json(
        { error: `Limit reached: You can only have 5 surveys per ${activeOrgId ? "workspace" : "personal account"}` },
        { status: 403 },
      );
    }
    if (isVoice && existingSurveys.filter((item) => item.isVoice).length >= 2) {
      return NextResponse.json(
        { error: `Limit reached: You can only have 2 voice surveys per ${activeOrgId ? "workspace" : "personal account"}` },
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
          organizationId: activeOrgId,
          departmentId: classroomAccess?.departmentId ?? null,
          classroomId: classroomAccess?.id ?? null,
          deliveryMode,
          title:
            deliveryMode === "classroom_assigned"
              ? `Untitled ${classroomAccess?.title ?? "Classroom"} Survey`
              : "Untitled Education Study",
          status: "creating",
          language,
          isVoice,
          participantLimit: 50,
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

      if (activeOrgId && inserted) {
        await recordRealtimeEvent(tx, {
          scope: "workspace",
          workspaceId: activeOrgId,
          eventType: "workspace.survey_created",
          actorId: session.user.id,
          payload: {
            workspaceId: activeOrgId,
            survey: {
              id: inserted.id,
              title: inserted.title,
              status: inserted.status,
              deliveryMode: inserted.deliveryMode,
              classroomId: inserted.classroomId,
              userId: inserted.userId,
              isVoice: inserted.isVoice,
              createdAt: inserted.createdAt?.toISOString() ?? now.toISOString(),
            },
          },
        });
      }
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
    if (error instanceof Error && (error.message === "UNAUTHENTICATED" || error.message === "EMAIL_NOT_VERIFIED")) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("Error creating survey:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
