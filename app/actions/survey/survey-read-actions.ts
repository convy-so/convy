"use server";

import { eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { surveys, users } from "@/db/schema";
import {
  assertState,
  withErrorHandling,
  type ActionResult,
} from "@/lib/action-wrapper";
import { env } from "@/lib/env";

import {
  buildSurveyPublicPath,
  requireSurveyActionSession,
  requireSurveyWithPermission,
} from "./shared";

/**
 * Get all surveys for the current user
 */
export async function getSurveysAction(): Promise<
  ActionResult<
    Array<{
      id: string;
      title: string;
      status: string;
      createdAt: Date;
      currentParticipants: number;
      participantLimit: number;
      shareableLink: string | null;
      deliveryMode: string;
      classroomId: string | null;
      folderId: string | null;
      classroomTitle: string | null;
      creatorName: string | null;
      isOwner: boolean;
      isVoice: boolean;
      accessLevel: "owner" | "none";
      canOpen: boolean;
      canEdit: boolean;
    }>
  >
> {
  return withErrorHandling(async () => {
    const session = await requireSurveyActionSession();
    const personalSurveys = await getDb()
      .select({
        id: surveys.id,
        title: surveys.title,
        status: surveys.status,
        createdAt: surveys.createdAt,
        currentParticipants: surveys.currentParticipants,
        participantLimit: surveys.participantLimit,
        shareableLink: surveys.shareableLink,
        deliveryMode: surveys.deliveryMode,
        classroomId: surveys.classroomId,
        folderId: surveys.folderId,
        creatorName: users.name,
        isOwner: sql<boolean>`${surveys.userId} = ${session.user.id}`,
        isVoice: surveys.isVoice,
        classroomTitle: sql<string | null>`null`,
      })
      .from(surveys)
      .leftJoin(users, eq(surveys.userId, users.id))
      .where(eq(surveys.userId, session.user.id))
      .orderBy(surveys.createdAt);

    return {
      success: true,
      data: personalSurveys.map((survey) => ({
        ...survey,
        accessLevel: "owner",
        canOpen: true,
        canEdit: true,
      })),
    };
  }, "getSurveysAction");
}

/**
 * Get a single survey by ID
 */
export async function getSurveyAction(
  surveyId: string,
): Promise<ActionResult<typeof surveys.$inferSelect>> {
  return withErrorHandling(async () => {
    const session = await requireSurveyActionSession();
    const { survey } = await requireSurveyWithPermission({
      session,
      surveyId,
      capability: "canView",
      message: "Unauthorized",
    });

    return { success: true, data: survey };
  }, "getSurveyAction");
}

/**
 * Get the shareable link for a survey
 */
export async function getShareableLinkAction(
  surveyId: string,
): Promise<
  ActionResult<{ shareableLink: string; publicUrl: string; isActive: boolean }>
> {
  return withErrorHandling(async () => {
    const session = await requireSurveyActionSession();
    const { survey } = await requireSurveyWithPermission({
      session,
      surveyId,
      capability: "canView",
      message: "Unauthorized",
    });

    assertState(!!survey.shareableLink, "Survey does not have a shareable link yet");

    return {
      success: true,
      data: {
        shareableLink: survey.shareableLink,
        publicUrl: buildSurveyPublicPath(survey.shareableLink),
        isActive: survey.status === "active",
      },
    };
  }, "getShareableLinkAction");
}

/**
 * Get public URLs for a survey (default random link + optional custom slug)
 */
export async function getSurveyPublicUrlsAction(
  surveyId: string,
): Promise<
  ActionResult<{
    shareableLink: string | null;
    shareableUrl: string | null;
    customSlug: string | null;
    customUrl: string | null;
  }>
> {
  return withErrorHandling(async () => {
    const session = await requireSurveyActionSession();
    const { survey } = await requireSurveyWithPermission({
      session,
      surveyId,
      capability: "canView",
      message: "Unauthorized",
    });

    const baseUrl = env.APP_BASE_URL.replace(/\/+$/, "");

    return {
      success: true,
      data: {
        shareableLink: survey.shareableLink ?? null,
        shareableUrl: survey.shareableLink
          ? `${baseUrl}${buildSurveyPublicPath(survey.shareableLink)}`
          : null,
        customSlug: survey.customSlug ?? null,
        customUrl: survey.customSlug
          ? `${baseUrl}${buildSurveyPublicPath(survey.customSlug)}`
          : null,
      },
    };
  }, "getSurveyPublicUrlsAction");
}
