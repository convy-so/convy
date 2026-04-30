export function buildOutOfSessionClassificationPrompt(input: {
  topicTitle: string;
  topicDescription?: string | null;
  learningOutcomes: Array<{ title: string; description: string }>;
  question: string;
}) {
  return `Classify whether this student question is in scope for the course topic.

Topic: ${input.topicTitle}
Description: ${input.topicDescription ?? ""}
Learning outcomes:
${input.learningOutcomes.map((item) => `- ${item.title}: ${item.description}`).join("\n")}

Question:
${input.question}

Return:
- in_scope when the question is clearly about the active topic
- borderline when it is adjacent but still teachable with a brief bridge
- off_scope when it is meaningfully outside the topic`;
}

export function buildOutOfSessionReplyPrompt(input: {
  classification: "in_scope" | "borderline" | "off_scope";
  topicTitle: string;
  learningOutcomes: Array<{ title: string; description: string }>;
  gradeBand: string;
  studentProfile: Record<string, unknown>;
  question: string;
  retrievedContext: string[];
  language: string;
}) {
  return `Answer the student's out-of-session question.

Reply in ${input.language}.
Classification: ${input.classification}
Topic: ${input.topicTitle}
Grade band: ${input.gradeBand}
Question: ${input.question}

Learning outcomes:
${JSON.stringify(input.learningOutcomes)}

Student profile:
${JSON.stringify(input.studentProfile)}

Retrieved course context:
${input.retrievedContext.map((item) => `- ${item}`).join("\n")}

Rules:
- stay inside the retrieved course context for facts
- if classification is off_scope, gently redirect back toward the current topic
- if classification is borderline, answer briefly and reconnect to the topic
- keep the explanation concise and teachable`;
}
