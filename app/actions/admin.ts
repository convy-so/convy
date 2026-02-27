"use server";

import { db } from "@/db";
import { users, sessions } from "@/db/schema/auth";
import { usageLogs } from "@/db/schema/billing";
import { surveys } from "@/db/schema/surveys";
import { sql, eq, gte, desc, count, sum } from "drizzle-orm";
import { isAdmin } from "@/lib/auth/admin";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

/**
 * Helper to check admin access in server actions.
 * Throws an error if the user is not an admin.
 */
async function checkAdmin() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session || !isAdmin(session.user)) {
    throw new Error("Unauthorized: Admin access required");
  }

  return session;
}

/**
 * Fetch high-level statistics for the admin dashboard overview.
 */
export async function getAdminStats() {
  await checkAdmin();

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
    db.select({ count: count() }).from(users),
    db.select({ count: count() }).from(surveys),
    db.select({ total: sum(usageLogs.cost) }).from(usageLogs),
    db
      .select({ count: count() })
      .from(sessions)
      .where(gte(sessions.expiresAt, now)),
    db
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
export async function getUserGrowthData() {
  await checkAdmin();

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Group by date using SQL to handle different DB dialects (Postgres here)
  const results = await db.execute(sql`
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
export async function getUsageCostData() {
  await checkAdmin();

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const results = await db.execute(sql`
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
export async function getUsageTypeBreakdown() {
  await checkAdmin();

  const results = await db
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
export async function getSurveysForFeedback(page = 1, limit = 20) {
  await checkAdmin();

  const offset = (page - 1) * limit;

  return db.query.surveys.findMany({
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
export async function getSurveyReviewDetails(surveyId: string) {
  await checkAdmin();

  const survey = await db.query.surveys.findFirst({
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
export async function submitSurveyFeedback(surveyId: string, feedback: string) {
  await checkAdmin();

  await db
    .update(surveys)
    .set({
      improvementFeedback: feedback,
      updatedAt: new Date(),
    })
    .where(eq(surveys.id, surveyId));

  revalidatePath(`/admin/surveys/${surveyId}`);
  revalidatePath("/admin/surveys");

  return { success: true };
}
