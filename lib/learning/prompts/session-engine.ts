import {
  buildPromptFrame,
  renderTaggedSection,
} from "@/lib/learning/prompt-serializers";

export function buildAssessmentPreviewPrompt(input: {
  topicTitle: string;
  currentStageLabel?: string | null;
  retrievedContext: string;
  questionType?: string;
  difficulty?: string;
}) {
  return [
    buildPromptFrame({
      role: `Generate a pedagogically strong assessment question for ${input.topicTitle}.`,
      goal: "Create an assessment preview that exposes genuine understanding inside the approved course scope.",
      constraints: [
        "Stay inside the grounded course context.",
        "Prefer conceptual depth over rote recall.",
        "Include a hint ladder and evidence requirements.",
      ],
      outputContract: ["Return only the structured assessment preview object."],
    }),
    renderTaggedSection(
      "assessment_request",
      `Current stage: ${input.currentStageLabel ?? "unknown"}\nPreferred question type: ${input.questionType ?? "any"}\nPreferred difficulty: ${input.difficulty ?? "any"}`,
    ),
    renderTaggedSection("grounded_context", input.retrievedContext || "none"),
  ]
    .filter(Boolean)
    .join("\n\n");
}
