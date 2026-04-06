import { defaultModel } from "@/lib/ai";
import { generateObservedText } from "@/lib/ai/observed-text";
import type { LearningTeachingPlaybook } from "@/lib/learning/pattern-types";
import {
  TUTORING_DEFAULT_SYSTEM_PROMPT,
  buildTutoringObservedOptions,
  buildTutoringPromptCache,
  renderRetrievedContext,
  renderStudentProfileContext,
  renderTutoringScopeInstructions,
  renderTeachingPlaybookSummary,
} from "@/lib/learning/prompting";
import {
  buildSessionOpeningPlan,
  buildTutorGroundingRules,
  getGradeLanguagePolicy,
  shouldUseWebOpening,
} from "@/lib/learning/runtime";
import type { TutoringRuntimeContext } from "@/lib/learning/session-engine";
import type {
  GradeBand,
  LearningOutcomeDefinition,
  StudentInterestProfile,
  TopicSourceBoundary,
} from "@/lib/learning/types";

function renderTutoringRuntimeContext(context?: TutoringRuntimeContext) {
  if (!context) return "";

  const studyLanguage =
    typeof context.metadata?.studyLanguage === "string"
      ? context.metadata.studyLanguage
      : null;
  const sourceContentLanguage =
    typeof context.metadata?.sourceContentLanguage === "string"
      ? context.metadata.sourceContentLanguage
      : null;
  const sections = [
    studyLanguage
      ? `Language policy:\n- Write every student-facing reply in ${studyLanguage} unless the latest student message clearly uses another supported language.`
      : null,
    sourceContentLanguage
      ? `Grounding language:\n- Teacher-approved source material is anchored in ${sourceContentLanguage}; use it for factual claims even when replying in another supported language.`
      : null,
    context.expertGuidance ? `Expert guidance:\n${context.expertGuidance}` : null,
    context.socialGuidance ? `Social tutoring guidance:\n${context.socialGuidance}` : null,
    context.memoryContext ? `Personalization memory:\n${context.memoryContext}` : null,
    context.userOverlay ? `User add-ons:\n${context.userOverlay}` : null,
  ].filter(Boolean);

  return sections.length > 0 ? `${sections.join("\n\n")}\n\n` : "";
}

async function searchOpeningExample(query: string) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return null;

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "advanced",
      max_results: 3,
    }),
  });

  if (!response.ok) return null;
  const payload = (await response.json()) as {
    results?: Array<{ title?: string; content?: string; url?: string }>;
  };
  return payload.results?.[0] ?? null;
}

export async function generateSessionOpening(params: {
  topicTitle: string;
  topicDescription?: string | null;
  subject?: string | null;
  studentProfile: StudentInterestProfile;
  teachingPlaybook?: LearningTeachingPlaybook | null;
  learningOutcomes: LearningOutcomeDefinition[];
  boundary?: TopicSourceBoundary | null;
  runtimeContext?: TutoringRuntimeContext;
}) {
  const plan = buildSessionOpeningPlan({
    subject: params.subject,
    topicTitle: params.topicTitle,
    topicDescription: params.topicDescription,
    studentProfile: params.studentProfile,
    boundary: params.boundary,
  });

  let externalHook: string | null = null;
  if (shouldUseWebOpening(params) && plan.suggestedSearchQueries.length > 0) {
    const result = await searchOpeningExample(plan.suggestedSearchQueries[0]!);
    if (result) {
      externalHook = `${result.title ?? "Recent example"}: ${result.content ?? ""}`.trim();
    }
  }

  const text = await generateObservedText({
    model: defaultModel,
    system: TUTORING_DEFAULT_SYSTEM_PROMPT,
    promptCache: buildTutoringPromptCache("session-opening", "default"),
    prompt: `Write a session opening in no more than four sentences.

Topic: ${params.topicTitle}
Description: ${params.topicDescription ?? ""}
Student profile:
${renderStudentProfileContext(params.studentProfile)}
Teaching playbook:
${renderTeachingPlaybookSummary(params.teachingPlaybook)}
Learning outcomes: ${params.learningOutcomes.map((outcome) => outcome.title).join(", ")}
Opening strategy: ${plan.strategy}
Personalization frame: ${plan.personalizationFrame}
External hook: ${externalHook ?? "none"}

${renderTutoringRuntimeContext(params.runtimeContext)}Rules:
- sentence 1 = hook
- sentence 2 = human angle shaped by the student's interests
- sentence 3 = bridge into the concept
- sentence 4 = invitation into the session
- let the teaching playbook influence framing strength based on its confidence
- avoid examples or analogies already present in usedExampleReferences
- do not start by naming the concept in a school-like way
- do not exceed four sentences

${renderTutoringScopeInstructions({
  objective: `Keep the student on the active lesson for ${params.topicTitle}`,
  activeTopic: params.topicTitle,
  currentPhase: "session opening",
})}`,
  }, buildTutoringObservedOptions(params.runtimeContext, "session_opening", {
    topicTitle: params.topicTitle,
    strategy: plan.strategy,
    usedExternalHook: Boolean(externalHook),
  }) ?? {
    feature: "tutoring_chat",
    scenarioType: "session_opening",
    metadata: {
      topicTitle: params.topicTitle,
      strategy: plan.strategy,
      usedExternalHook: Boolean(externalHook),
    },
  });

  return {
    opening: text.text.trim(),
    plan,
  };
}

