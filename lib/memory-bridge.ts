import { ExpertState } from "./schemas/expert-state";
import { generateText } from "ai";
import { flashLiteModel } from "@/lib/ai";

export interface ContextBudget {
  totalBudget: number;         // Total tokens available for the API call
  staticBaseline: number;      // Tokens consumed by conducting bundle + RAG + non-transcript expertState
  transcriptCeiling: number;   // Maximum tokens the transcript is allowed to consume
  fullTextWindow: number;      // How many recent turns to always keep in full text
  compressionTrigger: number;  // Trigger compression at this transcript token count
  compressionTarget: number;   // Compress until transcript is at this token count
}

export const DEFAULT_CONTEXT_BUDGET: ContextBudget = {
  totalBudget: 180_000, 
  staticBaseline: 14_000,
  transcriptCeiling: 40_000,
  fullTextWindow: 8,
  compressionTrigger: 30_000,
  compressionTarget: 12_000
};

export interface TranscriptTurn {
  turnIndex: number;
  speaker: "agent" | "respondent";
  text: string;
  timestamp: string;
  type?: "turn" | "summary_block";
  probeTypeUsed?: string;
  targetNode?: string;
  probeType?: string;
  targetNodeId?: string;
  socialMoveType?: "normalization" | "trust_recovery" | "humor" | "fatigue_recovery" | "consistency_probe";
  inconsistencyContext?: {
    earlierStatement: string;
    currentStatement: string;
    affectedNodeId?: string;
  };
  nodesAddressed?: string[];
  coveredNodeIds?: string[];
  detectedSentiment?: string;
  lowReliabilityFlag?: boolean;
}

export interface TurnQualityRecord {
  turnNumber: number;
  engagementScore: number;
  socialDesirabilityFlag: boolean;
  evasionFlag: boolean;
  inconsistencyFlag: boolean;
  contradictedStatement?: string;
  reliabilityScore: number;
  engagementDelta?: number; 
}

export interface TranscriptSummaryBlock {
  type: "summary_block";
  turnsFrom: number;
  turnsTo: number;
  compressedAt: number;
  totalTurnsCompressed: number;
  
  topicsCovered: TopicSummary[];
  keyRespondentQuotes: ExtractedQuote[];
  psychologicalPatternSummary: PsychologicalPatternSummary;
  consistencyProbeOutcomes: ConsistencyProbeOutcome[];
  agentMovesUsed: AgentMoveSummary[];
  
  averageEngagementDeltaInWindow: number;
  socialDesirabilityFlagsInWindow: number;
  evasionFlagsInWindow: number;
}

export interface TopicSummary {
  nodeId: string;
  nodeLabel: string;
  coverageAchieved: number;
  keyInsight: string;
  wasBlockedBy: "evasion" | "social_desirability" | "off_topic" | null;
}

export interface ExtractedQuote {
  nodeId: string;
  nodeLabel: string;
  quote: string;
  turnIndex: number;
  reliabilityScore: number;
  isPersonalizationAnchor: boolean;
}

export interface PsychologicalPatternSummary {
  engagementTrend: "rising" | "stable" | "declining";
  trustTrend: "rising" | "stable" | "declining";
  dominantEmotionalState: string;
  defensivePostureAverage: number;
  significantShifts: string[];
}

export interface ConsistencyProbeOutcome {
  turnIndex: number;
  nodeId: string;
  earlierStatement: string;
  laterStatement: string;
  wasResolved: boolean;
  resolutionSummary?: string;
}

export interface AgentMoveSummary {
  moveType: "normalization" | "trust_recovery" | "humor" | "fatigue_recovery" | "consistency_probe";
  atTurnIndex: number;
  outcome: "increased_engagement" | "no_effect" | "decreased_engagement";
}

export interface RetainedQuoteBank {
  byNode: Record<string, ExtractedQuote[]>;
  highConfidence: ExtractedQuote[];
  recentlyUsed: Set<string>;
}

export interface MemoryBridgeState {
  totalTurnsProcessed: number;
  compressionCount: number;
  estimatedCurrentTranscriptTokens: number;
  retainedQuoteBank: RetainedQuoteBank;
  contextBudget: ContextBudget;
}

