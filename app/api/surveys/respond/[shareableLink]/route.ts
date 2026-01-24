import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { streamText } from "ai";
import { google } from "@ai-sdk/google";

import { db } from "@/db";
import { surveys, surveyConversations } from "@/db/schema";

const model = google("gemini-2.0-flash-001");

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
    request: Request,
    { params }: { params: Promise<{ shareableLink: string }> }
) {
    try {
        const { shareableLink } = await params;
        const body = await request.json();
        const { conversationId, messages } = body as {
            conversationId: string;
            messages: Array<{ role: "user" | "assistant"; content: string }>;
        };

        // Get survey configuration
        const [survey] = await db
            .select()
            .from(surveys)
            .where(eq(surveys.shareableLink, shareableLink));

        if (!survey || survey.status !== "active") {
            return NextResponse.json({ error: "Survey not available" }, { status: 404 });
        }

        // Verify conversation exists
        const [conversation] = await db
            .select()
            .from(surveyConversations)
            .where(eq(surveyConversations.id, conversationId));

        if (!conversation) {
            return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
        }

        // Build survey context for AI
        const objective = (survey.objective as any)?.description || "gather feedback";
        const targetAudience = (survey.targetAudience as any)?.description || "general users";
        const tone = survey.tone || "friendly";
        const requiredQuestions = survey.requiredQuestions || [];
        const scope = (survey.scope as any)?.mainTopics || [];
        
        // Count user responses
        const userMessages = messages.filter(m => m.role === "user");
        const userMessageCount = userMessages.length;
        
        // Build question tracking instructions
        const questionList = requiredQuestions.length > 0 
            ? requiredQuestions.map((q: string, i: number) => `Q${i + 1}: "${q}"`).join('\n')
            : '';
        
        const totalQuestions = requiredQuestions.length;
        const minQuestionsNeeded = Math.max(totalQuestions, 3); // At least 3 questions or all required

        const systemPrompt = `You are a friendly AI survey interviewer conducting a conversational survey. Your job is to ask ALL the required questions and gather meaningful responses.

=== SURVEY INFORMATION ===
Title: ${survey.title}
Objective: ${objective}
Target Audience: ${targetAudience}
Conversation Style: ${tone}
${scope.length > 0 ? `Topics to cover: ${scope.join(', ')}` : ''}

=== REQUIRED QUESTIONS (YOU MUST ASK ALL OF THESE) ===
${questionList || 'No specific questions - ask about their general experience and feedback.'}

Total required questions: ${totalQuestions || 'At least 3-5 questions about the topic'}

=== CRITICAL INSTRUCTIONS ===
1. YOU MUST ASK ALL ${totalQuestions || 3} REQUIRED QUESTIONS before ending the survey
2. Ask ONE question at a time - wait for the user to respond before asking the next
3. You can rephrase questions naturally to fit the conversation flow, but the CORE MEANING must be preserved
4. Track which questions you've already asked - DO NOT repeat questions
5. After EACH user response, acknowledge their answer briefly, then ask the NEXT required question
6. Follow up on interesting points briefly, but always return to the required questions
7. Be conversational and ${tone} - make it feel like a natural chat, not an interrogation

=== QUESTION TRACKING ===
User has responded ${userMessageCount} times so far.
${userMessageCount < totalQuestions 
    ? `You still need to ask ${totalQuestions - userMessageCount} more required questions. DO NOT end the survey yet.`
    : userMessageCount >= totalQuestions 
        ? 'All questions have likely been asked. You may wrap up the survey now.'
        : ''}

=== ENDING THE SURVEY ===
ONLY when ALL required questions have been asked and answered (minimum ${minQuestionsNeeded} exchanges), end with:
"Thank you for completing this survey! Your feedback is incredibly valuable."

DO NOT end the survey prematurely. If you haven't asked all questions, continue asking.

=== RESPONSE FORMAT ===
- Keep responses concise (2-3 sentences max)
- Show genuine interest in their answers
- Transition naturally between questions
- NEVER ask multiple questions in one message`;

        // Stream the AI response
        const result = streamText({
            model,
            system: systemPrompt,
            messages: messages.map(m => ({
                role: m.role,
                content: m.content,
            })),
            temperature: 0.7,
            maxTokens: 400,
            onFinish: async ({ text }) => {
                // Save conversation to database
                const updatedMessages = [
                    ...messages,
                    { role: "assistant" as const, content: text, timestamp: new Date().toISOString() }
                ];

                // Check if survey is complete
                const isCompletionPhrase = text.toLowerCase().includes("thank you for completing") ||
                    text.toLowerCase().includes("survey is now complete") ||
                    text.toLowerCase().includes("your feedback is incredibly valuable");
                
                // Only mark complete if user has answered enough questions
                const isCompleted = isCompletionPhrase && userMessageCount >= minQuestionsNeeded;

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

                // Increment participant count if completed
                if (isCompleted) {
                    await db
                        .update(surveys)
                        .set({
                            currentParticipants: survey.currentParticipants + 1,
                            updatedAt: new Date(),
                        })
                        .where(eq(surveys.id, survey.id));
                }
            },
        });

        return result.toTextStreamResponse();
    } catch (error) {
        console.error("Error in survey response:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
