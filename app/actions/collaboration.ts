"use server";

import { z } from "zod";
import { eq, and, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "@/db";
import { surveys, surveyCreationComments, users } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { getSurveyAccessLevel } from "@/lib/workspace-access";
import { getRedisClient } from "@/lib/redis";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

const collaboratorSchema = z.object({
  surveyId: z.string().min(1),
  userIdToGrant: z.string().min(1),
});

export async function grantEditAccessAction(
  input: z.infer<typeof collaboratorSchema>,
): Promise<ActionResult<void>> {
  try {
    const session = await getVerifiedSession();
    const body = collaboratorSchema.parse(input);

    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, body.surveyId));

    if (!survey) return { success: false, error: "Survey not found" };

    if (survey.userId !== session.user.id) {
      return { success: false, error: "Only the creator can grant access" };
    }

    const currentCollaborators = survey.collaborators || [];
    if (!currentCollaborators.includes(body.userIdToGrant)) {
      await getDb()
        .update(surveys)
        .set({ collaborators: [...currentCollaborators, body.userIdToGrant] })
        .where(eq(surveys.id, body.surveyId));
    }

    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: "Failed to grant access" };
  }
}

export async function revokeEditAccessAction(
  input: z.infer<typeof collaboratorSchema>,
): Promise<ActionResult<void>> {
  try {
    const session = await getVerifiedSession();
    const body = collaboratorSchema.parse(input);

    const [survey] = await getDb()
      .select()
      .from(surveys)
      .where(eq(surveys.id, body.surveyId));

    if (!survey) return { success: false, error: "Survey not found" };

    if (survey.userId !== session.user.id) {
      return { success: false, error: "Only the creator can revoke access" };
    }

    const currentCollaborators = survey.collaborators || [];
    const newCollaborators = currentCollaborators.filter(
      (id) => id !== body.userIdToGrant,
    );

    await getDb()
      .update(surveys)
      .set({ collaborators: newCollaborators })
      .where(eq(surveys.id, body.surveyId));

    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: "Failed to revoke access" };
  }
}

const commentSchema = z.object({
  surveyId: z.string().min(1),
  text: z.string().min(1),
});

export async function postCreationCommentAction(
  input: z.infer<typeof commentSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await getVerifiedSession();
    const body = commentSchema.parse(input);

    const access = await getSurveyAccessLevel(session.user.id, body.surveyId);
    if (access === "none") {
      return { success: false, error: "Unauthorized" };
    }

    const commentId = nanoid();
    await getDb().insert(surveyCreationComments).values({
      id: commentId,
      surveyId: body.surveyId,
      userId: session.user.id,
      text: body.text,
    });

    return { success: true, data: { id: commentId } };
  } catch (error) {
    return { success: false, error: "Failed to post comment" };
  }
}

export async function getCreationCommentsAction(surveyId: string): Promise<
  ActionResult<
    Array<{
      id: string;
      text: string;
      createdAt: Date;
      user: { name: string; email: string };
    }>
  >
> {
  try {
    const session = await getVerifiedSession();

    const access = await getSurveyAccessLevel(session.user.id, surveyId);
    if (access === "none") {
      return { success: false, error: "Unauthorized" };
    }

    const commentsList = await getDb()
      .select({
        id: surveyCreationComments.id,
        text: surveyCreationComments.text,
        createdAt: surveyCreationComments.createdAt,
        user: {
          name: users.name,
          email: users.email,
        },
      })
      .from(surveyCreationComments)
      .innerJoin(users, eq(surveyCreationComments.userId, users.id))
      .where(eq(surveyCreationComments.surveyId, surveyId))
      .orderBy(surveyCreationComments.createdAt);

    return { success: true, data: commentsList };
  } catch (error) {
    return { success: false, error: "Failed to fetch comments" };
  }
}

export async function updatePresenceAction(
  surveyId: string,
): Promise<ActionResult<{ activeUsers: Array<{ id: string; name: string }> }>> {
  try {
    const session = await getVerifiedSession();
    const access = await getSurveyAccessLevel(session.user.id, surveyId);
    if (access === "none") return { success: false, error: "Unauthorized" };

    const presenceKey = `survey_presence:${surveyId}`;
    const userField = session.user.id;

    const redis = getRedisClient();
    if (redis) {
      // Update this user's heartbeat
      await redis.hset(presenceKey, {
        [userField]: JSON.stringify({
          name: session.user.name,
          lastSeen: Date.now(),
        }),
      });
      await redis.expire(presenceKey, 60); // 60 seconds expiry for the whole hash

      // Fetch active users
      const allData = await redis.hgetall(presenceKey);
      const activeUsers: Array<{ id: string; name: string }> = [];
      const now = Date.now();

      if (allData) {
        for (const [id, dataStr] of Object.entries(allData)) {
          const data =
            typeof dataStr === "string" ? JSON.parse(dataStr) : dataStr;
          // If seen in the last 30 seconds
          if (now - (data.lastSeen || 0) < 30000) {
            activeUsers.push({ id, name: data.name });
          } else {
            // Cleanup stale data
            await redis.hdel(presenceKey, id);
          }
        }
      }
      return { success: true, data: { activeUsers } };
    }

    return { success: true, data: { activeUsers: [] } };
  } catch (error) {
    return { success: false, error: "Failed to update presence" };
  }
}
