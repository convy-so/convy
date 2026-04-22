import type {
  ContentScopeSnapshot,
  StudentModelSnapshot,
} from "@/lib/learning/types";

export function buildStudentModelUpdatePrompt(params: {
  existingSnapshot: StudentModelSnapshot | null;
  contentScope: ContentScopeSnapshot;
  conversationExcerpt: Array<{ role: string; content: string }>;
}) {
  return `Update the student's personalization model from this tutoring evidence.

The model has five dimensions:
1. motivationalContext
2. knowledgeStateModel
3. cognitiveStyleCalibration
4. productiveStruggleCalibration
5. longitudinalDevelopment

Rules:
- Update from reasoning evidence, not just correctness.
- Keep changes conservative when evidence is thin.
- Knowledge state should use masteryLevel of surface, applied, or generative.
- Track misconceptions explicitly.
- Add relevance hooks from what the student actually cares about.
- Productive struggle should reflect whether the student needed more support, handled challenge well, or showed discouragement.
- Longitudinal signals should only be updated when there is real evidence.

Existing snapshot:
${JSON.stringify(params.existingSnapshot)}

Course scope:
${JSON.stringify(params.contentScope)}

Conversation excerpt:
${JSON.stringify(params.conversationExcerpt)}`;
}
