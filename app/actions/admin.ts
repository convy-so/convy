"use server";

import { getDb } from "@/db";
import { users, sessions } from "@/db/schema/auth";
import { usageLogs } from "@/db/schema/billing";
import { surveys } from "@/db/schema/surveys";
import { sql, eq, gte, desc, count, sum } from "drizzle-orm";
import { isAdmin } from "@/lib/auth/admin";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { getRedisClient } from "@/lib/redis";
import { env } from "@/lib/env";

/**
 * Helper to check admin access in server actions.
 * Throws an error if the user is not an admin.
 */
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
  const match = cookieStr.match(/admin_session=([^;]+)/);
  if (!match) {
    throw new Error("Unauthorized: Admin access required");
  }

  const token = match[1];
  const redis = getRedisClient();
  const email = await redis.get(`admin_session:${token}`);

  if (!email || !env.ADMIN_EMAILS.includes(email)) {
    throw new Error("Unauthorized: Admin access required");
  }

  return { email };
}

/**
 * Fetch high-level statistics for the admin dashboard overview.
 */
export async function getAdminStats(authHeaders?: Headers | string | null) {
  await checkAdmin(authHeaders);

  const now = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(now.getDate() - 30);

  const [
    totalUsers,
    totalSurveys,
    totalUsageCost,
    activeSessions,
    newUsersLast30Days,
  ] = await Promise.all([
    getDb().select({ count: count() }).from(users),
    getDb().select({ count: count() }).from(surveys),
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
    totalUsers: totalUsers[0].count,
    totalSurveys: totalSurveys[0].count,
    totalUsageCost: totalUsageCost[0].total || "0",
    activeSessions: activeSessions[0].count,
    newUsersLast30Days: newUsersLast30Days[0].count,
  };
}

/**
 * Fetch user growth metrics (new users per day) for the last 30 days.
 */
export async function getUserGrowthData(authHeaders?: Headers | string | null) {
  await checkAdmin(authHeaders);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Group by date using SQL to handle different DB dialects (Postgres here)
  const results = await getDb().execute(sql`
    SELECT 
      DATE(created_at) as date,
      COUNT(*)::int as count
    FROM users
    WHERE created_at >= ${thirtyDaysAgo}
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `);

  return results as unknown as Array<{ date: string; count: number }>;
}

/**
 * Fetch usage cost data per day for the last 30 days.
 */
export async function getUsageCostData(authHeaders?: Headers | string | null) {
  await checkAdmin(authHeaders);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const results = await getDb().execute(sql`
    SELECT 
      DATE(created_at) as date,
      SUM(cost)::double precision as cost
    FROM usage_logs
    WHERE created_at >= ${thirtyDaysAgo}
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `);

  return results as unknown as Array<{ date: string; cost: number }>;
}

/**
 * Fetch usage breakdown by type.
 */
export async function getUsageTypeBreakdown(authHeaders?: Headers | string | null) {
  await checkAdmin(authHeaders);

  const results = await getDb()
    .select({
      type: usageLogs.type,
      totalCost: sum(usageLogs.cost),
      count: count(),
    })
    .from(usageLogs)
    .groupBy(usageLogs.type);

  return results;
}

/**
 * List surveys for expert feedback, ordered by creation date.
 */
export async function getSurveysForFeedback(
  authHeaders?: Headers | string | null,
  page = 1,
  limit = 20,
) {
  await checkAdmin(authHeaders);

  const offset = (page - 1) * limit;

  return getDb().query.surveys.findMany({
    orderBy: [desc(surveys.createdAt)],
    limit,
    offset,
    with: {
      user: true,
    },
  });
}

/**
 * Get a single survey with its full creation context for review.
 */
export async function getSurveyReviewDetails(
  surveyId: string,
  authHeaders?: Headers | string | null,
) {
  await checkAdmin(authHeaders);

  const survey = await getDb().query.surveys.findFirst({
    where: eq(surveys.id, surveyId),
    with: {
      user: true,
      creationConversation: true,
      analytics: true,
    },
  });

  return survey;
}

/**
 * Submit expert improvement feedback for a survey.
 */
export async function submitSurveyFeedback(
  surveyId: string,
  feedback: string,
  authHeaders?: Headers | string | null,
) {
  await checkAdmin(authHeaders);

  await getDb()
    .update(surveys)
    .set({
      improvementFeedback: feedback,
      updatedAt: new Date(),
    })
    .where(eq(surveys.id, surveyId));

  revalidatePath(`/5Yeo2xyqejRrN9bhz8FqWRPITkRXGZEM4Yma2eV3UI/surveys/${surveyId}`);
  revalidatePath("/5Yeo2xyqejRrN9bhz8FqWRPITkRXGZEM4Yma2eV3UI/surveys");

  return { success: true };
}