export interface PreCompressionExtract {
  allQuotes: ExtractedQuote[];
  consistencyProbes: ConsistencyProbeOutcome[];
  agentMoves: AgentMoveSummary[];
}

export interface LLMCompressionOutput {
  topicsCovered: TopicSummary[];
  keyRespondentQuotes: ExtractedQuote[];
  psychologicalPatternSummary: PsychologicalPatternSummary;
}

export interface ProcessTurnResult {
  transcriptModified: boolean;
  updatedTranscript: (TranscriptTurn | TranscriptSummaryBlock)[];
  compressionOccurred: boolean;
  retainedQuoteBank: RetainedQuoteBank;
}

// Helper Functions
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

function shouldCompress(transcript: TranscriptTurn[], budget: ContextBudget): boolean {
  const fullTranscriptText = transcript.map(t => `${t.speaker}: ${t.text}`).join("\n");
  const estimatedTokens = estimateTokens(fullTranscriptText);
  return estimatedTokens > budget.compressionTrigger;
}

function selectTurnsToCompress(
  transcript: TranscriptTurn[],
  budget: ContextBudget
): { turnsToCompress: TranscriptTurn[]; indicesCompressed: number[] } {
  const rawTurns = transcript.filter(t => t.type !== "summary_block") as TranscriptTurn[];
  const totalTurns = rawTurns.length;
  const keepCount = budget.fullTextWindow;
  const candidateCount = totalTurns - keepCount;
  
  if (candidateCount <= 0) {
    return { turnsToCompress: [], indicesCompressed: [] };
  }

  // FIXED: windowSize shrinks from candidateCount toward the minimum needed to hit compressionTarget.
  // Previously windowSize grew (candidateCount + 2 each iter), creating a latent infinite loop
  // when no window size ever satisfied the condition. Now we start maximally and shrink.
  let windowSize = candidateCount;
  while (windowSize > 0) {
    const candidateTurns = rawTurns.slice(0, windowSize);
    const remainingTurns = rawTurns.slice(windowSize);
    const remainingText = remainingTurns.map(t => `${t.speaker}: ${t.text}`).join("\n");
    
    if (estimateTokens(remainingText) <= budget.compressionTarget) {
      return {
        turnsToCompress: candidateTurns,
        indicesCompressed: candidateTurns.map(t => t.turnIndex)
      };
    }
    
    // Shrink the window: try to keep fewer turns to reduce remaining text
    windowSize -= 1;
  }
  
  // Fallback: compress everything except the recent window
  const allButRecent = rawTurns.slice(0, -budget.fullTextWindow);
  
  return {
    turnsToCompress: allButRecent,
    indicesCompressed: allButRecent.map(t => t.turnIndex)
  };
}

