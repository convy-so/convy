import { buildPromptFrame, renderTaggedSection } from "@/features/tutoring/server/prompt-serializers";

export function buildExpertReviewPrompt(params: {
  transcript: Array<{ role: string; content: string }>;
  expertCorrection: string;
}) {
  const transcript = params.transcript
    .map((item) => `${item.role}: ${item.content.replace(/\s+/g, " ").trim()}`)
    .join("\n");

  return [
    buildPromptFrame({
      role: "Turn this reviewed tutoring incident into a structured expert review case.",
      goal: "Capture the reusable pedagogical signal from an expert correction.",
      constraints: [
        "Ground the case in the supplied transcript and correction only.",
        "Distinguish the tutor's mistake from the expert's deeper pedagogical lesson.",
      ],
      outputContract: ["Return the structured expert review object only."],
    }),
    renderTaggedSection("transcript", transcript || "none"),
    renderTaggedSection("expert_correction", params.expertCorrection),
  ]
    .filter(Boolean)
    .join("\n\n");
}
