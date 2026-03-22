import { ExpertState } from "@/lib/schemas/expert-state";

/**
 * Convy V2 Architecture: The Probe Engine
 * 
 * The Decision Matrix that selects the optimal questioning strategy 
 * based on psychological signals and coverage progress.
 */
export type ProbeStrategy = 
  | "drilldown"      // Deep dive into a specific detail
  | "nudge"          // Gently encourage more detail without specific focus
  | "confrontation"   // Point out a contradiction (Consistency flag)
  | "clarification"  // Simple follow-up on a vague term
  | "pivot"          // Move to a new topic (Coverage brain move)
  | "encourage"      // High engagement reward
  | "wrapup"         // Ending the session
;

export class ProbeEngine {
  
  /**
   * Evaluates the current turn and selects the best strategy
   */
  public selectStrategy(state: ExpertState): ProbeStrategy {
    const lastRecord = state.qualitySignals.turnRecords.slice(-1)[0];
    const aggregates = state.qualitySignals.sessionAggregates;

    // 1. Check for immediate logical completion
    if (!state.coverageTracker.currentTopicId) {
      return "wrapup";
    }

    // 2. Handle consistency issues (High priority)
    if (lastRecord?.inconsistencyFlag) {
      return "confrontation";
    }

    // 3. Handle evasion
    if (lastRecord?.evasionFlag) {
      return "drilldown";
    }

    // 4. Handle social desirability (Nudge them to be more honest/critical)
    if (lastRecord?.socialDesirabilityFlag) {
      return "nudge";
    }

    // 5. Handle low engagement (Encourage or pivot if they're fatigued)
    if (lastRecord && lastRecord.engagementScore < 0.3) {
      if (aggregates.overallReliability < 0.5) {
        return "pivot"; // They are bored/fatigued, try a new area
      }
      return "encourage";
    }

    // Default: Regular drilldown or clarification based on specificity
    return "drilldown";
  }

  /**
   * Generates the "Adaptation Prompt" to be injected into the next LLM call.
   * This provides the strategy, target topic, and reasoning.
   */
  public generateAdaptationHint(strategy: ProbeStrategy, topicDescription: string): string {
    const hints: Record<ProbeStrategy, string> = {
      drilldown: `STRATEGY: DRILLDOWN. The respondent gave a useful but brief answer. Ask for a specific example or 'how' it felt.`,
      nudge: `STRATEGY: NUDGE. The respondent seems to be giving 'polite' or 'expected' answers. Gently encourage them to share a critical or negative perspective.`,
      confrontation: `STRATEGY: CONFRONTATION. The respondent just contradicted a previous point. Politely ask them to clarify the relationship between these two pieces of information.`,
      clarification: `STRATEGY: CLARIFICATION. A specific term was used vaguely. Ask what they meant by that specific word.`,
      pivot: `STRATEGY: PIVOT. The current topic seems exhausted or the respondent is losing interest. Move gracefully to the next topic: ${topicDescription}.`,
      encourage: `STRATEGY: ENCOURAGE. The respondent is doing great. Briefly validate their depth and continue with the current topic.`,
      wrapup: `STRATEGY: WRAPUP. All topics are sufficiently covered. Thank the participant and end the interview.`,
    };

    return hints[strategy] || hints.drilldown;
  }
}

export const probeEngine = new ProbeEngine();