function extractBeforeCompression(
  turnsToCompress: TranscriptTurn[],
  state: ExpertState,
  qualityRecords: TurnQualityRecord[]
): PreCompressionExtract {
  const respondentTurns = turnsToCompress.filter(t => t.speaker === "respondent");
  
  // Helper: recursively find a node by ID, including children
  function findNodeById(nodes: any[], id: string): any {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children?.length) {
        const found = findNodeById(node.children, id);
        if (found) return found;
      }
    }
    return undefined;
  }

  const allQuotes: ExtractedQuote[] = respondentTurns
    .filter(t => t.coveredNodeIds && t.coveredNodeIds.length > 0)
    .flatMap(turn => {
      const qualityRecord = qualityRecords.find(r => r.turnNumber === turn.turnIndex);
      const reliabilityScore = qualityRecord?.reliabilityScore ?? 0.5;
      
      return (turn.coveredNodeIds ?? []).map(nodeId => {
        // FIXED: use recursive lookup so child nodes are found correctly
        const node = findNodeById(state.coverageTracker.nodes, nodeId);
        return {
          nodeId,
          nodeLabel: node?.label ?? nodeId,
          quote: turn.text,
          turnIndex: turn.turnIndex,
          reliabilityScore,
          isPersonalizationAnchor: (
            turn.text.split(/\s+/).length <= 15 &&
            reliabilityScore > 0.60
          )
        };
      });
    });
  
  const consistencyProbes: ConsistencyProbeOutcome[] = turnsToCompress
    .filter(t => t.probeType === "consistency")
    .map(agentTurn => {
      const responseIdx = turnsToCompress.findIndex(t => t.turnIndex === agentTurn.turnIndex + 1);
      const responseTurn = responseIdx >= 0 ? turnsToCompress[responseIdx] : null;
      const qualityRecord = qualityRecords.find(r => r.turnNumber === agentTurn.turnIndex + 1);
      
      return {
        turnIndex: agentTurn.turnIndex,
        nodeId: agentTurn.targetNodeId ?? "unknown",
        earlierStatement: agentTurn.inconsistencyContext?.earlierStatement ?? "",
        laterStatement: agentTurn.inconsistencyContext?.currentStatement ?? "",
        wasResolved: !(qualityRecord?.inconsistencyFlag ?? false),
        resolutionSummary: qualityRecord?.inconsistencyFlag === false
          ? responseTurn?.text?.slice(0, 100)
          : undefined
      };
    });

  const agentMoves: AgentMoveSummary[] = turnsToCompress
    .filter(t => t.speaker === "agent" && t.socialMoveType)
    .map(turn => {
      const beforeRecord = qualityRecords.find(r => r.turnNumber === turn.turnIndex - 1);
      const afterRecord = qualityRecords.find(r => r.turnNumber === turn.turnIndex + 1);
      const before = beforeRecord?.engagementDelta ?? 1.0;
      const after = afterRecord?.engagementDelta ?? 1.0;
      const delta = after - before;
      
      return {
        moveType: turn.socialMoveType as any,
        atTurnIndex: turn.turnIndex,
        outcome: delta > 0.1 ? "increased_engagement"
               : delta < -0.1 ? "decreased_engagement"
               : "no_effect"
      };
    });

  return { allQuotes, consistencyProbes, agentMoves };
}

function buildCompressionPrompt(
  turnsToCompress: TranscriptTurn[],
  state: ExpertState,
  preExtract: PreCompressionExtract
): string {
  const transcriptText = turnsToCompress
    .map(t => `[Turn ${t.turnIndex}] ${t.speaker === "agent" ? "Researcher" : "Respondent"}: ${t.text}`)
    .join("\n\n");

  const nodeLabels = Object.fromEntries(
    state.coverageTracker.nodes.map((node: any) => [node.id, node.label])
  );

  return `
You are summarizing a section of a research interview for context compression.
The researcher is a specialist interviewer. The respondent is a research participant.

INTERVIEW EXCERPT (turns ${turnsToCompress[0].turnIndex}–${turnsToCompress[turnsToCompress.length - 1].turnIndex}):
${transcriptText}

RESEARCH NODES BEING TRACKED:
${Object.entries(nodeLabels).map(([id, label]) => `${id}: ${label}`).join("\n")}

Produce a JSON summary with EXACTLY this structure. No preamble, no explanation, just JSON:
{
  "topicsCovered": [
    {
      "nodeId": "<node id>",
      "nodeLabel": "<node label>",
      "coverageAchieved": <0.0 to 1.0>,
      "keyInsight": "<one sentence: what was established about this topic>",
      "wasBlockedBy": <"evasion" | "social_desirability" | "off_topic" | null>
    }
  ],
  "psychologicalPatternSummary": {
    "engagementTrend": <"rising" | "stable" | "declining">,
    "trustTrend": <"rising" | "stable" | "declining">,
    "dominantEmotionalState": "<plain English description e.g. cautious but cooperative>",
    "defensivePostureAverage": <0.0 to 1.0>,
    "significantShifts": ["<plain English description of any notable pattern change>"]
  },
  "keyRespondentQuotes": [
    {
      "nodeId": "<node id>",
      "quote": "<verbatim respondent text, max 25 words>",
      "turnIndex": <integer>,
      "reliabilityScore": <0.0 to 1.0>,
      "isPersonalizationAnchor": <boolean: true if short enough and specific enough to embed in a follow-up probe>
    }
  ]
}

Rules:
- topicsCovered: only include nodes that were actually addressed in this excerpt
- keyRespondentQuotes: select the 2-3 most specific, most useful quotes only; prefer verbatim evaluative phrases
- A quote is a personalizationAnchor if it is under 12 words AND contains an evaluative or descriptive phrase
- psychologicalPatternSummary must reflect what is observable in the transcript, not speculation
- Output ONLY valid JSON. Nothing else.
`.trim();
}

