
import type { RollingContext } from "@/lib/conversation-memory";

export interface SkillTrigger {
  skillId: string;
  // Simple string patterns that trigger this skill
  patterns: string[];
  // Optional: heuristic function for cases patterns can't cover
  heuristic?: (lastMessage: string, context: RollingContext) => boolean;
  // Priority — higher number fires first if multiple match
  priority: number;
}

/**
 * Global situational skill triggers.
 * These apply across all domains. Domain-specific triggers
 * are defined in the domain manifest and merged at runtime.
 */
export const GLOBAL_SKILL_TRIGGERS: SkillTrigger[] = [
  {
    skillId: "STARProber",
    patterns: [
      "usually", "typically", "generally", "sometimes", "often",
      "tends to", "kind of", "sort of", "in general", "most of the time",
    ],
    heuristic: (msg) => msg.split(" ").length < 15 && !msg.includes("because"),
    priority: 10,
  },
  {
    skillId: "CognitiveLoadBalancer",
    patterns: [
      "don't know", "not sure", "confused", "complicated", "hard to say",
      "i guess", "maybe", "not really", "i don't understand",
    ],
    heuristic: (msg, ctx) =>
      msg.split(" ").length < 8 ||
      ctx.qualitySignals?.responseLengthTrend === "decreasing",
    priority: 8,
  },
  {
    skillId: "GoalAnchoring",
    patterns: [],
    // Fires when response is long but contains none of the survey's topics
    heuristic: (msg, ctx) => {
      if (msg.split(" ").length < 40) return false;
      const surveyTopics = (ctx.memory?.remainingRequiredTopics ?? [])
        .join(" ")
        .toLowerCase();
      if (!surveyTopics) return false;
      const words = msg.toLowerCase().split(" ");
      const overlap = words.filter(w => surveyTopics.includes(w)).length;
      return overlap < 2;
    },
    priority: 6,
  },
  {
    skillId: "JargonClarifier",
    patterns: [],
    // Fires when message contains unexplained acronyms
    heuristic: (msg) => /\b[A-Z]{2,5}\b/.test(msg) && msg.split(" ").length > 5,
    priority: 4,
  },
  {
    skillId: "BiasDetector",
    // For use in creation phase when the creator proposes questions
    patterns: [
      "how great", "how amazing", "how helpful", "don't you think",
      "agree that", "isn't it true", "obviously",
    ],
    priority: 9,
  },
];

/**
 * Detect which situational skill (if any) should be active for this turn.
 * Returns the skill ID or null. Only ONE skill is active at a time.
 * Higher priority wins if multiple triggers match.
 */
export function detectActiveSkill(
  lastUserMessage: string,
  context: RollingContext,
  domainSituationalSkills: Array<{ trigger: string[]; skillId: string }> = []
): string | null {

  const message = lastUserMessage.toLowerCase();

  // Merge global triggers with domain-specific ones
  const allTriggers: SkillTrigger[] = [
    ...GLOBAL_SKILL_TRIGGERS,
    ...domainSituationalSkills.map((ds, i) => ({
      skillId: ds.skillId,
      patterns: ds.trigger,
      priority: 100 + i, // Domain-specific triggers get highest priority
    })),
  ];

  // Sort by priority descending, test each trigger
  const sorted = [...allTriggers].sort((a, b) => b.priority - a.priority);

  for (const trigger of sorted) {
    const patternMatch = trigger.patterns.some(p => message.includes(p));
    const heuristicMatch = trigger.heuristic
      ? trigger.heuristic(lastUserMessage, context)
      : false;

    if (patternMatch || heuristicMatch) {
      return trigger.skillId;
    }
  }

  return null;
}
