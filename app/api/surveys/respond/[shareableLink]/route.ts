import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { streamText, generateText, convertToModelMessages, type UIMessage, stepCountIs, createUIMessageStream, createUIMessageStreamResponse } from "ai";

import { db } from "@/db";
import { surveys, surveyConversations } from "@/db/schema";
import { ConversationManager } from "@/lib/conversation-manager";
import { buildCompleteSurveyConfig } from "@/lib/surveys";
import { selectModelForConversation, flashModel, flashLiteModel } from "@/lib/ai";

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
            [],
            surveyConfig,
            true 
        );

        // Generate the AI's opening greeting
        const systemPrompt = ConversationManager.getSystemPrompt(surveyConfig, initialContext);

        const greetingResult = await generateText({
            model: flashLiteModel,  // Use lite for simple greeting
            system: systemPrompt,
            prompt: "Start the conversation by greeting the participant warmly. Introduce yourself as the interviewer, briefly explain what this survey is about based on your instructions, and ask your first opening question to get the conversation started. Keep it concise and welcoming.",
            temperature: 0.8,
            maxOutputTokens: 600,  // Increased to allow natural greeting flow
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

        // Intelligent model selection: use flash-lite for conversation, flash for completion
        const userMessages = modelMessages.filter((m: any) => m.role === "user");
        const minQuestions = Math.max((survey.requiredQuestions as any[])?.length || 0, 3);
        const selectedModel = selectModelForConversation(rollingContext, userMessages.length, minQuestions);
        
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