async function buildSummaryBlock(
  turnsToCompress: TranscriptTurn[],
  llmOutput: LLMCompressionOutput,
  preExtract: PreCompressionExtract,
  qualityRecords: TurnQualityRecord[]
): Promise<TranscriptSummaryBlock> {
  const relevantQualityRecords = qualityRecords.filter(r =>
    r.turnNumber >= turnsToCompress[0].turnIndex &&
    r.turnNumber <= turnsToCompress[turnsToCompress.length - 1].turnIndex
  );

  const engagementDeltas = relevantQualityRecords
    .map(r => r.engagementDelta)
    .filter(d => d !== undefined) as number[];

  const avgEngagement = engagementDeltas.length > 0
    ? engagementDeltas.reduce((sum, d) => sum + d, 0) / engagementDeltas.length
    : 1.0;

  const socialDesirabilityCount = relevantQualityRecords.filter(r => r.socialDesirabilityFlag).length;
  const evasionCount = relevantQualityRecords.filter(r => r.evasionFlag).length;

  return {
    type: "summary_block",
    turnsFrom: turnsToCompress[0].turnIndex,
    turnsTo: turnsToCompress[turnsToCompress.length - 1].turnIndex,
    compressedAt: Date.now(),
    totalTurnsCompressed: turnsToCompress.length,
    
    topicsCovered: llmOutput.topicsCovered,
    keyRespondentQuotes: llmOutput.keyRespondentQuotes,
    psychologicalPatternSummary: llmOutput.psychologicalPatternSummary,
    consistencyProbeOutcomes: preExtract.consistencyProbes,
    agentMovesUsed: preExtract.agentMoves,
    
    averageEngagementDeltaInWindow: avgEngagement,
    socialDesirabilityFlagsInWindow: socialDesirabilityCount,
    evasionFlagsInWindow: evasionCount
  };
}

