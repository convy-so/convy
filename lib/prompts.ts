import "server-only";

/**
 * Prompt templates for different AI tasks in the survey application
 */

export interface SurveyConfig {
  goal: string;
  type: string;
  information: string;
  requiredQuestions: string[];
  metrics: string[];
}

/**
 * System prompt for sample conversation generation
 */
export function getSampleConversationSystemPrompt(
  config: SurveyConfig,
  feedback?: string,
  conversationNumber?: number
): string {
  const basePrompt = getSurveyConversationSystemPrompt(config);
  const iterationNote =
    conversationNumber && conversationNumber > 1
      ? `\n- This is rehearsal conversation #${conversationNumber}. Adjust your tone and pacing based on previous feedback.`
      : "";

  const feedbackSection = feedback
    ? `\n- Apply the survey creator's latest feedback precisely:\n${feedback}`
    : "";

  return `${basePrompt}

Additional guidance for this rehearsal with the survey creator:
- Treat the survey creator exactly like a participant so they can experience the real flow
- After covering every required topic, wrap up politely just as you would with a participant${iterationNote}${feedbackSection}`;
}

/**
 * System prompt for actual survey conversations with users
 */
export function getSurveyConversationSystemPrompt(
  config: SurveyConfig
): string {
  return `You are conducting a ${config.type} survey. Your goal is to have a natural, conversational interview with the participant.

Survey Goal: ${config.goal}

Information to Collect: ${config.information}

Required Questions (these must be covered naturally in the conversation):
${config.requiredQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

${config.metrics.length > 0 ? `Metrics to track: ${config.metrics.join(", ")}` : ""}

Instructions:
- Conduct the conversation naturally, like a friendly interviewer
- Don't ask questions in a rigid, survey-like manner
- Cover all required questions organically during the conversation
- Be conversational and engaging
- Ask follow-up questions based on the participant's responses
- Make the participant feel comfortable and heard
- Keep track of which required questions have been covered
- When you've covered all required questions and gathered sufficient information, you can naturally conclude the conversation

Remember: This is a real conversation, not a script. Adapt to the participant's responses and maintain a natural flow.`;
}

/**
 * Prompt for generating conversation summary
 */
export function getConversationSummaryPrompt(
  conversation: Array<{ role: "user" | "assistant"; content: string }>,
  config: SurveyConfig
): string {
  const conversationText = conversation
    .map(
      (msg) =>
        `${msg.role === "user" ? "Participant" : "Interviewer"}: ${msg.content}`
    )
    .join("\n\n");

  return `Analyze the following conversation from a ${config.type} survey and provide a comprehensive summary.

Survey Goal: ${config.goal}
Information to Collect: ${config.information}
Required Questions: ${config.requiredQuestions.join(", ")}

Conversation:
${conversationText}

Please provide:
1. A brief summary of the conversation (2-3 sentences)
2. Key information gathered from the participant
3. Which required questions were covered and what the participant's responses were
4. Any notable insights or patterns
5. Whether the conversation successfully achieved the survey goal

Format your response as a structured summary.`;
}

/**
 * Prompt for generating conversation insights
 */
export function getConversationInsightsPrompt(
  conversation: Array<{ role: "user" | "assistant"; content: string }>,
  config: SurveyConfig
): string {
  const conversationText = conversation
    .map(
      (msg) =>
        `${msg.role === "user" ? "Participant" : "Interviewer"}: ${msg.content}`
    )
    .join("\n\n");

  return `Analyze the following conversation and extract structured insights.

Survey Goal: ${config.goal}
Metrics to Track: ${config.metrics.length > 0 ? config.metrics.join(", ") : "General insights"}

Conversation:
${conversationText}

Please provide:
1. Key findings from this conversation
2. Answers to the required questions: ${config.requiredQuestions.join(", ")}
3. ${config.metrics.length > 0 ? `Metrics extracted: ${config.metrics.map((m) => `- ${m}`).join("\n")}` : "General insights and patterns"}
4. Sentiment and tone of the participant
5. Any concerns or issues raised

Format your response as structured insights that can be used for analysis.`;
}

/**
 * Prompt for generating overall survey analytics
 */
export function getOverallAnalyticsPrompt(
  conversations: Array<{
    id: string;
    summary: string;
    insights: string;
  }>,
  config: SurveyConfig
): string {
  const conversationsData = conversations
    .map(
      (conv, i) =>
        `Conversation ${i + 1}:\nSummary: ${conv.summary}\nInsights: ${conv.insights}`
    )
    .join("\n\n---\n\n");

  return `Analyze all the survey conversations and generate overall analytics and insights.

Survey Goal: ${config.goal}
Survey Type: ${config.type}
Information to Collect: ${config.information}
Required Questions: ${config.requiredQuestions.join(", ")}
Metrics to Track: ${config.metrics.length > 0 ? config.metrics.join(", ") : "General patterns"}

Conversations Data:
${conversationsData}

Please provide:
1. Overall summary of all conversations (comprehensive overview)
2. Common patterns and trends across all participants
3. ${config.metrics.length > 0 ? `Aggregated metrics: ${config.metrics.map((m) => `- ${m}`).join("\n")}` : "Key insights and patterns"}
4. Answers to required questions aggregated across all conversations
5. Notable outliers or unique responses
6. Recommendations or conclusions based on the data

Format your response as a comprehensive analytics report.`;
}
