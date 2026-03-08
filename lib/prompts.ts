import {
  type SurveyLanguage,
  type SurveyExtractionData,
  type SurveyMedia,
  type CollectedInfoFlags,
} from "./types/survey-flow";
import { type ToneProfile } from "./surveys";

export interface SurveyConfig {
  id: string;
  information: string;
  requiredQuestions: string[];
  metrics: string[];
  language?: SurveyLanguage;
  expertState?: SurveyExtractionData;
  coreObjective?: string;
  tone?: ToneProfile;
  media?: SurveyMedia[];
  personalInfo?: string[];
  domainId?: number;
  improvementFeedback?: string;
  subjectModelComplete?: boolean;
  collectedInfo?: CollectedInfoFlags;
}

export type CollectedInfo = Record<string, boolean>;

export function getSurveyDataExtractionPrompt(
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>,
): string {
  const conversationText = conversationHistory
    .map((msg) => `${msg.role === "user" ? "User" : "AI"}: ${msg.content}`)
    .join("\n\n");

  return `<task>
Extract structured survey configuration from the conversation below.
Return ONLY valid JSON. No markdown, no explanation.
</task>

<conversation>
${conversationText}
</conversation>

<few_shot_examples>
Example 1 - Complete extraction:
Conversation: "User: I need to survey patients about our new telehealth app. AI: Great! What do you want to learn? User: Why they're not using video visits. We think it's a tech barrier. AI: Who specifically? User: Elderly patients 65+ who have accounts but haven't used video. AI: How deep should we go? User: Focus on the video visit feature only, not the whole app. 10 minutes max."
Output: {"objective":{"goal":"Understand why elderly patients don't use video visits","context":"Low video visit adoption in telehealth app","decision":"Identify barriers to video visit usage","subjectDomain":"Healthcare","subjectDescription":"Telehealth app video visit feature"},"targetAudience":{"description":"Elderly patients 65+ with accounts who haven't used video","relationship":"patients","knowledgeLevel":"beginner"},"scope":{"breadthVsDepth":"deep","mainTopics":["video visit barriers","tech difficulties"],"boundaries":"Video visit feature only, not whole app"},"constraints":{"timeLimit":10},"hypotheses":{"assumptions":["Technology is the main barrier"]},"collectedInfo":{"objective":true,"targetAudience":true,"scope":true,"successCriteria":false,"constraints":true,"hypotheses":true,"subjectDefined":true,"domainIdentified":true}}

Example 2 - Incomplete (vague subject):
Conversation: "User: I want customer feedback AI: Feedback on what specifically? User: Just general feedback on our service AI: Can you tell me which service? User: Customer service overall"
Output: {"objective":{"goal":"Get feedback on service","context":null,"decision":null},"collectedInfo":{"objective":false,"targetAudience":false,"scope":false,"subjectDefined":false,"domainIdentified":false}}
</few_shot_examples>

<output_schema>
{
  "objective": {"goal":"string","context":"string|null","decision":"string|null","subjectDomain":"string|null","subjectDescription":"string"},
  "targetAudience": {"description":"string","relationship":"string","knowledgeLevel":"beginner|intermediate|expert"},
  "scope": {"breadthVsDepth":"broad|deep|balanced","mainTopics":["string"],"boundaries":"string"},
  "successCriteria": {"insightTypes":["emotional","behavioral","rational"],"detailLevel":"high|medium|low","description":"string"},
  "constraints": {"timeLimit":"number|null","sensitiveTopics":["string"],"otherConstraints":"string|null"},
  "hypotheses": {"assumptions":["string"]},
  "tone": "formal|casual|playful|empathetic|null",
  "metrics": ["string"],
  "personalInfo": ["string"],
  "title": "string - concise survey title",
  "domainId": "1-10 based on domain list",
  "isVoice": "boolean",
  "media": [
    {
      "type": "image|audio|video",
      "url": "string",
      "description": "string (e.g. 'My app logo')",
      "contextForUse": "string (e.g. 'Ask users what defects they see in the logo')",
      "id": "string"
    }
  ],
  "collectedInfo": {
    "objective": "boolean",
    "targetAudience": "boolean",
    "scope": "boolean",
    "successCriteria": "boolean",
    "constraints": "boolean",
    "hypotheses": "boolean",
    "tone": "boolean",
    "requiredQuestions": "boolean",
    "metrics": "boolean",
    "personalInfo": "boolean",
    "subjectDefined": "boolean",
    "domainIdentified": "boolean",
    "media": "boolean"
  }
}
</output_schema>

<validation_rules>
Mark collected as TRUE only when criteria are fully met:

REQUIRED (need specific data):
- subjectDefined: TRUE only if user EXPLICITLY stated concrete product/service (e.g., "our mobile banking app", "the checkout flow"). FALSE for vague terms like "product", "service", "app".
- domainIdentified: TRUE only if clearly fits one domain (1-10).
- objective: TRUE only if goal is specific (>10 chars) AND context explains why AND decision is stated.
- targetAudience: TRUE only if who (>5 chars) AND relationship AND knowledge level are clear.
- scope: TRUE only if breadth/depth preference AND at least 1 topic AND boundaries defined.

OPTIONAL (need to be ASKED, not necessarily answered):
- tone/metrics/personalInfo/media/additionalContext: TRUE if AI asked AND user responded (even if declined).
- hypotheses: TRUE if discussed (can be false if not mentioned).

When in doubt, mark FALSE.
</validation_rules>

<domains>
1=CX, 2=Market Research, 3=Workforce, 5=Education, 6=Civic, 7=Scientific, 9=Demographic, 10=Infrastructure
</domains>`;
}

