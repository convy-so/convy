export type FrameworkCompileCriterion = {
  code: string;
  title: string;
  instruction: string;
  whyItMatters: string;
  blocking: boolean;
  keywords: string[];
};

export const frameworkCompileCriteria: FrameworkCompileCriterion[] = [
  {
    code: "explicit_progression_model",
    title: "Explicit progression model",
    instruction:
      "Name the teaching phases or session flow the tutor should follow, such as phases, steps, or a teaching loop.",
    whyItMatters:
      "The runtime must infer a stable phase sequence instead of guessing the order of tutoring moves from narrative prose alone.",
    blocking: true,
    keywords: ["phase", "step", "session protocol", "teaching loop", "diagnose"],
  },
  {
    code: "explicit_levels_or_rungs",
    title: "Explicit levels or rungs",
    instruction:
      "Define the learner progression levels or rungs and what each one means.",
    whyItMatters:
      "The runtime tracks student progress level by level, so the framework must describe what advancement means.",
    blocking: true,
    keywords: ["rung", "level", "recognition", "transfer", "synthesis"],
  },
  {
    code: "explicit_turn_policy",
    title: "Explicit turn policy",
    instruction:
      "State what should happen first in a turn, what should happen before explanation, and whether direct answers require a student attempt first.",
    whyItMatters:
      "The tutor uses this to choose whether to probe, hint, explain, assess, or challenge on each turn.",
    blocking: true,
    keywords: [
      "before",
      "diagnosis",
      "attempt",
      "question before explanation",
      "turn policy",
    ],
  },
  {
    code: "explicit_assessment_signals",
    title: "Explicit assessment signals",
    instruction:
      "Describe how the tutor should tell whether the student really understands, not just whether they got an answer.",
    whyItMatters:
      "The compiler must infer evidence-of-understanding rules and when assessment is needed before advancing or closing.",
    blocking: true,
    keywords: [
      "proof of understanding",
      "assessment",
      "evidence",
      "explain why",
      "understanding",
    ],
  },
  {
    code: "explicit_completion_rules",
    title: "Explicit completion rules",
    instruction:
      "State what must happen before a session can close, such as transfer, reflection, or explicit proof of understanding.",
    whyItMatters:
      "The runtime cannot end sessions reliably unless close conditions are spelled out.",
    blocking: true,
    keywords: [
      "metacognitive",
      "reflection",
      "close",
      "end every session",
      "transfer challenge",
    ],
  },
  {
    code: "explicit_tool_and_media_policy",
    title: "Explicit tool and media policy",
    instruction:
      "Say whether images, videos, quizzes, grading, or notebook work should be used often, rarely, or never.",
    whyItMatters:
      "The runtime gates tools from the framework, so silence here forces conservative defaults.",
    blocking: false,
    keywords: ["image", "video", "quiz", "grading", "notebook", "upload"],
  },
  {
    code: "structured_section_headings",
    title: "Structured section headings",
    instruction:
      "Use labeled sections and consistent headings instead of one long block of prose.",
    whyItMatters:
      "Clear section boundaries make it easier for the compiler to separate progression, assessment, and close behavior.",
    blocking: false,
    keywords: ["##", "part", "module", "heading"],
  },
];
