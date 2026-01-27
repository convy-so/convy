import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { streamText, stepCountIs } from "ai";

import { db } from "@/db";
import { surveys, surveyConversations } from "@/db/schema";
import { ConversationManager } from "@/lib/conversation-manager";
import { buildCompleteSurveyConfig } from "@/lib/surveys";
import { defaultModel } from "@/lib/ai";

const model = defaultModel; // Use consistent model

/**
 * GET - Initialize a survey response conversation
 */
export async function GET(
    request: Request,
    { params }: { params: Promise<{ shareableLink: string }> }
) {
    try {
        const { shareableLink } = await params;

        // Get survey by shareable link
        const [survey] = await db
            .select({
                id: surveys.id,
                title: surveys.title,
                objective: surveys.objective,
                targetAudience: surveys.targetAudience,
                tone: surveys.tone,
                status: surveys.status,
                currentParticipants: surveys.currentParticipants,
                participantLimit: surveys.participantLimit,
                requiredQuestions: surveys.requiredQuestions,
                scope: surveys.scope,
                isVoice: surveys.isVoice,
                media: surveys.media,
            })
            .from(surveys)
            .where(eq(surveys.shareableLink, shareableLink));

        if (!survey) {
            return NextResponse.json({ error: "Survey not found" }, { status: 404 });
        }

        if (survey.status !== "active") {
            return NextResponse.json({ error: "Survey is not active" }, { status: 403 });
        }

        if (survey.currentParticipants >= survey.participantLimit) {
            return NextResponse.json({ error: "Survey has reached its participant limit" }, { status: 403 });
        }

        // Create new conversation record
        const conversationId = nanoid();
        const participantId = nanoid(8);

        await db.insert(surveyConversations).values({
            id: conversationId,
            surveyId: survey.id,
            participantId,
            rawConversation: [],
            completed: false,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        return NextResponse.json({
            survey: {
                id: survey.id,
                title: survey.title,
                objective: survey.objective,
                targetAudience: survey.targetAudience,
                tone: survey.tone,
                requiredQuestions: survey.requiredQuestions || [],
                isVoice: survey.isVoice,
                media: survey.media,
            },
            conversationId,
            participantId,
        });
    } catch (error) {
        console.error("Error initializing survey response:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

/**
 * POST - Handle survey conversation messages
 */
export async function POST(
    req: Request,
    { params }: { params: Promise<{ shareableLink: string }> }
) {
    try {
        const { messages, context } = await req.json();
        const { shareableLink } = await params;

        // Fetch survey by shareable link
        const [survey] = await db
            .select()
            .from(surveys)
            .where(eq(surveys.shareableLink, shareableLink))
            .limit(1);

        if (!survey) {
            return NextResponse.json({ error: "Survey not found" }, { status: 404 });
        }

        // Get or create conversation (simplified logic for this route - assumes context has what we need or we find by other means if needed. 
        // Actually the context usually contains conversationId if we are continuing.
        // But for this simplified route, we might rely on the client passing it or just creating a new one implicitly for the stream.
        // Re-using existing logic below:
        const conversationId = context?.conversationId;

        if (!conversationId) {
            return NextResponse.json({ error: "Conversation ID is required" }, { status: 400 });
        }

        // Prepare survey config
        const surveyConfig = buildCompleteSurveyConfig(survey);

        // Load conversation context (handling hydration, compression, signals)
        const rollingContext = await ConversationManager.loadOrCreateContext(
            conversationId,
            messages,
            surveyConfig
        );

        const systemPrompt = ConversationManager.getSystemPrompt(surveyConfig, rollingContext);

        // Define tools but don't use side-channel callback for media since we'll receive it in tool results
        const tools = ConversationManager.getTools(surveyConfig, () => {
             // Side-effect callback not needed for data stream writing here
        });

        // Stream the AI response
        const result = streamText({
            model: defaultModel,
            system: systemPrompt,
            messages: messages.map((m: any) => ({
                role: m.role,
                content: m.content,
            })),
            tools,
            stopWhen: stepCountIs(5), // Allow tool execution (and thus media display)
            temperature: 0.7,
            maxOutputTokens: 400,
            onFinish: async ({ text, toolCalls }) => {
                // Save conversation to database
                const updatedMessages = [
                    ...messages,
                    { role: "assistant" as const, content: text, timestamp: new Date().toISOString() }
                ];

                // Update memory in background (learning)
                ConversationManager.updateMemoryAsync(
                    conversationId,
                    updatedMessages,
                    surveyConfig,
                    rollingContext
                ).catch(err => console.error("Background memory update failed:", err));

                // Check if survey is complete
                const isCompletionPhrase = text.toLowerCase().includes("thank you for completing") ||
                    text.toLowerCase().includes("survey is now complete") ||
                    text.toLowerCase().includes("your feedback is incredibly valuable");

                // Only mark complete if we have a reasonable amount of interaction (e.g. at least 3 user messages)
                const userMessages = messages.filter((m: any) => m.role === "user");
                const minQuestions = Math.max((survey.requiredQuestions as any[])?.length || 0, 3);
                const isCompleted = isCompletionPhrase && userMessages.length >= minQuestions;

                if (conversationId) {
                    await db
                    .update(surveyConversations)
                    .set({
                        rawConversation: updatedMessages.map(m => ({
                            ...m,
                            timestamp: (m as any).timestamp || new Date().toISOString()
                        })),
                        completed: isCompleted,
                        updatedAt: new Date(),
                    })
                    .where(eq(surveyConversations.id, conversationId));
                }

                // Increment participant count if completed
                if (isCompleted) {
                    await db
                        .update(surveys)
                        .set({
                            currentParticipants: (survey.currentParticipants || 0) + 1,
                            updatedAt: new Date(),
                        })
                        .where(eq(surveys.id, survey.id));
                }
            },
        });

        return result.toUIMessageStreamResponse();
    } catch (error) {
        console.error("Error in survey response:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