/**
 * JSON schema for survey data extraction response
 */
export const surveyDataExtractionSchema = {
  type: "object",
  properties: {
    objective: {
      type: "object",
      properties: {
        goal: { type: "string" },
        context: { type: "string" },
        decision: { type: "string" },
        subjectDomain: { type: "string" },
        subjectDescription: { type: "string" },
      },
      required: ["goal", "context", "decision"],
    },
    targetAudience: {
      type: "object",
      properties: {
        description: { type: "string" },
        relationship: { type: "string" },
        knowledgeLevel: { type: "string" },
      },
      required: ["description", "relationship", "knowledgeLevel"],
    },
    scope: {
      type: "object",
      properties: {
        breadthVsDepth: { type: "string", enum: ["broad", "deep", "balanced"] },
        mainTopics: { type: "array", items: { type: "string" } },
        boundaries: { type: "string" },
      },
      required: ["breadthVsDepth", "mainTopics", "boundaries"],
    },
    successCriteria: {
      type: "object",
      properties: {
        insightTypes: {
          type: "array",
          items: {
            type: "string",
            enum: ["emotional", "behavioral", "rational"],
          },
        },
        detailLevel: { type: "string", enum: ["high", "medium", "low"] },
        description: { type: "string" },
      },
      required: ["insightTypes", "detailLevel", "description"],
    },
    constraints: {
      type: "object",
      properties: {
        timeLimit: { type: ["number", "null"] },
        sensitiveTopics: { type: "array", items: { type: "string" } },
        otherConstraints: { type: "string" },
      },
      required: ["sensitiveTopics", "otherConstraints"],
    },
    hypotheses: {
      type: ["object", "null"],
      properties: {
        assumptions: { type: "array", items: { type: "string" } },
      },
    },
    tone: {
      type: ["string", "null"],
      enum: ["formal", "casual", "playful", "empathetic", null],
    },
    metrics: { type: ["array", "null"], items: { type: "string" } },
    personalInfo: { type: ["array", "null"], items: { type: "string" } },
    title: { type: "string" },
    domainId: { type: "number" },
    isVoice: { type: "boolean" },
    collectedInfo: {
      type: "object",
      properties: {
        objective: { type: "boolean" },
        targetAudience: { type: "boolean" },
        scope: { type: "boolean" },
        successCriteria: { type: "boolean" },
        constraints: { type: "boolean" },
        hypotheses: { type: "boolean" },
        tone: { type: "boolean" },
        requiredQuestions: { type: "boolean" },
        metrics: { type: "boolean" },
        personalInfo: { type: "boolean" },
        subjectDefined: { type: "boolean" },
        domainIdentified: { type: "boolean" },
        media: { type: "boolean" },
      },
      required: [
        "objective",
        "targetAudience",
        "scope",
        "successCriteria",
        "constraints",
        "hypotheses",
        "tone",
        "requiredQuestions",
        "metrics",
        "personalInfo",
        "subjectDefined",
        "domainIdentified",
      ],
    },
  },
  required: ["collectedInfo", "title"],
} as const;

