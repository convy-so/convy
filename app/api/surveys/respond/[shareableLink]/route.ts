import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { streamText, generateText, convertToModelMessages, type UIMessage, stepCountIs, createUIMessageStream, createUIMessageStreamResponse } from "ai";

import { db } from "@/db";
import { surveys, surveyConversations } from "@/db/schema";
import { ConversationManager } from "@/lib/conversation-manager";
import { buildCompleteSurveyConfig } from "@/lib/surveys";
import { selectModelForConversation, flashModel, flashLiteModel } from "@/lib/ai";
import { getTimeBasedGreeting } from "@/lib/greetings";

const model = flashLiteModel;  // Default to lite for greetings

/**
 * GET - Initialize a survey response conversation and generate AI greeting
 */
export async function GET(
    request: Request,
    { params }: { params: Promise<{ shareableLink: string }> }
) {
    try {
        const { shareableLink } = await params;
        const { searchParams } = new URL(request.url);
        const existingConversationId = searchParams.get('conversationId');
        const languageParam = searchParams.get('language');
        const language = (['en', 'fr', 'de', 'es', 'it'].includes(languageParam || '')) ? languageParam as any : undefined;

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

        // Handle resumption if conversationId is provided
        if (existingConversationId) {
            const [existingConversation] = await db
                .select()
                .from(surveyConversations)
                .where(eq(surveyConversations.id, existingConversationId));

            if (existingConversation && existingConversation.surveyId === survey.id) {
                // If already completed, signal client
                if (existingConversation.completed) {
                    return NextResponse.json({
                        completed: true,
                        survey: {
                            title: survey.title,
                            isVoice: survey.isVoice
                        }
                    });
                }

                // If incomplete, resume
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
                    conversationId: existingConversation.id,
                    participantId: existingConversation.participantId,
                    messages: existingConversation.rawConversation || [], // Resume history
                });
            }
        }

        if (survey.currentParticipants >= survey.participantLimit) {
            return NextResponse.json({ error: "Survey has reached its participant limit" }, { status: 403 });
        }

        // Create new conversation record
        const conversationId = nanoid();
        const participantId = nanoid(8);

        // Generate initial greeting message
        const greetingMessage = {
            id: nanoid(),
            role: 'assistant' as const,
            content: getTimeBasedGreeting('response', language || survey.language || 'en'),
            timestamp: new Date().toISOString()
        };

        // Create new conversation record with greeting
        await db.insert(surveyConversations).values({
            id: conversationId,
            surveyId: survey.id,
            participantId,
            rawConversation: [greetingMessage],
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
            messages: [greetingMessage],
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
        const { messages, context, language } = body;
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

        const conversationId = context?.conversationId || body.conversationId;

        if (!conversationId) {
            return NextResponse.json({ error: "Conversation ID is required" }, { status: 400 });
        }

        // Check if survey is active (unless resuming an existing valid conversation)
        // For new messages in an existing conversation, we generally allow completion unless strictly paused?
        // Let's enforce pause check for all interactions to be safe, or just for new ones?
        // The requirement is "when you pause... no more participants who can participate... resume or max is reached".
        // Use stricter check: if paused, no interaction allowed.
        if (survey.status !== "active") {
             // Optional: Allow reading history but not sending new messages?
             // For now, strict block on POST implies no new messages.
             return NextResponse.json({ error: "Survey is not active" }, { status: 403 });
        }

        // Check participant limit (though usually checked at creation, good to double check or if strictly enforced)
        if (survey.currentParticipants >= survey.participantLimit) {
            // Check if this specific conversation is already counted (i.e. completed)
             // If this conversation is NOT completed, they are "in progress" and should be allowed to finish?
             // "until... max is reached". Usually implies new starts are blocked. 
             // Existing participants should probably be allowed to finish to avoid bad UX.
             // We'll skip strict limit check here for existing conversations to allow completion.
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

        const systemPrompt = ConversationManager.getSystemPrompt(surveyConfig, rollingContext, { language });

        // Define tools but don't use side-channel callback for media since we'll receive it in tool results
        const tools = ConversationManager.getTools(surveyConfig, () => {
             // Side-effect callback not needed for data stream writing here
        });

        // Intelligent model selection: use flash for media/completion, flash-lite for conversation
        const userMessages = modelMessages.filter((m: any) => m.role === "user");
        const minQuestions = Math.max((survey.requiredQuestions as any[])?.length || 0, 3);
        const hasMedia = (survey.media as any[])?.length > 0;
        const selectedModel = selectModelForConversation(
            rollingContext, 
            userMessages.length, 
            minQuestions,
            hasMedia
        );
        
        // DEBUG: Log model selection
        console.log(`[HTTP Chat Model] Using:`, selectedModel === flashModel ? 'flash' : 'flash-lite');
        console.log(`[HTTP Chat Tools Debug] Available tools:`, Object.keys(tools));

        const stream = createUIMessageStream({
            execute: async ({ writer }) => {
                // Stream the AI response
                const result = streamText({
                    model: selectedModel,  // Use dynamically selected model
                    system: systemPrompt,
                    messages: modelMessages,
                    tools,
                    toolChoice: 'auto',  // Explicitly allow model to choose tools
                    stopWhen: stepCountIs(5), // Allow tool execution (and thus media display)
                    temperature: 0.7,
                    maxOutputTokens: 1000,  // Increased to allow AI to complete thought and call finishSurvey tool
                    onFinish: async ({ text, toolCalls, toolResults, steps }) => {
                        // Enhanced debugging
                        console.log(`[HTTP Chat Tools Debug] Steps:`, steps?.length || 0);
                        console.log(`[HTTP Chat Tools Debug] Tool Results:`, JSON.stringify(toolResults, null, 2));
                        
                        // Save conversation to database
                        const updatedMessages = [
                            ...modelMessages,
                            { role: "assistant" as const, content: text, toolCalls }
                        ];
        
                        // EXTENSIVE LOGGING for debugging
                        console.log(`[HTTP Chat Debug] Conversation ${conversationId}:`);
                        console.log(`  - AI Response Length: ${text.length} characters`);
                        console.log(`  - AI Response Preview: "${text.substring(0, 200)}..."`);
                        console.log(`  - Tool Calls Received:`, JSON.stringify(toolCalls, null, 2));
                        console.log(`  - Number of Tool Calls:`, toolCalls?.length || 0);
        
                        // Update memory in background (learning)
                        ConversationManager.updateMemoryAsync(
                            conversationId,
                            updatedMessages,
                            surveyConfig,
                            rollingContext
                        ).catch(err => console.error("Background memory update failed:", err));
        
                        // Check if AI called finishSurvey tool (primary detection method)
                        // Check all steps because the tool call might happen in an earlier step
                        const finishSurveyCall = steps.flatMap(step => step.toolCalls).find(call => 
                            call.toolName === 'finishSurvey'
                        ) || toolCalls?.find((call: any) => 
                            call.toolName === 'finishSurvey'
                        );
        
                        // Also keep string-based detection as fallback
                        const isCompletionPhrase = text.toLowerCase().includes("thank you for completing") ||
                            text.toLowerCase().includes("survey is now complete") ||
                            text.toLowerCase().includes("your feedback is incredibly valuable");
        
                        // Only mark complete if we have a reasonable amount of interaction (e.g. at least 3 user messages)
                        const hasToolCompletion = !!finishSurveyCall;
                        const userMessages = modelMessages.filter((m: any) => m.role === "user");
                        const minQuestions = Math.max((survey.requiredQuestions as any[])?.length || 0, 3);
                        const isCompleted = (hasToolCompletion || isCompletionPhrase) && userMessages.length >= minQuestions;
        
                        // Diagnostic logging for completion detection
                        console.log(`[HTTP Chat Completion] ${conversationId}:`, {
                            hasToolCompletion,
                            isCompletionPhrase,
                            userMessageCount: userMessages.length,
                            minQuestions,
                            willComplete: isCompleted
                        });
        
                        if (conversationId) {
                            // Normalize messages for DB storage (simple role/content strings + timestamps)
                            const dbMessages = ConversationManager.normalizeMessages(updatedMessages, surveyConfig).map(m => ({
                                ...m,
                                timestamp: new Date().toISOString()
                            }));
        
                            await db
                            .update(surveyConversations)
                            .set({
                                rawConversation: dbMessages,
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
                            
                            // Enqueue insights generation (CRITICAL FIX)
                            try {
                                const { enqueueConversationInsights } = await import("@/lib/queue");
                                await enqueueConversationInsights({
                                    conversationId,
                                    surveyId: survey.id,
                                    userId: survey.userId,
                                });
                                console.log(`[HTTP Chat] Enqueued insights for ${conversationId}`);
                            } catch (error) {
                                console.error("[HTTP Chat] Failed to enqueue insights:", error);
                            }
                            
                            // Signal completion via stream data
                            writer.write({
                                type: 'data',
                                data: { isCompleted: true }
                            } as any);
                        }
                    },
                });

                writer.merge(result.toUIMessageStream());
            }
        });

        return createUIMessageStreamResponse({ stream });
    } catch (error) {
        console.error("Error in survey response:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
