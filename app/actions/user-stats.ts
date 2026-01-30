"use server";

import { db } from "@/db";
import { surveys } from "@/db/schema";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { eq, sql } from "drizzle-orm";

export async function getUserStats(): Promise<{ 
    success: true; 
    data: { 
        totalSurveys: number; 
        totalResponses: number; 
        recentSurveys: any[]; 
    } 
} | { 
    success: false; 
    error: string; 
}> {
    try {
        const session = await auth.api.getSession({ headers: await headers() });
        if (!session) return { success: false, error: "Unauthorized" };

        const userId = session.user.id;

        const [stats] = await db
            .select({
                totalSurveys: sql<number>`count(*)`,
                totalResponses: sql<number>`sum(${surveys.currentParticipants})`,
            })
            .from(surveys)
            .where(eq(surveys.userId, userId));

        const recentSurveys = await db.query.surveys.findMany({
            where: eq(surveys.userId, userId),
            orderBy: (surveys, { desc }) => [desc(surveys.createdAt)],
            limit: 3,
        });

        return {
            success: true,
            data: {
                totalSurveys: Number(stats?.totalSurveys || 0),
                totalResponses: Number(stats?.totalResponses || 0),
                recentSurveys,
            },
        };
    } catch (error) {
        console.error("Error getting user stats:", error);
        return { success: false, error: "Failed to fetch stats" };
    }
}

