"use server";

import { getDb } from "@/db";
import { users, sessions } from "@/db/schema/auth";
import { usageLogs } from "@/db/schema/billing";
import { surveys, surveyCreationConversations, surveyBriefs } from "@/db/schema/surveys";
import { platformFeedback } from "@/db/schema/feedback";
import { classroomStudents, classrooms, learningTopics, learningSessions } from "@/db/schema/learning";
import { sql, eq, gte, desc, count, sum } from "drizzle-orm";
import { headers } from "next/headers";

import { resolveAdminSessionEmail } from "@/lib/admin/session";
import { withErrorHandling, ActionResult, UnauthorizedError, ActionError } from "@/lib/action-wrapper";

export type AdminStats = {
  totalUsers: number;
  totalSurveys: number;
  totalTopics: number;
  totalClassrooms: number;
  totalLearningSessions: number;
  totalUsageCost: string;
  activeSessions: number;
  newUsersLast30Days: number;
};

export type UserGrowthData = {
  date: string;
  count: number;
};

export type UsageCostData = {
  date: string;
  cost: number;
};

export type UsageTypeBreakdown = {
  type: string | null;
  totalCost: string | null;
  count: number;
};

export type SurveyWithUser = {
  id: string;
  title: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    name: string | null;
    email: string;
  };
};

export type PlatformFeedbackItem = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  submitterRole: string;
  kind: string;
  sourceArea: string;
  status: string;
  subject: string;
  message: string;
  contactEmail: string | null;
  // The DB column is jsonb which can be null; the type must reflect that.
  metadata: Record<string, unknown> | null;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  classroomStudentId: string | null;
  classroomStudentName: string | null;
  classroomStudentEmail: string | null;
};

// Shape of a survey fetched with its related user, creation conversation, and brief.
// Derived from Drizzle's $inferSelect so it always stays in sync with the schema.
export type SurveyReviewDetails = (typeof surveys)["$inferSelect"] & {
  user: (typeof users)["$inferSelect"] | null;
  creationConversation: (typeof surveyCreationConversations)["$inferSelect"] | null;
  brief: (typeof surveyBriefs)["$inferSelect"] | null;
};

// Runtime mappers for raw SQL execute() results.
// getDb().execute() always returns Record<string, unknown>[] for rows regardless
// of the sql<T> generic — the generic is only used by the Drizzle query builder,
// not by execute(). These mappers safely extract and coerce each field.
function toUserGrowthData(rows: Record<string, unknown>[]): UserGrowthData[] {
  return rows.map((row) => ({
    date: typeof row.date === "string" ? row.date : String(row.date ?? ""),
    count: typeof row.count === "number" ? row.count : Number(row.count ?? 0),
  }));
}

function toUsageCostData(rows: Record<string, unknown>[]): UsageCostData[] {
  return rows.map((row) => ({
    date: typeof row.date === "string" ? row.date : String(row.date ?? ""),
    cost: typeof row.cost === "number" ? row.cost : Number(row.cost ?? 0),
  }));
}

async function checkAdmin(authHeaders?: Headers | string | null) {
  let finalHeaders: Headers;

  if (authHeaders instanceof Headers) {
    finalHeaders = authHeaders;
  } else if (typeof authHeaders === "string") {
    finalHeaders = new Headers();
    finalHeaders.append("cookie", authHeaders);
  } else {
    finalHeaders = await headers();
  }

  const cookieStr = finalHeaders.get("cookie") || "";
  const email = await resolveAdminSessionEmail(cookieStr);
  if (!email) {
    throw new UnauthorizedError("Admin access required");
  }

  return { email };
}

export async function getAdminStats(authHeaders?: Headers | string | null): Promise<ActionResult<AdminStats>> {
  return withErrorHandling(async () => {
    await checkAdmin(authHeaders);

    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(now.getDate() - 30);

    const [
      totalUsers,
      totalSurveys,
      totalTopics,
      totalClassrooms,
      totalLearningSessions,
      totalUsageCost,
      activeSessions,
      newUsersLast30Days,
    ] = await Promise.all([
      getDb().select({ count: count() }).from(users),
      getDb().select({ count: count() }).from(surveys),
      getDb().select({ count: count() }).from(learningTopics),
      getDb().select({ count: count() }).from(classrooms),
      getDb().select({ count: count() }).from(learningSessions),
      getDb().select({ total: sum(usageLogs.cost) }).from(usageLogs),
      getDb()
        .select({ count: count() })
        .from(sessions)
        .where(gte(sessions.expiresAt, now)),
      getDb()
        .select({ count: count() })
        .from(users)
        .where(gte(users.createdAt, thirtyDaysAgo)),
    ]);

    return {
      success: true,
      data: {
        totalUsers: totalUsers[0].count,
        totalSurveys: totalSurveys[0].count,
        totalTopics: totalTopics[0].count,
        totalClassrooms: totalClassrooms[0].count,
        totalLearningSessions: totalLearningSessions[0].count,
        totalUsageCost: totalUsageCost[0].total || "0",
        activeSessions: activeSessions[0].count,
        newUsersLast30Days: newUsersLast30Days[0].count,
      }
    };
  }, "getAdminStats");
}

