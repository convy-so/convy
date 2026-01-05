/**
 * Zapier REST Hook Samples Endpoint
 * 
 * This endpoint provides sample data for Zapier triggers.
 * Zapier calls this to show users what data will be available when setting up a Zap.
 */

import { NextRequest, NextResponse } from "next/server";
import { getVerifiedSession } from "@/lib/auth/session";

type TriggerType = "survey_created" | "new_conversation" | "analytics_updated";

/**
 * Generate sample data for a trigger type
 */
function getSampleData(trigger: TriggerType) {
  switch (trigger) {
    case "survey_created":
      return {
        id: "sample_survey_id",
        title: "Customer Satisfaction Survey",
        status: "active",
        language: "en",
        participantLimit: 100,
        currentParticipants: 0,
        objective: {
          goal: "Understand customer satisfaction with our product",
          context: "We want to gather feedback from recent customers",
          decision: "Product improvements",
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

    case "new_conversation":
      return {
        id: "sample_conversation_id",
        surveyId: "sample_survey_id",
        surveyTitle: "Customer Satisfaction Survey",
        participantId: "participant_123",
        rawConversation: [
          {
            role: "user",
            content: "I really like the new feature!",
            timestamp: new Date().toISOString(),
          },
          {
            role: "assistant",
            content: "That's great to hear! Can you tell me more about what you liked?",
            timestamp: new Date().toISOString(),
          },
        ],
        summary: "Participant expressed positive feedback about new feature",
        completed: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

    case "analytics_updated":
      return {
        id: "sample_analytics_id",
        surveyId: "sample_survey_id",
        surveyTitle: "Customer Satisfaction Survey",
        overallSummary:
          "Overall, customers are satisfied with the product. Key themes include positive feedback on new features and requests for additional functionality.",
        totalConversations: 45,
        averageConversationLength: 8,
        metrics: {
          satisfaction_score: 4.2,
          completion_rate: 0.85,
          top_themes: ["Feature requests", "Positive feedback", "Bug reports"],
        },
        lastUpdated: new Date().toISOString(),
      };

    default:
      return null;
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ trigger: string }> }
) {
  try {
    await getVerifiedSession(); // Verify user is authenticated

    const { trigger } = await params;

    const validTriggers: TriggerType[] = [
      "survey_created",
      "new_conversation",
      "analytics_updated",
    ];

    if (!validTriggers.includes(trigger as TriggerType)) {
      return NextResponse.json(
        {
          status: "error",
          message: `Invalid trigger. Must be one of: ${validTriggers.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const sampleData = getSampleData(trigger as TriggerType);

    if (!sampleData) {
      return NextResponse.json(
        {
          status: "error",
          message: "Failed to generate sample data",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      status: "success",
      data: sampleData,
    });
  } catch (error) {
    console.error("Zapier samples error:", error);
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Failed to get samples",
      },
      { status: 500 }
    );
  }
}