export function getSampleConversationInsightsPrompt(
  conversation: Array<{ role: "user" | "assistant"; content: string }>,
  config: SurveyConfig,
): string {
  const conversationText = conversation
    .map(
      (msg) =>
        `${msg.role === "user" ? "Survey Maker (as participant)" : "AI Interviewer"}: ${msg.content}`,
    )
    .join("\n\n");

  return `Analyze this sample survey conversation and provide insights for the survey maker.
 
 SURVEY CONFIGURATION:
 - Goal: ${config.coreObjective || config.expertState?.objective?.goal || config.information}
 - Information to collect: ${config.information}
 - Required questions: ${config.requiredQuestions.length > 0 ? config.requiredQuestions.join(", ") : "None specified"}
 ${config.metrics.length > 0 ? `- Metrics to track: ${config.metrics.join(", ")}` : ""}
 ${config.tone ? `- Intended tone: ${config.tone}` : ""}
 
 SAMPLE CONVERSATION:
${conversationText}

Provide a detailed analysis including:

1. SUMMARY: Brief overview of how the conversation went (2-3 sentences)

2. KEY FINDINGS: What information was successfully gathered?

3. COVERED TOPICS: Which required questions/topics were addressed?

4. MISSED TOPICS: Which required questions/topics were NOT adequately covered?

5. SUGGESTED IMPROVEMENTS: Specific recommendations to improve the conversation flow, such as:
   - Questions that felt awkward or unnatural
   - Topics that need more depth
   - Transitions that could be smoother
   - Tone adjustments needed

6. TONE ASSESSMENT: Did the conversation match the intended tone? Any adjustments needed?

Format your response as a structured analysis that helps the survey maker refine their survey.`;
}

/**
 * JSON schema for sample conversation insights
 */
export const sampleConversationInsightsSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    keyFindings: { type: "array", items: { type: "string" } },
    coveredTopics: { type: "array", items: { type: "string" } },
    missedTopics: { type: "array", items: { type: "string" } },
    suggestedImprovements: { type: "array", items: { type: "string" } },
    toneAssessment: { type: "string" },
  },
  required: [
    "summary",
    "keyFindings",
    "coveredTopics",
    "missedTopics",
    "suggestedImprovements",
  ],
} as const;

/**
 * Prompt for asking feedback at the end of sample conversation
 */
export function getSampleConversationFeedbackPrompt(
  conversationNumber: number,
  remainingConversations: number,
): string {
  const isLastSample = remainingConversations === 0;

  if (isLastSample) {
    return `This was your final sample conversation (${conversationNumber} of 3).

Please share any final thoughts:
1. Are there things you think should be added to the conversation?
2. Is there something that should be emphasized more?
3. Any other comments about the conversation flow?

After your feedback, you can confirm the survey to generate your shareable link, or you can make adjustments to the survey configuration before confirming.`;
  }

  return `This was sample conversation #${conversationNumber}. You have ${remainingConversations} more sample${remainingConversations > 1 ? "s" : ""} available.

Please share your feedback:
1. Are there things you think should be added to the conversation?
2. Is there something that should be emphasized more?
3. Any other comments about how the AI conducted the interview?

Your feedback will be incorporated into the next sample conversation, or you can confirm the survey now if you're satisfied.`;
}
