

import {
  REQUIRED_INFORMATION,
  TONE_PROFILES,
  type ToneProfile,
} from "./surveys";
// Imports removed: getDomainById, getDomainExpertise from domain-expertise-loader
import type {
  SurveyObjective,
  SurveyTargetAudience,
  SurveyScope,
  SurveySuccessCriteria,
  SurveyConstraints,
  SurveyHypotheses,
  SurveyMedia,
} from "@/db/schema";
import type {
  RollingContext,
  ConversationState,
  ParticipantStyle,
} from "./conversation-memory";



/**
 * Prompt templates for different AI tasks in the survey application
 *
 * Enhanced with:
 * - Rolling context management for long conversations
 * - Conversation state machine integration
 * - Adaptive questioning based on participant style
 * - Hypotheses-driven follow-up instructions
 * - Time/progress-aware pacing
 */

export interface SurveyConfig {
  id: string;
  information: string;
  requiredQuestions: string[];
  metrics: string[];
  language?: "en" | "fr" | "de" | "es" | "it";
  objective?: SurveyObjective;
  targetAudience?: SurveyTargetAudience;
  scope?: SurveyScope;
  successCriteria?: SurveySuccessCriteria;
  constraints?: SurveyConstraints;
  hypotheses?: SurveyHypotheses;
  tone?: ToneProfile;
  media?: SurveyMedia[];
  personalInfo?: string[];
  domainId?: number;
  improvementFeedback?: string;
  subjectModelComplete?: boolean;
}

export interface CollectedInfo {
  objective: boolean;
  targetAudience: boolean;
  scope: boolean;
  successCriteria: boolean;
  constraints: boolean;
  hypotheses: boolean;
  tone: boolean;
  requiredQuestions: boolean;
  metrics: boolean;
  personalInfo: boolean;
  subjectDefined: boolean;
  domainIdentified: boolean;
  media: boolean;
  // NEW: Has the AI built a deep model of the subject through expert questioning?
  // This must be true before standard collection (objective/scope/audience) begins.
  subjectModelComplete: boolean;
}

/**
 * System prompt for survey creation conversation
 * Optimized for Gemini 2.5 Flash with XML structure, few-shot examples, and efficient token usage
 */
// getSurveyCreationSystemPrompt removed - replaced by CreationSpecialist agent

/**
 * Prompt for extracting structured survey data from conversation
 * Enhanced with explicit JSON structure and quality criteria
 */
