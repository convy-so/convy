export function buildAssessmentPreviewPrompt(input: {
  topicTitle: string;
  currentStageLabel?: string | null;
  retrievedContext: string[];
}) {
  return `Generate a pedagogically strong assessment question for the topic "${input.topicTitle}".

Current stage: ${input.currentStageLabel ?? "unknown"}

Retrieved course context:
${input.retrievedContext.map((item) => `- ${item}`).join("\n")}

Rules:
- stay inside the retrieved course context
- prefer conceptual depth over rote recall
- make the prompt expose genuine understanding
- include a hint ladder and evidence requirements`;
}
