import { ExpertState, turnQualityRecordSchema } from "@/lib/schemas/expert-state";
import { z } from "zod";

/**
 * Convy V2 Architecture: The Psychological Engine
 * 
 * Analyzes turn-by-turn signals from the respondent to update the ExpertState
 * with engagement, social desirability, evasion, and inconsistency flags.
 */
export class PsychologicalEngine {
  
  /**
   * Computes engagement score based on raw signals.
   * Logic: Specificity + Length - Fatigue
   */
  public computeEngagementScore(
    content: string, 
    previousTurns: any[],
    modality: "voice" | "text"
  ): number {
    const length = content.trim().length;
    
    // Base score from length (diminishing returns)
    // 0-50 chars: 0.1-0.4
    // 50-200 chars: 0.4-0.8
    // 200+: 0.9+
    let lengthScore = Math.min(content.length / 200, 1) * 0.8;
    if (content.length < 10) lengthScore = 0.1;

    // Modality calibration: Voice respondents tend to speak more than text users type.
    if (modality === "voice") {
      lengthScore *= 0.85; // Penalize excessive length slightly as it might just be rambling
    }

    // Heuristics for specificity (presence of numbers, proper nouns, or connectors)
    const specificityBoost = (
      (content.match(/\d+/g)?.length || 0) * 0.05 + 
      (content.split(/[.!?]/).length > 2 ? 0.1 : 0)
    );

    return Math.min(lengthScore + specificityBoost, 1);
  }

  /**
   * Updates consistent state aggregates. 
   * Usually called after an LLM turn-evaluator call (Phase 2.1)
   */
  public updateSessionAggregates(state: ExpertState): void {
    const records = state.qualitySignals.turnRecords;
    if (records.length === 0) return;

    const totalReliability = records.reduce((sum, r) => sum + r.reliabilityScore, 0);
    const totalEvasion = records.filter(r => r.evasionFlag).length;
    const totalDesirability = records.filter(r => r.socialDesirabilityFlag).length;

    state.qualitySignals.sessionAggregates = {
      overallReliability: totalReliability / records.length,
      evasionIndex: totalEvasion / records.length,
      socialDesirabilityIndex: totalDesirability / records.length
    };
  }

  /**
   * Returns a concise summary of the participant's psychological state for the prompt.
   */
  public getEngagementSummary(state: ExpertState): string {
    const agg = state.qualitySignals.sessionAggregates;
    const last = state.qualitySignals.turnRecords.slice(-1)[0];
    
    return `Reliability: ${Math.round(agg.overallReliability * 100)}% | Evasion: ${Math.round(agg.evasionIndex * 100)}% | Current Engagement: ${last ? Math.round(last.engagementScore * 100) : 0}%`;
  }

  /**
   * Pattern for an LLM-powered turn analysis. 
   * This is used to detect subtle flags like Social Desirability and Evasion
   * that simple regex cannot find.
   */
  public buildAnalysisPrompt(
    lastTurn: string, 
    context: string,
    objective: string
  ): string {
    return `
Analyze the following respondent input within the context of the research objective.
Objective: ${objective}
Context: ${context}
Input: "${lastTurn}"

Output a JSON object with:
- evasion_flag (boolean): true if the respondent is explicitly avoiding the question or being intentionally vague.
- social_desirability_flag (boolean): true if the respondent is being overly positive or performative to please the interviewer.
- inconsistency_flag (boolean): true if this conflicts with previous context.
- reliability_score (0-1): overall confidence in this turn's data.

Respond ONLY with valid JSON.
`.trim();
  }
}

export const psychologicalEngine = new PsychologicalEngine();
