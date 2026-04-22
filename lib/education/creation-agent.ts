import {
  getEducationProgram,
  classifyEducationProgramHeuristically,
} from "@/lib/education/catalog";
import {
  createEmptyMediaDecision,
  type CreationMediaDecision,
} from "@/lib/education/agent-tools";
import type {
  ResearchBrief,
} from "@/lib/education/types";
import type { SupportedLanguage } from "@/lib/voice/deepgram-voice-agent";
import {
  renderStrictScopePolicyInstructions,
} from "@/lib/ai/scope-policy";
import {
  estimateTokenCount,
  createTokenBudgetManager,
} from "@/lib/ai/token-budget";
import {
  sanitizeBriefField,
  sanitizeStringArray,
  createSafeUserDataSection,
} from "@/lib/ai/sanitization";

export type CreationAgentState = {
  surveyId: string | null;
  messages: Array<{
    role: "user" | "assistant" | "system" | "tool" | "data";
    content: string;
    timestamp?: string;
  }>;
  brief: ResearchBrief | null;
  missingFields: string[];
  readyForSampling: boolean;
  mediaDecision?: CreationMediaDecision | null;
};

function inferProgramId(
  messages: Array<{ role: string; content: string }>,
) {
  const creatorText = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join("\n");

  return classifyEducationProgramHeuristically(creatorText).programId;
}

export function buildCreationGreeting(
  language: SupportedLanguage = "en",
): string {
  switch (language) {
    case "fr":
      return "Bonjour. Je vais vous aider a construire cette etude. Quel programme d'apprentissage ou quelle experience voulez-vous etudier ?";
    case "de":
      return "Hallo. Ich helfe Ihnen dabei, diese Studie zu gestalten. Welches Lernprogramm oder welche Lernerfahrung moechten Sie untersuchen?";
    case "es":
      return "Hola. Voy a ayudarte a dar forma a este estudio. Que programa o experiencia de aprendizaje quieres analizar?";
    case "it":
      return "Ciao. Ti aiutero a dare forma a questo studio. Quale programma o esperienza di apprendimento vuoi analizzare?";
    case "en":
    default:
      return "Hi. I'll help you shape this education study. What learning program or experience do you want feedback on?";
  }
}

export async function buildCreationSystemPrompt(
  state: CreationAgentState,
) {
  const programId =
    state.brief?.programId ||
    inferProgramId(state.messages) ||
    "education.course_efficacy";
  const program = getEducationProgram(programId);
  const brief = state.brief;

  const missingFieldText =
    state.missingFields.length > 0 ? state.missingFields.join(", ") : "none";
  const mediaDecision = state.mediaDecision ?? createEmptyMediaDecision();
  
  // Sanitize all user-provided brief fields
  const sanitizedTitle = sanitizeBriefField(brief?.title, "title");
  const sanitizedGoal = sanitizeBriefField(brief?.researchGoal, "researchGoal");
  const sanitizedDecision = sanitizeBriefField(brief?.decisionToInform, "decisionToInform");
  const sanitizedAudience = sanitizeBriefField(brief?.audienceDefinition, "audienceDefinition");
  const sanitizedLearningContext = sanitizeBriefField(brief?.learningContext, "learningContext");
  const sanitizedDeliveryContext = sanitizeBriefField(brief?.deliveryContext, "deliveryContext");
  const sanitizedTimeWindow = sanitizeBriefField(brief?.timeWindow, "timeWindow");
  const sanitizedTopics = sanitizeStringArray(brief?.requiredTopics, { maxItems: 10 });
  const sanitizedCriteria = sanitizeStringArray(brief?.successCriteria, { maxItems: 10 });
  const sanitizedQuestions = sanitizeStringArray(brief?.analysisQuestions, { maxItems: 10 });
  
  // Create token budget manager (assuming GPT-4.1-mini or similar)
  const budgetManager = createTokenBudgetManager("gpt-4.1-mini");
  
  // Allocate tokens to different components
  const basePromptTokens = estimateTokenCount(program.creationPrompt);
  budgetManager.allocate("basePrompt", basePromptTokens);
  
  const briefSummaryTokens = estimateTokenCount(
    `Title: ${brief?.title || "Not set yet"}\nGoal: ${brief?.researchGoal || "Missing"}`
  );
  budgetManager.allocate("briefSummary", briefSummaryTokens);
  
  const instructionsTokens = estimateTokenCount(
    renderStrictScopePolicyInstructions({
      objective: "Define a survey brief for an education research study",
      currentPhase: "survey creation",
      activeTopic: brief?.title || program.manifest.displayName,
      allowedDetours: [
        "brief clarification of the current study-design question",
        "discussion tied directly to the current survey brief",
      ],
    })
  );
  budgetManager.allocate("instructions", instructionsTokens);
  
  budgetManager.getRemaining();

  return `${program.creationPrompt}

You are helping a creator define an education research study. Keep the exchange concise, clear, and practical.

${createSafeUserDataSection({
  program: program.manifest.displayName,
  title: sanitizedTitle,
  goal: sanitizedGoal,
  decision: sanitizedDecision,
  audience: sanitizedAudience,
  learningContext: sanitizedLearningContext,
  deliveryContext: sanitizedDeliveryContext,
  timeWindow: sanitizedTimeWindow,
  requiredTopics: sanitizedTopics.join(", ") || "Missing",
  successCriteria: sanitizedCriteria.join(", ") || "Missing",
  analysisQuestions: sanitizedQuestions.join(", ") || "Missing",
  missingFields: missingFieldText,
  mediaSupport: "disabled",
  mediaRationale: mediaDecision.rationale || "Survey media is disabled",
  readyForSampling: state.readyForSampling ? "yes" : "no",
})}

Instructions:
- Ask exactly one question at a time.
- Focus on the highest-priority missing field or contradiction.
- Survey creation no longer supports media uploads or media recommendations.
- If the brief is ready, call \`finishSurvey\`, then briefly tell the creator they can move to sample review.
- Never mention internal JSON, hidden state, or implementation details.

${renderStrictScopePolicyInstructions({
  objective: "Define a survey brief for an education research study",
  currentPhase: "survey creation",
  activeTopic: sanitizedTitle !== "Not set yet" ? sanitizedTitle : program.manifest.displayName,
  allowedDetours: [
    "brief clarification of the current study-design question",
    "discussion tied directly to the current survey brief",
  ],
})}`;
}