export async function generateTutorReply(params: {
  gradeBand: GradeBand;
  topicTitle: string;
  learningOutcomes: LearningOutcomeDefinition[];
  studentProfile: StudentInterestProfile;
  teachingPlaybook?: LearningTeachingPlaybook | null;
  retrievedContext: string[];
  transcript: Array<{ role: string; content: string }>;
  boundary?: TopicSourceBoundary | null;
  runtimeContext?: TutoringRuntimeContext;
}) {
  const grounding = buildTutorGroundingRules({
    gradeBand: params.gradeBand,
    topicTitle: params.topicTitle,
    learningOutcomes: params.learningOutcomes.map((outcome) => outcome.title),
    boundary: params.boundary,
    studentProfile: params.studentProfile,
  });
  const policy = getGradeLanguagePolicy(params.gradeBand);
  const transcript = params.transcript
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n\n");

  const result = await generateObservedText({
    model: defaultModel,
    system: TUTORING_DEFAULT_SYSTEM_PROMPT,
    promptCache: buildTutoringPromptCache("out-of-session-reply", "default"),
    prompt: `You are a personalized tutor.

Topic: ${params.topicTitle}
Learning outcomes:
${params.learningOutcomes.map((outcome, index) => `${index + 1}. ${outcome.title}: ${outcome.description}`).join("\n")}

Language policy:
${JSON.stringify(policy)}

Student profile:
${renderStudentProfileContext(params.studentProfile)}
Teaching playbook:
${renderTeachingPlaybookSummary(params.teachingPlaybook)}

Grounding rules:
${grounding.systemRules.map((rule) => `- ${rule}`).join("\n")}

Retrieved teacher-approved context:
${renderRetrievedContext(params.retrievedContext)}

Conversation:
${transcript}

${renderTutoringRuntimeContext(params.runtimeContext)}Instructions:
- Answer using the retrieved context for factual claims.
- If the answer is not supported by the material, say so clearly and stay within the material.
- Personalize explanations using the student's context tags and interests.
- Let the teaching playbook shape explanation order, encouragement, and framing when confidence is high.
- Offer quizzes or checks when helpful.
- Keep the tone age-appropriate for ${params.gradeBand}.

${renderTutoringScopeInstructions({
  objective: `Teach ${params.topicTitle} using teacher-approved material`,
  activeTopic: params.topicTitle,
  currentPhase: "tutoring reply",
})}`,
  }, buildTutoringObservedOptions(params.runtimeContext, "out_of_session_reply", {
    topicTitle: params.topicTitle,
    gradeBand: params.gradeBand,
  }) ?? {
    feature: "tutoring_chat",
    scenarioType: "out_of_session_reply",
    metadata: {
      topicTitle: params.topicTitle,
      gradeBand: params.gradeBand,
    },
  });

  return result.text.trim();
}
