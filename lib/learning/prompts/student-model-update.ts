import type {
  ContentScopeSnapshot,
  ExpertTutorRuntimeModel,
  StudentModelSnapshot,
} from "@/lib/learning/types";

export function buildStudentModelUpdatePrompt(params: {
  existingSnapshot: StudentModelSnapshot | null;
  contentScope: ContentScopeSnapshot;
  conversationExcerpt: Array<{ role: string; content: string }>;
  runtimeModel?: ExpertTutorRuntimeModel | null;
}) {
  const frameworkGuidelines = params.runtimeModel?.framework?.markdownContent
    ? `\nFollow the guidelines, conceptual rungs, and instructions laid out in the tutoring framework below to identify and update conceptual progression:\n${params.runtimeModel.framework.markdownContent}\n`
    : "";
  const compiledPolicy = params.runtimeModel?.compiledPolicy
    ? `\nCompiled framework policy summary:\n${JSON.stringify(params.runtimeModel.compiledPolicy, null, 2)}\n`
    : "";

  return `Update the student's personalization model from this tutoring evidence.

Your job is to update two dynamic tracking fields:
1. "cognitiveModel": A dictionary tracking the student's mastery level of specific concepts or learning outcomes. Include "confidence" (0-1), "evidence" signals (array of strings), and "misconceptions" observed.
2. "personalization": A dictionary tracking student-specific interests, motivations, relevance hooks, productive struggle preferences, or aspirations discovered during the session.

${frameworkGuidelines}
${compiledPolicy}

Rules:
- CRITICAL key constraint: When writing keys to the "cognitiveModel" dictionary, you MUST strictly use the exact IDs of the learning outcomes provided in the "learningOutcomes" list under the Course scope (if any are present). Do NOT invent new keys, and do NOT use arbitrary variations of concept names. Each key in "cognitiveModel" MUST match one of the allowed learning outcome IDs.
- If the "learningOutcomes" list is empty or not provided under the Course scope, design clear, descriptive camelCase or snake_case keys corresponding strictly to the core concepts defined in the framework guidelines.
- Be agentic: design the structure of values in "cognitiveModel" and "personalization" to naturally map to the framework's instruction and the student's needs. Do not be constrained by a fixed schema for values.
- Update from reasoning evidence, not just correctness.
- Keep changes conservative when evidence is thin.
- Track misconceptions explicitly under the concepts in the "cognitiveModel".
- Add relevance hooks from what the student actually cares about.
- Update "summary" with a concise, high-level summary of the student's current learning state.

Existing snapshot:
${JSON.stringify(params.existingSnapshot)}

Course scope:
${JSON.stringify(params.contentScope)}

Conversation excerpt:
${JSON.stringify(params.conversationExcerpt)}`;
}