export async function getUserGrowthData(authHeaders?: Headers | string | null): Promise<ActionResult<UserGrowthData[]>> {
  return withErrorHandling(async () => {
    await checkAdmin(authHeaders);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const results = await getDb().execute(
      sql<{ date: string; count: number }>`
      SELECT
        DATE(created_at) as date,
        COUNT(*)::int as count
      FROM users
      WHERE created_at >= ${thirtyDaysAgo}
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `,
    );
    return { success: true, data: toUserGrowthData(results.rows) };
  }, "getUserGrowthData");
}

export async function getUsageCostData(authHeaders?: Headers | string | null): Promise<ActionResult<UsageCostData[]>> {
  return withErrorHandling(async () => {
    await checkAdmin(authHeaders);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const results = await getDb().execute(
      sql<{ date: string; cost: number }>`
      SELECT
        DATE(created_at) as date,
        SUM(cost)::double precision as cost
      FROM usage_logs
      WHERE created_at >= ${thirtyDaysAgo}
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `,
    );
    return { success: true, data: toUsageCostData(results.rows) };
  }, "getUsageCostData");
}

export async function getUsageTypeBreakdown(
  authHeaders?: Headers | string | null,
): Promise<ActionResult<UsageTypeBreakdown[]>> {
  return withErrorHandling(async () => {
    await checkAdmin(authHeaders);

    const data = await getDb()
      .select({
        type: usageLogs.type,
        totalCost: sum(usageLogs.cost),
        count: count(),
      })
      .from(usageLogs)
      .groupBy(usageLogs.type);
    return { success: true, data };
  }, "getUsageTypeBreakdown");
}

export async function getSurveysForFeedback(
  authHeaders?: Headers | string | null,
  page = 1,
  limit = 20,
): Promise<ActionResult<SurveyWithUser[]>> {
  return withErrorHandling(async () => {
    await checkAdmin(authHeaders);

    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const offset = (safePage - 1) * safeLimit;

    const data = await getDb().query.surveys.findMany({
      orderBy: [desc(surveys.createdAt)],
      limit: safeLimit,
      offset,
      with: {
        user: true,
      },
    });
    return { success: true, data };
  }, "getSurveysForFeedback");
}

export async function getSurveyReviewDetails(
  surveyId: string,
  authHeaders?: Headers | string | null,
): Promise<ActionResult<SurveyReviewDetails | undefined>> {
  return withErrorHandling(async () => {
    await checkAdmin(authHeaders);

    if (!surveyId?.trim()) {
      throw new ActionError("Survey ID is required", "VALIDATION_ERROR");
    }

    const data = await getDb().query.surveys.findFirst({
      where: eq(surveys.id, surveyId),
      with: {
        user: true,
        creationConversation: true,
        brief: true,
      },
    });
    return { success: true, data };
  }, "getSurveyReviewDetails");
}

export async function getPlatformFeedbackItems(
  authHeaders?: Headers | string | null,
  status?: string,
): Promise<ActionResult<PlatformFeedbackItem[]>> {
  return withErrorHandling(async () => {
    await checkAdmin(authHeaders);

    const query = getDb()
      .select({
        id: platformFeedback.id,
        createdAt: platformFeedback.createdAt,
        updatedAt: platformFeedback.updatedAt,
        submitterRole: platformFeedback.submitterRole,
        kind: platformFeedback.kind,
        sourceArea: platformFeedback.sourceArea,
        status: platformFeedback.status,
        subject: platformFeedback.subject,
        message: platformFeedback.message,
        contactEmail: platformFeedback.contactEmail,
        metadata: platformFeedback.metadata,
        userId: platformFeedback.userId,
        userName: users.name,
        userEmail: users.email,
        classroomStudentId: platformFeedback.classroomStudentId,
        classroomStudentName: classroomStudents.fullName,
        classroomStudentEmail: classroomStudents.email,
      })
      .from(platformFeedback)
      .leftJoin(users, eq(users.id, platformFeedback.userId))
      .leftJoin(
        classroomStudents,
        eq(classroomStudents.id, platformFeedback.classroomStudentId),
      )
      .orderBy(desc(platformFeedback.createdAt))
      .limit(200);

    const data = status
      ? await query.where(eq(platformFeedback.status, status))
      : await query;
      
    return { success: true, data };
  }, "getPlatformFeedbackItems");
}

const VALID_FEEDBACK_STATUSES = [
  "open",
  "reviewing",
  "resolved",
  "dismissed",
] as const;
type FeedbackStatus = (typeof VALID_FEEDBACK_STATUSES)[number];

function isValidFeedbackStatus(value: string): value is FeedbackStatus {
  return VALID_FEEDBACK_STATUSES.includes(value as FeedbackStatus);
}

export async function updatePlatformFeedbackStatus(
  feedbackId: string,
  status: FeedbackStatus,
  authHeaders?: Headers | string | null,
): Promise<ActionResult<{ id: string; status: string } | null>> {
  return withErrorHandling(async () => {
    await checkAdmin(authHeaders);

    if (!feedbackId?.trim()) {
      throw new ActionError("Feedback ID is required", "VALIDATION_ERROR");
    }
    if (!isValidFeedbackStatus(status)) {
      throw new ActionError(`Invalid status: ${status}`, "VALIDATION_ERROR");
    }

    const [updated] = await getDb()
      .update(platformFeedback)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(eq(platformFeedback.id, feedbackId))
      .returning({
        id: platformFeedback.id,
        status: platformFeedback.status,
      });

    return { success: true, data: updated ?? null };
  }, "updatePlatformFeedbackStatus");
}
