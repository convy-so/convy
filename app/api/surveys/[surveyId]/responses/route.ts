import { eq, desc } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { surveys, surveyConversations } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";

/**
 * GET - Get all responses for a survey
 */
export async function GET(
    request: Request,
    { params }: { params: Promise<{ surveyId: string }> }
) {
    try {
        const session = await getVerifiedSession();
        const { surveyId } = await params;

        // Verify ownership
        const [survey] = await db
            .select({ userId: surveys.userId })
            .from(surveys)
            .where(eq(surveys.id, surveyId));

        if (!survey) {
            return NextResponse.json({ error: "Survey not found" }, { status: 404 });
        }

        if (survey.userId !== session.user.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        // Get all responses
        const responses = await db
            .select()
            .from(surveyConversations)
            .where(eq(surveyConversations.surveyId, surveyId))
            .orderBy(desc(surveyConversations.createdAt));

        // Format responses for frontend
        const formattedResponses = responses.map(r => {
            const messages = r.rawConversation as Array<{ role: string; content: string; timestamp?: string }>;
            const messageCount = messages?.length || 0;
            
            // Calculate duration from first to last message
            let duration = "N/A";
            if (messages && messages.length >= 2) {
                const firstTimestamp = messages[0]?.timestamp;
                const lastTimestamp = messages[messages.length - 1]?.timestamp;
                if (firstTimestamp && lastTimestamp) {
                    const durationMs = new Date(lastTimestamp).getTime() - new Date(firstTimestamp).getTime();
                    const minutes = Math.floor(durationMs / 60000);
                    const seconds = Math.floor((durationMs % 60000) / 1000);
                    duration = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                }
            }

            // Simple sentiment analysis based on keywords
            let sentiment: "positive" | "neutral" | "negative" | null = null;
            if (r.completed && messages) {
                const allText = messages
                    .filter(m => m.role === "user")
                    .map(m => m.content.toLowerCase())
                    .join(" ");
                
                const positiveWords = ["great", "love", "excellent", "amazing", "good", "happy", "satisfied", "helpful", "wonderful", "best"];
                const negativeWords = ["bad", "terrible", "awful", "hate", "poor", "frustrated", "disappointed", "unhappy", "worst", "issue"];
                
                const positiveCount = positiveWords.filter(w => allText.includes(w)).length;
                const negativeCount = negativeWords.filter(w => allText.includes(w)).length;
                
                if (positiveCount > negativeCount) sentiment = "positive";
                else if (negativeCount > positiveCount) sentiment = "negative";
                else sentiment = "neutral";
            }

            // Extract key insights (user messages excerpts)
            const keyInsights = messages
                ?.filter(m => m.role === "user")
                .slice(0, 3)
                .map(m => m.content.slice(0, 50) + (m.content.length > 50 ? "..." : ""))
                || [];

            return {
                id: r.id,
                participantId: r.participantId || "Anonymous",
                status: r.completed ? "completed" : "abandoned",
                completedAt: r.updatedAt?.toISOString() || null,
                createdAt: r.createdAt?.toISOString() || null,
                duration,
                sentiment,
                keyInsights,
                messageCount,
            };
        });

        return NextResponse.json({ responses: formattedResponses });
    } catch (error) {
        if (error instanceof Error) {
            if (error.message === "UNAUTHENTICATED" || error.message === "EMAIL_NOT_VERIFIED") {
                return NextResponse.json({ error: error.message }, { status: 401 });
            }
        }
        console.error("Error fetching survey responses:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
