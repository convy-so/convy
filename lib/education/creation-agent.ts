import {
  getEducationProgram,
  classifyEducationProgramHeuristically,
} from "@/lib/education/catalog";
import {
  createEmptyMediaDecision,
  isCreationMediaDecisionResolved,
  type CreationMediaDecision,
} from "@/lib/education/agent-tools";
import type {
  ResearchBrief,
} from "@/lib/education/types";
import { getPhasePlaybookContext } from "@/lib/education/runtime-context";
import type { SupportedLanguage } from "@/lib/voice/deepgram-voice-agent";

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
  organizationId?: string | null,
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
  const mediaDecisionResolved = isCreationMediaDecisionResolved(mediaDecision);
  const playbookContext = state.surveyId
    ? await getPhasePlaybookContext({
        surveyId: state.surveyId,
        organizationId: organizationId ?? null,
        phase: "creation",
      })
    : "";

  return `${program.creationPrompt}

You are helping a creator define an education research study. Keep the exchange concise, clear, and practical.

${playbookContext ? `Approved creation playbooks:\n${playbookContext}\n` : ""}

Current draft brief:
- Program: ${program.manifest.displayName}
- Title: ${brief?.title || "Not set yet"}
- Goal: ${brief?.researchGoal || "Missing"}
- Decision to inform: ${brief?.decisionToInform || "Missing"}
- Audience: ${brief?.audienceDefinition || "Missing"}
- Learning context: ${brief?.learningContext || "Missing"}
- Delivery context: ${brief?.deliveryContext || "Missing"}
- Time window: ${brief?.timeWindow || "Missing"}
- Required topics: ${brief?.requiredTopics.join(", ") || "Missing"}
- Success criteria: ${brief?.successCriteria.join(", ") || "Missing"}
- Analysis questions: ${brief?.analysisQuestions.join(", ") || "Missing"}
- Missing fields: ${missingFieldText}
- Media decision: ${mediaDecision.status}
- Media recommendation: ${mediaDecision.recommendation}
- Media rationale: ${mediaDecision.rationale || "Not set yet"}
- Suggested media types: ${mediaDecision.recommendedTypes.join(", ") || "None suggested"}
- Suggested media description: ${mediaDecision.suggestedDescription || "Not set yet"}
- Suggested feedback focus: ${mediaDecision.suggestedFeedbackFocus || "Not set yet"}
- Ready for sampling: ${state.readyForSampling ? "yes" : "no"}

Instructions:
- Ask exactly one question at a time.
- Focus on the highest-priority missing field or contradiction.
- Once the core brief is solid enough to evaluate media, give a short recommendation about whether media would help, explain why, and make it clear the creator chooses whether to add any.
- If the media decision is still pending, do not call \`finishSurvey\` yet.
- If you need the creator to make the media decision or upload optional supporting media now, call \`requestMediaUpload\` with concrete recommendation fields instead of describing upload steps yourself.
- If the brief is ready and the media decision is resolved (${mediaDecisionResolved ? "it is resolved now" : "it is not resolved yet"}), call \`finishSurvey\`, then briefly tell the creator they can move to sample review.
- Never mention internal JSON, hidden state, or implementation details.`;
}
