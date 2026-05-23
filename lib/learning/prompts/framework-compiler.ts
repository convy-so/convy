import type { ExpertFramework } from "@/lib/learning/types";

function renderExamples(examples: string[]) {
  if (!examples.length) {
    return "- none";
  }

  return examples
    .map(
      (example, index) =>
        `- Example ${index + 1}:\n${example
          .split("\n")
          .map((line) => `  ${line}`)
          .join("\n")}`,
    )
    .join("\n\n");
}

export function buildFrameworkCompilerPrompt(framework: ExpertFramework) {
  return `You are compiling an expert-authored tutoring framework into a structured runtime policy.

The expert does not know system implementation details. They only provide:
- a teaching framework in natural language
- optional few-shot examples

Your job:
- infer the expert's intended progression model
- infer how the tutor should diagnose, support, assess, escalate, and close
- infer whether images, videos, quizzes, notebook uploads, and formal grading are appropriate
- preserve the framework's labels when they exist
- keep the policy generic and faithful to the framework

Return a runtime policy that can drive tutoring across many student turns.

Important rules:
- Do not invent subject-specific content beyond what the framework implies.
- Prefer compact, reusable policies over brittle edge-case rules.
- If the framework defines phases or rungs/levels, preserve them.
- If the framework requires transfer, reflection, proof of understanding, or diagnosis-first teaching, encode that explicitly.
- If the framework is silent on an area, choose a conservative tutoring default.
- Tool policy must be expressed as allowed/forbidden/encouraged runtime behavior, not implementation details.

Framework name:
${framework.name}

Framework description:
${framework.description || "(none)"}

Framework instructions:
${framework.markdownContent || "(none)"}

Few-shot examples:
${renderExamples(framework.fewShotExamples)}`;
}