function stringSimilarity(a: string, b: string): number {
  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;
  if (longer.length === 0) return 1.0;
  const editDistance = levenshteinDistance(shorter, longer);
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = Array.from({ length: b.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b[i - 1] === a[j - 1]
        ? matrix[i - 1][j - 1]
        : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return matrix[b.length][a.length];
}

function updateRetainedQuoteBank(
  bank: RetainedQuoteBank,
  preExtract: PreCompressionExtract,
  llmOutput: LLMCompressionOutput
): RetainedQuoteBank {
  const newBank = { ...bank, byNode: { ...bank.byNode }, highConfidence: [...bank.highConfidence] };

  for (const quote of preExtract.allQuotes) {
    if (!newBank.byNode[quote.nodeId]) {
      newBank.byNode[quote.nodeId] = [];
    }
    
    const isDuplicate = newBank.byNode[quote.nodeId].some(
      existing => stringSimilarity(existing.quote, quote.quote) > 0.85
    );
    
    if (!isDuplicate) {
      newBank.byNode[quote.nodeId].push(quote);
      
      if (newBank.byNode[quote.nodeId].length > 6) {
        newBank.byNode[quote.nodeId].sort((a, b) => b.reliabilityScore - a.reliabilityScore);
        newBank.byNode[quote.nodeId] = newBank.byNode[quote.nodeId].slice(0, 6);
      }
    }
  }

  for (const quote of llmOutput.keyRespondentQuotes) {
    if (quote.isPersonalizationAnchor && quote.reliabilityScore > 0.60) {
      if (!newBank.byNode[quote.nodeId]) {
        newBank.byNode[quote.nodeId] = [];
      }
      
      const isDuplicate = newBank.byNode[quote.nodeId].some(
        existing => stringSimilarity(existing.quote, quote.quote) > 0.85
      );
      
      if (!isDuplicate) {
        newBank.byNode[quote.nodeId].push(quote);
        newBank.highConfidence.push(quote);
      }
    }
  }

  return newBank;
}

export function assembleTranscriptContext(
  transcript: (TranscriptTurn | TranscriptSummaryBlock)[],
  budget: ContextBudget
): string {
  const parts: string[] = [];

  for (const entry of transcript) {
    if (entry.type === "summary_block") {
      parts.push(formatSummaryBlock(entry as TranscriptSummaryBlock));
    } else {
      parts.push(formatFullTurn(entry as TranscriptTurn));
    }
  }

  return parts.join("\n\n");
}

function formatSummaryBlock(block: TranscriptSummaryBlock): string {
  const topicLines = block.topicsCovered.map(t =>
    `  - ${t.nodeLabel}: ${t.keyInsight}${t.wasBlockedBy ? ` [blocked by ${t.wasBlockedBy}]` : ""} (confidence: ${(t.coverageAchieved * 100).toFixed(0)}%)`
  ).join("\n");

  const quotesSection = block.keyRespondentQuotes
    .filter(q => q.isPersonalizationAnchor)
    .slice(0, 4)
    .map(q => `  [${q.nodeLabel}] "${q.quote}"`)
    .join("\n");

  const psychLine = `${block.psychologicalPatternSummary.dominantEmotionalState} · ` +
    `engagement ${block.psychologicalPatternSummary.engagementTrend} · ` +
    `trust ${block.psychologicalPatternSummary.trustTrend}`;

  const consistencySection = block.consistencyProbeOutcomes.length > 0
    ? "\nConsistency issues in this window:\n" + block.consistencyProbeOutcomes.map(c =>
        `  - Turn ${c.turnIndex}: Said "${c.earlierStatement.slice(0, 60)}" then "${c.laterStatement.slice(0, 60)}" — ${c.wasResolved ? "resolved" : "unresolved"}`
      ).join("\n")
    : "";

  return `<transcript_summary turns="${block.turnsFrom}–${block.turnsTo}">
Topics covered in this section:
${topicLines}

Key quotes from respondent:
${quotesSection || "  (none flagged for personalization)"}

Psychological state: ${psychLine}
${consistencySection}
</transcript_summary>`;
}

function formatFullTurn(turn: TranscriptTurn): string {
  const speaker = turn.speaker === "agent" ? "Researcher" : "Respondent";
  return `[Turn ${turn.turnIndex}] ${speaker}: ${turn.text}`;
}

export class MemoryBridge {
  private state: MemoryBridgeState;
  public contextBudget: ContextBudget;

  constructor(contextBudget: ContextBudget = DEFAULT_CONTEXT_BUDGET) {
    this.contextBudget = contextBudget;
    this.state = {
      totalTurnsProcessed: 0,
      compressionCount: 0,
      estimatedCurrentTranscriptTokens: 0,
      retainedQuoteBank: {
        byNode: {},
        highConfidence: [],
        recentlyUsed: new Set()
      },
      contextBudget
    };
  }

  public async processTurn(
    expertState: ExpertState,
    newTurn: TranscriptTurn
  ): Promise<ProcessTurnResult> {
    this.state.totalTurnsProcessed++;

    const turnTokens = estimateTokens(`${newTurn.speaker}: ${newTurn.text}`);
    this.state.estimatedCurrentTranscriptTokens += turnTokens;

    const turnsOnlyCount = expertState.transcript.turns
      .filter((t: any) => t.type !== "summary_block")
      .length;

    const shouldRun = shouldCompress(
      expertState.transcript.turns as TranscriptTurn[],
      this.contextBudget
    ) || (turnsOnlyCount > 24 && expertState.sessionMeta.status !== "closure");

    if (!shouldRun) {
      return {
        transcriptModified: false,
        updatedTranscript: expertState.transcript.turns,
        compressionOccurred: false,
        retainedQuoteBank: this.state.retainedQuoteBank
      };
    }

    const updatedTranscript = await this.compress(expertState);
    
    return {
      transcriptModified: true,
      updatedTranscript,
      compressionOccurred: true,
      retainedQuoteBank: this.state.retainedQuoteBank
    };
  }

  private async compress(
    expertState: ExpertState
  ): Promise<(TranscriptTurn | TranscriptSummaryBlock)[]> {
    const rawTurns = expertState.transcript.turns.filter(
      (t: any) => t.type !== "summary_block"
    ) as TranscriptTurn[];

    const existingSummaryBlocks = expertState.transcript.turns.filter(
      (t: any) => t.type === "summary_block"
    ) as TranscriptSummaryBlock[];

    const { turnsToCompress } = selectTurnsToCompress(rawTurns, this.contextBudget);

    if (turnsToCompress.length === 0) {
      return expertState.transcript.turns; 
    }

    const preExtract = extractBeforeCompression(
      turnsToCompress,
      expertState,
      expertState.qualitySignals.turnRecords as TurnQualityRecord[]
    );

    // BUG-03 FIXED: forward preExtract into callCompressionLLM
    const llmOutput = await this.callCompressionLLM(turnsToCompress, expertState, preExtract);

    if (!llmOutput) {
      const fallbackBlock = this.buildFallbackSummaryBlock(turnsToCompress, preExtract, expertState);
      return this.applyCompressionResult(rawTurns, existingSummaryBlocks, turnsToCompress, fallbackBlock);
    }

    const summaryBlock = await buildSummaryBlock(
      turnsToCompress,
      llmOutput,
      preExtract,
      expertState.qualitySignals.turnRecords as TurnQualityRecord[]
    );

    this.state.retainedQuoteBank = updateRetainedQuoteBank(
      this.state.retainedQuoteBank,
      preExtract,
      llmOutput
    );

    this.state.compressionCount++;

    const remainingTurns = rawTurns.filter(
      t => !turnsToCompress.some(c => c.turnIndex === t.turnIndex)
    );
    const remainingText = remainingTurns.map(t => `${t.speaker}: ${t.text}`).join("\n");
    this.state.estimatedCurrentTranscriptTokens = estimateTokens(remainingText) +
      estimateTokens(formatSummaryBlock(summaryBlock));

    return this.applyCompressionResult(rawTurns, existingSummaryBlocks, turnsToCompress, summaryBlock);
  }

  private async callCompressionLLM(
    turnsToCompress: TranscriptTurn[],
    expertState: ExpertState,
    preExtract: PreCompressionExtract
  ): Promise<LLMCompressionOutput | null> {
    // BUG-03 FIXED: pass the actual preExtract (not {} as any) so consistency probes
    // and agent moves are included in the compression prompt
    const prompt = buildCompressionPrompt(turnsToCompress, expertState, preExtract);

    try {
      // BUG-04 FIXED: use flashLiteModel (not defaultModel/GPT-4.1-mini) for cost efficiency,
      // and correct AI SDK v6 param maxOutputTokens (not maxTokens)
      const response = await generateText({
        model: flashLiteModel,
        messages: [{ role: "user", content: prompt }],
        maxOutputTokens: 1200,
      });

      const jsonText = response.text.trim()
        .replace(/^```json\s*/i, "")
        .replace(/\s*```$/, "");

      const parsed = JSON.parse(jsonText) as LLMCompressionOutput;

      if (!parsed.topicsCovered || !parsed.psychologicalPatternSummary) {
        throw new Error("Invalid LLM compression output structure");
      }

      return parsed;

    } catch (error) {
      console.error("[MemoryBridge] Compression LLM call failed:", error);
      return null;
    }
  }

  private applyCompressionResult(
    rawTurns: TranscriptTurn[],
    existingSummaryBlocks: TranscriptSummaryBlock[],
    compressedTurns: TranscriptTurn[],
    newSummaryBlock: TranscriptSummaryBlock
  ): (TranscriptTurn | TranscriptSummaryBlock)[] {
    const compressedIndices = new Set(compressedTurns.map(t => t.turnIndex));
    const remainingRawTurns = rawTurns.filter(t => !compressedIndices.has(t.turnIndex));
    return [
      ...existingSummaryBlocks,
      newSummaryBlock,
      ...remainingRawTurns
    ];
  }

  public getQuotesForNode(nodeId: string): ExtractedQuote[] {
    return this.state.retainedQuoteBank.byNode[nodeId] ?? [];
  }

  public getHighConfidenceQuotes(): ExtractedQuote[] {
    return this.state.retainedQuoteBank.highConfidence;
  }

  public markQuoteUsed(quote: string): void {
    const hash = quote.slice(0, 40);
    this.state.retainedQuoteBank.recentlyUsed.add(hash);
  }

  public wasQuoteRecentlyUsed(quote: string): boolean {
    return this.state.retainedQuoteBank.recentlyUsed.has(quote.slice(0, 40));
  }

  public serializeForRedis(): string {
    const serializable = {
      ...this.state,
      retainedQuoteBank: {
        ...this.state.retainedQuoteBank,
        recentlyUsed: Array.from(this.state.retainedQuoteBank.recentlyUsed)
      }
    };
    return JSON.stringify(serializable);
  }

  public static fromRedis(serialized: string, contextBudget: ContextBudget): MemoryBridge {
    const bridge = new MemoryBridge(contextBudget);
    const parsed = JSON.parse(serialized);
    bridge.state = {
      ...parsed,
      retainedQuoteBank: {
        ...parsed.retainedQuoteBank,
        recentlyUsed: new Set(parsed.retainedQuoteBank.recentlyUsed)
      }
    };
    return bridge;
  }

  public getCompressionStats() {
    return {
      totalTurnsProcessed: this.state.totalTurnsProcessed,
      compressionCount: this.state.compressionCount,
      estimatedCurrentTranscriptTokens: this.state.estimatedCurrentTranscriptTokens
    };
  }

  private buildFallbackSummaryBlock(
    turnsToCompress: TranscriptTurn[],
    preExtract: PreCompressionExtract,
    expertState: ExpertState
  ): TranscriptSummaryBlock {
    const topicsAddressed = new Set<string>();
    turnsToCompress.forEach(t => {
      (t.coveredNodeIds ?? []).forEach(id => topicsAddressed.add(id));
    });

    const topicsCovered: TopicSummary[] = Array.from(topicsAddressed).map(nodeId => {
      const node = expertState.coverageTracker.nodes.find((n: any) => n.id === nodeId);
      return {
        nodeId,
        nodeLabel: node?.label ?? nodeId,
        coverageAchieved: node?.confidenceScore ?? 0.0,
        keyInsight: `[Fallback summary — LLM compression unavailable]`,
        wasBlockedBy: null
      };
    });

    const keyQuotes = preExtract.allQuotes
      .filter(q => q.isPersonalizationAnchor && q.reliabilityScore > 0.60)
      .slice(0, 4);

    const qualityRecords = expertState.qualitySignals.turnRecords as TurnQualityRecord[];
    const relevantRecords = qualityRecords.filter(r =>
      r.turnNumber >= turnsToCompress[0].turnIndex &&
      r.turnNumber <= turnsToCompress[turnsToCompress.length - 1].turnIndex
    );
    const avgEngagement = relevantRecords.length > 0
      ? relevantRecords.reduce((s, r) => s + (r.engagementDelta ?? 1), 0) / relevantRecords.length
      : 1.0;

    return {
      type: "summary_block",
      turnsFrom: turnsToCompress[0].turnIndex,
      turnsTo: turnsToCompress[turnsToCompress.length - 1].turnIndex,
      compressedAt: Date.now(),
      totalTurnsCompressed: turnsToCompress.length,
      topicsCovered,
      keyRespondentQuotes: keyQuotes,
      psychologicalPatternSummary: {
        engagementTrend: avgEngagement > 1.0 ? "rising" : avgEngagement > 0.85 ? "stable" : "declining",
        trustTrend: "stable", 
        dominantEmotionalState: "[Fallback: state unavailable]",
        defensivePostureAverage: 0.0,
        significantShifts: []
      },
      consistencyProbeOutcomes: preExtract.consistencyProbes,
      agentMovesUsed: preExtract.agentMoves,
      averageEngagementDeltaInWindow: avgEngagement,
      socialDesirabilityFlagsInWindow: relevantRecords.filter(r => r.socialDesirabilityFlag).length,
      evasionFlagsInWindow: relevantRecords.filter(r => r.evasionFlag).length
    };
  }
}