export function getSurveyDataExtractionPrompt(
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>
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
 * Get efficient survey creation opening prompt
 * Designed to gather multiple fields from a single open response
 */
export function getEfficientCreationOpeningPrompt(
  language: "en" | "fr" | "de" | "es" | "it" = "en"
): string {
  const openings: Record<string, string> = {
    en: `Perfect! Let's create your conversational survey together.

First, I need to know: **What specific product, service, or experience is this survey about?**

For example, it could be a mobile app, a website feature, a service process, a physical product, or anything else. Once I know what we're surveying, I'll ask about your goals and who you'll be asking.`,

    fr: `Parfait! Créons ensemble votre enquête conversationnelle.

D'abord, j'ai besoin de savoir: **De quel produit, service ou expérience spécifique s'agit cette enquête?**

Par exemple, il pourrait s'agir d'une application mobile, d'une fonctionnalité de site Web, d'un processus de service, d'un produit physique ou autre chose. Une fois que je saurai ce que nous enquêtons, je vous poserai des questions sur vos objectifs et à qui vous allez le demander.`,

    de: `Perfekt! Lassen Sie uns gemeinsam Ihre Konversationsumfrage erstellen.

Zuerst muss ich wissen: **Welches spezifische Produkt, welche Dienstleistung oder welche Erfahrung ist Gegenstand dieser Umfrage?**

Zum Beispiel könnte es eine mobile App, eine Website-Funktion, ein Serviceprozess, ein physisches Produkt oder etwas anderes sein. Sobald ich weiß, was wir befragen, werde ich nach Ihren Zielen fragen und wen Sie befragen werden.`,

    es: `¡Perfecto! Vamos a crear su encuesta conversacional juntos.

Primero, necesito saber: **¿Sobre qué producto, servicio o experiencia específica trata esta encuesta?**

Por ejemplo, podría ser una aplicación móvil, una función del sitio web, un proceso de servicio, un producto físico o cualquier otra cosa. Una vez que sepa qué estamos encuestando, le preguntaré sobre sus objetivos y a quién le preguntará.`,

    it: `Perfetto! Creiamo insieme il tuo sondaggio conversazionale.

Per prima cosa, ho bisogno di sapere: **Di quale prodotto, servizio o esperienza specifica tratta questo sondaggio?**

Ad esempio, potrebbe essere un'app mobile, una funzionalità del sito web, un processo di servizio, un prodotto fisico o qualcos'altro. Una volta che saprò cosa stiamo sondando, ti chiederò dei tuoi obiettivi e a chi lo chiederai.`,
  };

  return openings[language] || openings.en;
}

/**
 * Prompt to extract multiple fields from a single rich response
 * Used for efficient survey creation
 */
export function getMultiFieldExtractionPrompt(
  userResponse: string,
  alreadyCollected: CollectedInfo
): string {
  const fieldsToFind = [];
  if (!alreadyCollected.objective)
    fieldsToFind.push("objective (goal, context, decision)");
  if (!alreadyCollected.targetAudience)
    fieldsToFind.push("targetAudience (description, relationship, knowledge)");
  if (!alreadyCollected.scope)
    fieldsToFind.push("scope (breadth/depth, topics, boundaries)");
  if (!alreadyCollected.successCriteria)
    fieldsToFind.push("successCriteria (insight types, detail level)");
  if (!alreadyCollected.constraints)
    fieldsToFind.push("constraints (time, sensitive topics)");
  if (!alreadyCollected.hypotheses)
    fieldsToFind.push("hypotheses (assumptions to test)");
  if (!alreadyCollected.tone)
    fieldsToFind.push("tone (formal/casual/playful/empathetic)");

  return `The user said: "${userResponse}"

Extract any information related to these fields (if present):
${fieldsToFind.join("\n")}

Return a JSON object with ONLY the fields you found information for.
Include a "foundFields" array listing which fields had extractable information.
Include a "missingCritical" array listing required fields that still need clarification.
Include a "suggestedFollowUp" string with a natural follow-up question for missing info.

Example response:
{
  "objective": { "goal": "...", "context": "...", "decision": "..." },
  "targetAudience": { "description": "customers", "relationship": "buyers", "knowledgeLevel": "intermediate" },
  "foundFields": ["objective", "targetAudience"],
  "missingCritical": ["scope", "successCriteria"],
  "suggestedFollowUp": "That's really helpful! Now, do you want to cover a broad range of topics or go deep on specific areas?"
}`;
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

/**
 * System prompt for sample conversation generation
 */
// getSampleConversationSystemPrompt removed - unused

/**
 * Prompt for generating insights from a sample conversation
 * These insights help the survey maker understand how the conversation went
 */
export function getSampleConversationInsightsPrompt(
  conversation: Array<{ role: "user" | "assistant"; content: string }>,
  config: SurveyConfig
): string {
  const conversationText = conversation
    .map(
      (msg) =>
        `${msg.role === "user" ? "Survey Maker (as participant)" : "AI Interviewer"}: ${msg.content}`
    )
    .join("\n\n");

  return `Analyze this sample survey conversation and provide insights for the survey maker.

SURVEY CONFIGURATION:
- Goal: ${config.objective?.goal || "Gather feedback"}
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
  remainingConversations: number
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

/**
 * System prompt for actual survey conversations with users
 * Enhanced with:
 * - Rolling context management
 * - Conversation state awareness
 * - Adaptive questioning based on participant style
 * - Hypotheses-driven follow-ups
 * - Time/progress-aware pacing
 */
// getSurveyConversationSystemPrompt removed - unused

/**
 * Build dynamic context section from rolling context
 */
function buildDynamicContextSection(
  context: RollingContext,
  // Config reserved for future survey-specific context additions
  config: SurveyConfig
): string {
  // Use config to add survey-specific reminders
  const surveyGoal = config.objective?.goal || "Gather feedback";
  const parts: string[] = [];

  parts.push(`\n\n===== CONVERSATION CONTEXT (Updated in real-time) =====`);
  parts.push(`\nSURVEY GOAL REMINDER: ${surveyGoal}`);

  // Add conversation summary if exists
  if (context.historySummary) {
    parts.push(`\nCONVERSATION HISTORY:\n${context.historySummary}`);
  }

  // Add key facts learned
  if (context.memory.keyFactsLearned.length > 0) {
    parts.push(
      `\nKEY FACTS LEARNED FROM PARTICIPANT:\n${context.memory.keyFactsLearned.map((f) => `• ${f}`).join("\n")}`
    );
  }

  // Add topics covered (don't repeat these)
  if (context.memory.topicsCovered.length > 0) {
    parts.push(
      `\nTOPICS ALREADY COVERED (don't repeat, but can reference):\n${context.memory.topicsCovered.map((t) => `✓ ${t}`).join("\n")}`
    );
  }

  // Add remaining topics (prioritize these)
  if (context.memory.remainingRequiredTopics.length > 0) {
    parts.push(
      `\nTOPICS STILL TO COVER (prioritize these):\n${context.memory.remainingRequiredTopics.map((t) => `○ ${t}`).join("\n")}`
    );
  }

  // Add current topic
  if (context.memory.currentTopic) {
    parts.push(`\nCURRENT TOPIC: ${context.memory.currentTopic}`);
  }

  // Add unanswered questions
  if (context.memory.unansweredQuestions.length > 0) {
    parts.push(
      `\nQUESTIONS ASKED BUT NOT ANSWERED (try again gently):\n${context.memory.unansweredQuestions.map((q) => `? ${q}`).join("\n")}`
    );
  }

  // Add progress info
  parts.push(
    `\nPROGRESS: ${context.progress.completionPercentage}% complete | ${Math.round(context.progress.elapsedMinutes)} min elapsed | ${context.progress.messageCount} messages`
  );

  // Add emotional signals if detected
  if (context.memory.emotionalSignals.length > 0) {
    parts.push(
      `\nPARTICIPANT SIGNALS: ${context.memory.emotionalSignals.join(", ")}`
    );
  }

  // Add hypotheses evidence summary
  const hypothesesWithEvidence = Object.entries(
    context.memory.hypothesesEvidence
  ).filter(
    ([, evidence]) =>
      evidence.supporting.length > 0 || evidence.contradicting.length > 0
  );

  if (hypothesesWithEvidence.length > 0) {
    const evidenceLines = hypothesesWithEvidence.map(
      ([hypothesis, evidence]) => {
        const status =
          evidence.supporting.length > evidence.contradicting.length
            ? "SUPPORTED"
            : evidence.contradicting.length > evidence.supporting.length
              ? "CONTRADICTED"
              : "MIXED";
        return `• "${hypothesis.slice(0, 40)}..." → ${status} (${evidence.supporting.length}+ / ${evidence.contradicting.length}-)`;
      }
    );
    parts.push(`\nHYPOTHESES STATUS:\n${evidenceLines.join("\n")}`);
  }

  // Add wrap-up guidance if needed
  if (context.progress.shouldWrapUp) {
    parts.push(`\n⚠️ TIME TO WRAP UP: ${context.progress.wrapUpReason}
Begin transitioning to conclusion. If there are critical uncovered topics, address them briefly.
Thank the participant and provide a natural closing.`);
  }

  parts.push("\n===== END CONTEXT =====");

  return parts.join("\n");
}

/**
 * Get state-specific instructions based on conversation state
 */
function getStateSpecificInstructions(
  state: ConversationState,
  context: RollingContext
): string {
  // Add context-specific additions to state guidance
  const remainingTopics = context.memory.remainingRequiredTopics.length;
  const unexploredHypotheses = context.memory.unexploredHypotheses.length;

  const stateGuidance: Record<ConversationState, string> = {
    GREETING: `\nCURRENT STATE: GREETING
- Warmly welcome the participant
- Briefly explain what the conversation is about
- Make them feel comfortable
- Ask an easy, open-ended question to get started`,

    EXPLORING_INITIAL: `\nCURRENT STATE: INITIAL EXPLORATION
- Ask broad, exploratory questions
- Let the participant share freely
- Listen for topics to drill deeper on
- Build rapport before getting into specifics`,

    DRILLING_DEEPER: `\nCURRENT STATE: DRILLING DEEPER
- You've identified something interesting - explore it fully
- Ask "why" and "how" questions
- Request specific examples and stories
- Don't move on until you've extracted real insight`,

    COVERING_TOPIC: `\nCURRENT STATE: COVERING REQUIRED TOPIC
- Focus on covering a required topic naturally
- Ensure you get substantive answers, not surface-level responses
- Connect to what they've already shared when possible`,

    TRANSITIONING: `\nCURRENT STATE: TRANSITIONING
- Smoothly move to a new topic
- Reference something they said that connects to the new topic
- Use phrases like "That's really helpful. I'd love to hear about..." or "Speaking of that..."`,

    CHECKING_COVERAGE: `\nCURRENT STATE: CHECKING COVERAGE
- Most topics are covered - check if anything was missed
- Ask if there's anything else they'd like to share
- Look for gaps in the information collected`,

    WRAPPING_UP: `\nCURRENT STATE: WRAPPING UP
- Begin concluding the conversation
- Summarize key points if appropriate
- Ask any final critical questions briefly
- Signal that you're almost done`,

    CONCLUDING: `\nCURRENT STATE: CONCLUDING
- Thank the participant sincerely
- Acknowledge what they've shared
- End on a positive note
- Keep it brief - don't introduce new topics`,
  };

  let guidance = stateGuidance[state] || "";

  // Add context-specific reminders
  if (
    remainingTopics > 0 &&
    state !== "CONCLUDING" &&
    state !== "WRAPPING_UP"
  ) {
    guidance += `\n📌 REMINDER: ${remainingTopics} required topic(s) still to cover.`;
  }
  if (
    unexploredHypotheses > 0 &&
    state !== "CONCLUDING" &&
    state !== "WRAPPING_UP"
  ) {
    guidance += `\n📌 REMINDER: ${unexploredHypotheses} hypothesis(es) still unexplored.`;
  }

  return guidance;
}

/**
 * Get adaptive questioning instructions based on participant style
 */
function getAdaptiveQuestioningInstructions(
  style: ParticipantStyle,
  qualitySignals: RollingContext["qualitySignals"]
): string {
  const parts: string[] = [];

  parts.push(
    "\n\nADAPTIVE QUESTIONING (based on participant's communication style):"
  );

  // Style-specific guidance
  const styleGuidance: Record<ParticipantStyle, string> = {
    verbose: `PARTICIPANT STYLE: Verbose/Detailed
- They share a lot of detail - great! But stay focused.
- You can ask more specific, focused follow-ups
- Occasionally summarize what you've heard to confirm understanding
- Gently redirect if they go off-topic
- "I love the detail you're sharing. Let me make sure I understand the key point..."`,

    concise: `PARTICIPANT STYLE: Concise/Brief
- They prefer short answers - don't push too hard
- Ask more specific questions rather than open-ended ones
- Use encouraging phrases: "That's helpful. Can you give me a quick example?"
- Accept that you may need multiple questions to get depth
- Offer options: "Was it more about X or Y?"`,

    hesitant: `PARTICIPANT STYLE: Hesitant/Uncertain
- They seem unsure - be extra supportive and encouraging
- Normalize uncertainty: "That's okay, just share what comes to mind"
- Offer examples to help: "For instance, some people feel X while others feel Y..."
- Be patient and give them time to think
- Praise any sharing: "That's a great point, thank you for sharing that"`,

    neutral: `PARTICIPANT STYLE: Neutral/Balanced
- Standard conversational approach works well
- Mix open and specific questions
- Follow their lead on detail level`,
  };

  parts.push(styleGuidance[style]);

  // Add quality signal-based adjustments
  if (qualitySignals.responseLengthTrend === "decreasing") {
    parts.push(`\n⚠️ ATTENTION: Response length is decreasing (possible fatigue)
- Consider wrapping up sooner
- Ask fewer follow-up questions
- Focus only on critical remaining topics`);
  }

  if (qualitySignals.engagementLevel === "low") {
    parts.push(`\n⚠️ LOW ENGAGEMENT DETECTED
- Try to re-engage with a more interesting question
- Ask about something they seemed more interested in earlier
- Consider if the questions are too abstract - make them more concrete`);
  }

  if (qualitySignals.topicAvoidanceCount > 0) {
    parts.push(`\nNOTE: Participant has avoided ${qualitySignals.topicAvoidanceCount} topic(s)
- Respect their boundaries
- Don't push on topics they've declined to discuss
- Try approaching the same information from a different angle`);
  }

  return parts.join("\n");
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

  return `Analyze the following conversation from a conversational survey and provide a comprehensive summary.

Survey Goal: ${config.objective?.goal || "Gather feedback"}
Information to Collect: ${config.information}
Required Questions: ${config.requiredQuestions.length > 0 ? config.requiredQuestions.join(", ") : "None specified"}

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

Survey Goal: ${config.objective?.goal || "Gather feedback"}
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

Survey Goal: ${config.objective?.goal || "Gather feedback"}
Information to Collect: ${config.information}
Required Questions: ${config.requiredQuestions.length > 0 ? config.requiredQuestions.join(", ") : "None specified"}
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
