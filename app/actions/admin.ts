"use server";

import { getDb } from "@/shared/db";
import { users, sessions } from "@/shared/db/schema/auth";
import { usageLogs } from "@/shared/db/schema/billing";
import { surveys, surveyCreationConversations, surveyBriefs } from "@/shared/db/schema/surveys";
import { platformFeedback } from "@/shared/db/schema/feedback";
import { classroomStudents, classrooms, lessons, studentSessions } from "@/shared/db/schema/tutoring";
import { sql, eq, gte, desc, count, sum } from "drizzle-orm";

import { requireRole } from "@/features/auth/public-server";
import { withErrorHandling, ActionResult, UnauthorizedError, ActionError } from "@/shared/http/action-result";
import { requireValue } from "@/shared/utils/collections";

export type AdminStats = {
  totalUsers: number;
  totalSurveys: number;
  totalLessons: number;
  totalClassrooms: number;
  totalStudentSessions: number;
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

function getDateLabel(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return "";
}

// Runtime mappers for raw SQL execute() results.
// getDb().execute() always returns Record<string, unknown>[] for rows regardless
// of the sql<T> generic â€” the generic is only used by the Drizzle query builder,
// not by execute(). These mappers safely extract and coerce each field.
function toUserGrowthData(rows: Record<string, unknown>[]): UserGrowthData[] {
  return rows.map((row) => ({
    date: getDateLabel(row.date),
    count: typeof row.count === "number" ? row.count : Number(row.count ?? 0),
  }));
}

function toUsageCostData(rows: Record<string, unknown>[]): UsageCostData[] {
  return rows.map((row) => ({
    date: getDateLabel(row.date),
    cost: typeof row.cost === "number" ? row.cost : Number(row.cost ?? 0),
  }));
}

async function checkAdmin(authHeaders?: Headers | string | null) {
  try {
    const session = await requireRole("admin", authHeaders);
    return { email: session.user.email };
  } catch {
    throw new UnauthorizedError("Admin access required");
  }
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
      totalLessons,
      totalClassrooms,
      totalStudentSessions,
      totalUsageCost,
      activeSessions,
      newUsersLast30Days,
    ] = await Promise.all([
      getDb().select({ count: count() }).from(users),
      getDb().select({ count: count() }).from(surveys),
      getDb().select({ count: count() }).from(lessons),
      getDb().select({ count: count() }).from(classrooms),
      getDb().select({ count: count() }).from(studentSessions),
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
    const totalUsersRow = requireValue(totalUsers[0], "Missing total users aggregate.");
    const totalSurveysRow = requireValue(totalSurveys[0], "Missing total surveys aggregate.");
    const totalLessonsRow = requireValue(totalLessons[0], "Missing total lessons aggregate.");
    const totalClassroomsRow = requireValue(totalClassrooms[0], "Missing total classrooms aggregate.");
    const totalStudentSessionsRow = requireValue(
      totalStudentSessions[0],
      "Missing total student sessions aggregate.",
    );
    const totalUsageCostRow = requireValue(totalUsageCost[0], "Missing usage cost aggregate.");
    const activeSessionsRow = requireValue(activeSessions[0], "Missing active sessions aggregate.");
    const newUsersLast30DaysRow = requireValue(
      newUsersLast30Days[0],
      "Missing new users aggregate.",
    );

    return {
      success: true,
      data: {
        totalUsers: totalUsersRow.count,
        totalSurveys: totalSurveysRow.count,
        totalLessons: totalLessonsRow.count,
        totalClassrooms: totalClassroomsRow.count,
        totalStudentSessions: totalStudentSessionsRow.count,
        totalUsageCost: totalUsageCostRow.total || "0",
        activeSessions: activeSessionsRow.count,
        newUsersLast30Days: newUsersLast30DaysRow.count,
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
const VALID_FEEDBACK_STATUS_SET = new Set<string>(VALID_FEEDBACK_STATUSES);

function isValidFeedbackStatus(value: string): value is FeedbackStatus {
  return VALID_FEEDBACK_STATUS_SET.has(value);
}

export async function updatePlatformFeedbackStatus(
  feedbackId: string,
  status: string,
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

