import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { streamText, stepCountIs, generateText, convertToModelMessages, type UIMessage } from "ai";

import { db } from "@/db";
import { surveys, surveyConversations } from "@/db/schema";
import { ConversationManager } from "@/lib/conversation-manager";
import { buildCompleteSurveyConfig } from "@/lib/surveys";
import { defaultModel } from "@/lib/ai";

const model = defaultModel; // Use consistent model

/**
 * GET - Initialize a survey response conversation and generate AI greeting
 */
export async function GET(
    request: Request,
    { params }: { params: Promise<{ shareableLink: string }> }
) {
    try {
        const { shareableLink } = await params;

        // Get survey by shareable link (fetch full record for config building)
        const [survey] = await db
            .select()
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

        // Build survey config for prompt generation
        const surveyConfig = buildCompleteSurveyConfig(survey);

        // Create initial context for the greeting
        const initialContext = await ConversationManager.loadOrCreateContext(
            conversationId,
            [], // No messages yet
            surveyConfig,
            true // Force new context
        );

        // Generate the AI's opening greeting
        const systemPrompt = ConversationManager.getSystemPrompt(surveyConfig, initialContext);

        const greetingResult = await generateText({
            model: defaultModel,
            system: systemPrompt,
            prompt: "Start the conversation by greeting the participant warmly. Introduce yourself as the interviewer, briefly explain what this survey is about based on your instructions, and ask your first opening question to get the conversation started. Keep it concise and welcoming.",
            temperature: 0.8,
            maxTokens: 300,
        });

        const greetingText = greetingResult.text;
        const greetingMessage = {
            role: "assistant" as const,
            content: greetingText,
            timestamp: new Date().toISOString(),
        };

        // Save conversation with the initial greeting
        await db.insert(surveyConversations).values({
            id: conversationId,
            surveyId: survey.id,
            participantId,
            rawConversation: [greetingMessage],
            completed: false,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        // Save context to Redis for continuity
        await ConversationManager.saveContext(conversationId, initialContext);

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
            initialGreeting: greetingMessage,
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
        const body = await req.json();
        const { messages, context } = body;
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
        const conversationId = context?.conversationId || body.conversationId;

        if (!conversationId) {
            return NextResponse.json({ error: "Conversation ID is required" }, { status: 400 });
        }

        // Prepare survey config
        const surveyConfig = buildCompleteSurveyConfig(survey);

        // AI SDK v6: Convert UIMessages to ModelMessages for proper handling
        const modelMessages = await convertToModelMessages(messages as UIMessage[]);

        // Load conversation context (handling hydration, compression, signals)
        const rollingContext = await ConversationManager.loadOrCreateContext(
            conversationId,
            modelMessages,
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
            messages: modelMessages,
            tools,
            stopWhen: stepCountIs(5), // Allow tool execution (and thus media display)
            temperature: 0.7,
            maxOutputTokens: 400,
            onFinish: async ({ text, toolCalls }) => {
                // Save conversation to database
                const updatedMessages = [
                    ...modelMessages,
                    { role: "assistant" as const, content: text }
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
                const userMessages = modelMessages.filter((m: any) => m.role === "user");
                const minQuestions = Math.max((survey.requiredQuestions as any[])?.length || 0, 3);
                const isCompleted = isCompletionPhrase && userMessages.length >= minQuestions;

                if (conversationId) {
                    await db
                    .update(surveyConversations)
                    .set({
                        rawConversation: updatedMessages.map(m => ({
                            role: m.role,
                            content: m.content,
                            timestamp: new Date().toISOString()
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
