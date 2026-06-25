import {
  buildPromptFrame,
  renderInterestProfile,
  renderLearningOutcomes,
  renderTaggedSection,
} from "@/features/tutoring/server/prompt-serializers";
import type { StudentInterestProfile } from "@/features/tutoring/public-server";
import {
  OUT_OF_SESSION_CLASSIFICATION,
  OUT_OF_SESSION_CLASSIFICATION_VALUES,
} from "@/shared/learning/constants";

export function buildOutOfSessionClassificationPrompt(input: {
  topicTitle: string;
  topicDescription?: string | null;
  learningOutcomes: Array<{ title: string; description: string }>;
  question: string;
}) {
  return [
    buildPromptFrame({
      role: "Classify whether a student's out-of-session question is in scope for the active course topic.",
      goal: `Protect scope discipline around ${input.topicTitle}.`,
      constraints: [
        `Use ${OUT_OF_SESSION_CLASSIFICATION.IN_SCOPE} when the question is clearly about the active topic.`,
        `Use ${OUT_OF_SESSION_CLASSIFICATION.BORDERLINE} when it is adjacent but still teachable with a brief bridge.`,
        `Use ${OUT_OF_SESSION_CLASSIFICATION.OFF_SCOPE} when it is meaningfully outside the topic.`,
      ],
      outputContract: ["Return only the structured classification object."],
    }),
    renderTaggedSection("topic", input.topicTitle),
    renderTaggedSection("description", input.topicDescription ?? "none"),
    renderTaggedSection("learning_outcomes", renderLearningOutcomes(input.learningOutcomes)),
    renderTaggedSection("question", input.question),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildOutOfSessionReplyPrompt(input: {
  classification: (typeof OUT_OF_SESSION_CLASSIFICATION_VALUES)[number];
  topicTitle: string;
  learningOutcomes: Array<{ title: string; description: string }>;
  gradeBand: string;
  studentProfile: StudentInterestProfile | null;
  question: string;
  retrievedContext: string;
  language: string;
}) {
  return [
    buildPromptFrame({
      role: `Answer the student's out-of-session question in ${input.language}.`,
      goal: `Help the student while protecting scope around ${input.topicTitle}.`,
      constraints: [
        "Stay inside the retrieved course context for facts.",
        "If classification is off_scope, redirect back toward the current topic.",
        "If classification is borderline, answer briefly and reconnect to the topic.",
        "Keep the explanation concise and teachable.",
      ],
      antiRules: [
        "Do not invent facts beyond the grounded context.",
        "Do not let the student profile override factual scope.",
      ],
      outputContract: ["Return only the assistant response text."],
    }),
    renderTaggedSection(
      "request",
      `Classification: ${input.classification}\nTopic: ${input.topicTitle}\nGrade band: ${input.gradeBand}\nQuestion: ${input.question}`,
    ),
    renderTaggedSection("learning_outcomes", renderLearningOutcomes(input.learningOutcomes)),
    renderTaggedSection("student_profile", renderInterestProfile(input.studentProfile)),
    renderTaggedSection("grounded_context", input.retrievedContext || "none"),
  ]
    .filter(Boolean)
    .join("\n\n");
}
