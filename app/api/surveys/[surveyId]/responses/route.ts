import { eq, desc, count, and } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { surveyConversations } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { getSurveyPermissionContext } from "@/lib/workspace-access";

type ConversationMessage = {
  role: string;
  content: string;
  timestamp?: string;
};

function normalizeConversationMessages(value: unknown): ConversationMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null) {
      return [];
    }

    const role = typeof item.role === "string" ? item.role : null;
    const content = typeof item.content === "string" ? item.content : null;
    const timestamp =
      typeof item.timestamp === "string" ? item.timestamp : undefined;

    if (!role || !content) {
      return [];
    }

    return [{ role, content, timestamp }];
  });
}

/**
 * GET - Get all responses for a survey
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { surveyId } = await params;
    const { searchParams } = new URL(request.url);

    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const status = searchParams.get("status") || "all";
    const offset = (page - 1) * limit;

    const permission = await getSurveyPermissionContext(session.user.id, surveyId);
    if (!permission?.canView) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Build where clause
    const whereConditions = [eq(surveyConversations.surveyId, surveyId)];
    if (status === "completed") {
      whereConditions.push(eq(surveyConversations.completed, true));
    } else if (status === "in_progress") {
      whereConditions.push(eq(surveyConversations.completed, false));
    }

    // Get total count
    const [totalResult] = await getDb()
      .select({ count: count() })
      .from(surveyConversations)
      .where(and(...whereConditions));

    const total = totalResult?.count || 0;

    // Get paginated responses
    const responses = await getDb()
      .select()
      .from(surveyConversations)
      .where(and(...whereConditions))
      .orderBy(desc(surveyConversations.createdAt))
      .limit(limit)
      .offset(offset);

    // Format responses for frontend
    const formattedResponses = responses.map((r) => {
      const messages = normalizeConversationMessages(r.rawConversation);
      const messageCount = messages?.length || 0;

      // Calculate duration from first to last message
      let duration = "N/A";
      if (messages && messages.length >= 2) {
        const firstTimestamp = messages[0]?.timestamp;
        const lastTimestamp = messages[messages.length - 1]?.timestamp;
        if (firstTimestamp && lastTimestamp) {
          const durationMs =
            new Date(lastTimestamp).getTime() -
            new Date(firstTimestamp).getTime();
          const minutes = Math.floor(durationMs / 60000);
          const seconds = Math.floor((durationMs % 60000) / 1000);
          duration = `${minutes}:${seconds.toString().padStart(2, "0")}`;
        }
      }

      // Simple sentiment analysis based on keywords
      let sentiment: "positive" | "neutral" | "negative" | null = null;
      if (r.completed && messages) {
        const allText = messages
          .filter((m) => m.role === "user")
          .map((m) => m.content.toLowerCase())
          .join(" ");

        const positiveWords = [
          "great",
          "love",
          "excellent",
          "amazing",
          "good",
          "happy",
          "satisfied",
          "helpful",
          "wonderful",
          "best",
        ];
        const negativeWords = [
          "bad",
          "terrible",
          "awful",
          "hate",
          "poor",
          "frustrated",
          "disappointed",
          "unhappy",
          "worst",
          "issue",
        ];

        const positiveCount = positiveWords.filter((w) =>
          allText.includes(w),
        ).length;
        const negativeCount = negativeWords.filter((w) =>
          allText.includes(w),
        ).length;

        if (positiveCount > negativeCount) sentiment = "positive";
        else if (negativeCount > positiveCount) sentiment = "negative";
        else sentiment = "neutral";
      }

      // Extract key insights (user messages excerpts)
      const keyInsights =
        messages
          ?.filter((m) => m.role === "user")
          .slice(0, 3)
          .map(
            (m) =>
              m.content.slice(0, 50) + (m.content.length > 50 ? "..." : ""),
          ) || [];

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

    return NextResponse.json({
      responses: formattedResponses,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === "UNAUTHENTICATED" ||
        error.message === "EMAIL_NOT_VERIFIED"
      ) {
        return NextResponse.json({ error: error.message }, { status: 401 });
      }
    }
    console.error("Error fetching survey responses:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
