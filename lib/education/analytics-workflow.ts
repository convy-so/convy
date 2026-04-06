import { nanoid } from "nanoid";

import { analysisModel, defaultModel, generateAIResponse } from "@/lib/ai";
import { replaceEmbeddedSource } from "@/lib/rag/indexer";
import { getEducationProgram } from "./catalog";
import { recordEducationTrace } from "./tracing";
import {
  getAnalyticsSnapshotByVersion,
  getActiveCoveragePlan,
  getAnalyticsState,
  getLatestAnalyticsSnapshot,
  getResearchBrief,
  getSurveyById,
  getSessionById,
  listAnalyticsFactsForSurveyByType,
  listEvidenceForSession,
  listEvidenceForSurveyByType,
  listEffectivePlaybooks,
  listSurveySessionInsightsByType,
  listSessionTurns,
  replaceAnalyticsFacts,
  replaceAnalyticsSnapshot,
  upsertSessionInsight,
} from "./storage";
import {
  analyticsFactSchema,
  conversationInsightSchema,
  evidenceRecordSchema,
  researchBriefSchema,
  type AnalyticsFact,
  type AnalyticsGenerationMetadata,
  type AnalyticsSnapshot,
  type ConversationInsight,
  type EvidenceRecord,
  type ResearchBrief,
} from "./types";
import { executeRAGQuery } from "@/lib/rag/search";
import { renderPlaybookContext } from "./playbooks";
import { getPhasePlaybookContext } from "./runtime-context";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeJsonParse(raw: string): unknown | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function normalizeResearchBrief(value: unknown): ResearchBrief | null {
  const parsed = researchBriefSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }

  return {
    ...parsed.data,
    media: [],
  };
}

function normalizeConversationInsights(values: unknown[]): ConversationInsight[] {
  return values.flatMap((value) => {
    const parsed = conversationInsightSchema.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  });
}

function normalizeEvidenceRecords(values: unknown[]): EvidenceRecord[] {
  return values.flatMap((value) => {
    const parsed = evidenceRecordSchema.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  });
}

function normalizeAnalyticsFacts(values: unknown[]): AnalyticsFact[] {
  return values.flatMap((value) => {
    const parsed = analyticsFactSchema.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  });
}

function parseSynthesisResult(value: unknown): {
  findings?: Array<{
    title: string;
    summary: string;
    nodeIds?: string[];
    supportingEvidenceIds?: string[];
    confidence?: number;
  }>;
  recommendations?: string[];
  dataGaps?: string[];
} | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    findings: Array.isArray(value.findings)
      ? value.findings.flatMap((finding) => {
          if (
            !isRecord(finding) ||
            typeof finding.title !== "string" ||
            typeof finding.summary !== "string"
          ) {
            return [];
          }

          return [{
            title: finding.title,
            summary: finding.summary,
            nodeIds: Array.isArray(finding.nodeIds)
              ? finding.nodeIds.filter((item): item is string => typeof item === "string")
              : undefined,
            supportingEvidenceIds: Array.isArray(finding.supportingEvidenceIds)
              ? finding.supportingEvidenceIds.filter((item): item is string => typeof item === "string")
              : undefined,
            confidence:
              typeof finding.confidence === "number" ? finding.confidence : undefined,
          }];
        })
      : undefined,
    recommendations: Array.isArray(value.recommendations)
      ? value.recommendations.filter((item): item is string => typeof item === "string")
      : undefined,
    dataGaps: Array.isArray(value.dataGaps)
      ? value.dataGaps.filter((item): item is string => typeof item === "string")
      : undefined,
  };
}

function parseSessionInsightSummary(value: unknown): {
  summary?: string;
  keyFindings?: string[];
  risks?: string[];
} | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    summary: typeof value.summary === "string" ? value.summary : undefined,
    keyFindings: Array.isArray(value.keyFindings)
      ? value.keyFindings.filter((item): item is string => typeof item === "string")
      : undefined,
    risks: Array.isArray(value.risks)
      ? value.risks.filter((item): item is string => typeof item === "string")
      : undefined,
  };
}

function parseClassifierResult(value: unknown): {
  intent?: "metric" | "comparison" | "evidence" | "snapshot" | "mixed";
  needsChart?: boolean;
  needsTable?: boolean;
  theme?: string;
} | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    intent:
      value.intent === "metric" ||
      value.intent === "comparison" ||
      value.intent === "evidence" ||
      value.intent === "snapshot" ||
      value.intent === "mixed"
        ? value.intent
        : undefined,
    needsChart:
      typeof value.needsChart === "boolean" ? value.needsChart : undefined,
    needsTable:
      typeof value.needsTable === "boolean" ? value.needsTable : undefined,
    theme: typeof value.theme === "string" ? value.theme : undefined,
  };
}

function parseQuestionAnswerResult(value: unknown): {
  response?: string;
  sources?: Array<{ id: string; label: string }>;
  toolResult?: { toolName: "renderTable" | "renderChart" | null; output: Record<string, unknown> };
} | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    response: typeof value.response === "string" ? value.response : undefined,
    sources: Array.isArray(value.sources)
      ? value.sources.flatMap((source) => {
          if (
            !isRecord(source) ||
            typeof source.id !== "string" ||
            typeof source.label !== "string"
          ) {
            return [];
          }

          return [{ id: source.id, label: source.label }];
        })
      : undefined,
    toolResult:
      isRecord(value.toolResult) &&
      (value.toolResult.toolName === "renderTable" ||
        value.toolResult.toolName === "renderChart" ||
        value.toolResult.toolName === null) &&
      isRecord(value.toolResult.output)
        ? {
            toolName: value.toolResult.toolName,
            output: value.toolResult.output,
          }
        : undefined,
  };
}

function aggregateCoverage(insights: ConversationInsight[], nodeIds: string[]) {
  const totals: Record<string, number> = Object.fromEntries(nodeIds.map((nodeId) => [nodeId, 0]));
  for (const insight of insights) {
    for (const nodeId of nodeIds) {
      totals[nodeId] += Math.max(0, Math.min(1, insight.nodeCoverage[nodeId] ?? 0));
    }
  }
  const divisor = insights.length || 1;
  for (const nodeId of nodeIds) totals[nodeId] = totals[nodeId] / divisor;
  const overall = nodeIds.length
    ? nodeIds.reduce((sum, nodeId) => sum + totals[nodeId], 0) / nodeIds.length
    : 0;
  return { overall, byNode: totals };
}

function buildEvidenceDigest(evidence: EvidenceRecord[]) {
  return evidence
    .slice(0, 40)
    .map((item) => `- ${item.nodeId}: ${item.excerpt}`)
    .join("\n");
}

function deriveThemes(text: string) {
  const normalized = text.toLowerCase();
  const themeMap = [
    "support",
    "barrier",
    "confidence",
    "time",
    "practice",
    "resource",
    "mentor",
    "instructor",
    "feedback",
    "engagement",
  ];
  return themeMap.filter((theme) => normalized.includes(theme));
}

function buildSessionFacts(input: {
  surveyId: string;
  sessionId: string;
  evidence: EvidenceRecord[];
}): AnalyticsFact[] {
  return input.evidence.map((item) => ({
    id: `fact_${item.id}`,
    surveyId: input.surveyId,
    sessionId: input.sessionId,
    nodeId: item.nodeId,
    sentiment: item.sentiment ?? "neutral",
    confidence: Math.max(0.35, Math.min(1, item.reliability / 100)),
    themes: deriveThemes(item.excerpt),
    outcomeSignal: item.evidenceType || "general_feedback",
    sourceEvidenceIds: [item.id],
    metadata: {
      reliability: item.reliability,
      evidenceType: item.evidenceType,
    },
  }));
}

async function computeDerivedMetrics(input: {
  surveyId: string;
  organizationId?: string | null;
  facts: AnalyticsFact[];
}) {
  const playbooks = await listEffectivePlaybooks({
    surveyId: input.surveyId,
    organizationId: input.organizationId ?? null,
    phase: "analytics",
  });

  const metrics = playbooks.flatMap((record) =>
    record.activeVersion?.interpretation.derivedMetrics.map((metric) => ({
      id: metric.id,
      label: metric.label,
      description: metric.description,
      value: input.facts.filter((fact) => {
        if (metric.theme && !fact.themes.includes(metric.theme.toLowerCase())) return false;
        if (metric.nodeId && fact.nodeId !== metric.nodeId) return false;
        if (metric.sentiment && fact.sentiment !== metric.sentiment) return false;
        return true;
      }).length,
    })) ?? [],
  );

  return metrics;
}

async function synthesizeAnalytics(input: {
  surveyId: string;
  brief: ResearchBrief;
  playbookContext: string;
  coverageNodeIds: string[];
  insights: ConversationInsight[];
  evidence: EvidenceRecord[];
}) {
  const program = getEducationProgram(input.brief.programId);
  const systemPrompt = `${program.analyticsPrompt}

${input.playbookContext ? `<active-playbooks>\n${input.playbookContext}\n</active-playbooks>\n\n` : ""}<rules>
- Use only the supplied evidence and insight summaries.
- Keep findings scoped to the brief and program dimensions.
- If support is thin or mixed, lower confidence and use the dataGaps field.
- Put evidence IDs in supportingEvidenceIds only when they exist in the supplied evidence.
</rules>

Return JSON only.
{
  "findings": [{"title":"string","summary":"string","nodeIds":["string"],"supportingEvidenceIds":["string"],"confidence":0.0}],
  "recommendations": ["string"],
  "dataGaps": ["string"]
}`;
  const prompt = `<research-brief>
- Goal: ${input.brief.researchGoal}
- Decision: ${input.brief.decisionToInform}
- Audience: ${input.brief.audienceDefinition}
- Required topics: ${input.brief.requiredTopics.join(", ")}
- Success criteria: ${input.brief.successCriteria.join(", ")}
</research-brief>

<conversation-insights>
${input.insights.map((insight) => `Session ${insight.sessionId}: ${insight.summary}`).join("\n")}
</conversation-insights>

<evidence>
${buildEvidenceDigest(input.evidence)}
</evidence>`;
  const raw = await generateAIResponse(prompt, systemPrompt, {
    model: analysisModel,
    temperature: 0.2,
    maxTokens: 1500,
    surveyId: input.surveyId,
    promptCache: {
      namespace: "analytics-synthesize",
      staticSystemPrompt: systemPrompt,
    },
  });
  return parseSynthesisResult(safeJsonParse(raw));
}

export async function buildAnalyticsSnapshot(
  surveyId: string,
  generation?: Partial<AnalyticsGenerationMetadata>,
): Promise<AnalyticsSnapshot | null> {
  const [briefRow, planRow, survey, evidence, insightRows, latestSnapshot, factRows] = await Promise.all([
    getResearchBrief(surveyId),
    getActiveCoveragePlan(surveyId),
    getSurveyById(surveyId),
    listEvidenceForSurveyByType(surveyId, "live"),
    listSurveySessionInsightsByType(surveyId, "live"),
    getLatestAnalyticsSnapshot(surveyId),
    listAnalyticsFactsForSurveyByType(surveyId, "live"),
  ]);

  if (!briefRow || !planRow) return null;

  const brief = normalizeResearchBrief(briefRow.brief);
  if (!brief) return null;
  const plan = planRow.plan;
  const insights = normalizeConversationInsights(
    insightRows.map((row) => row.insight),
  );
  const evidenceRecords = normalizeEvidenceRecords(
    evidence.map((row) => row.metadata),
  );
  const analyticsFacts = normalizeAnalyticsFacts(
    factRows.map((row) => row.fact),
  );
  const coverage = aggregateCoverage(insights, plan.nodes.map((node) => node.id));
  const completedSessions = insights.filter((insight) => insight.quality.completeness >= 0.8).length;
  const flaggedSessions = insights.filter((insight) => insight.quality.reliability < 0.55).length;
  const averageReliability = insights.length
    ? insights.reduce((sum, insight) => sum + insight.quality.reliability, 0) / insights.length
    : 0;
  const averageFatigue = insights.length
    ? insights.reduce((sum, insight) => sum + insight.quality.fatigue, 0) / insights.length
    : 0;

  const analyticsPlaybookContext = renderPlaybookContext(
    (
      await listEffectivePlaybooks({
        surveyId,
        organizationId: survey?.organizationId ?? null,
        phase: "analytics",
      })
    ).map((record) => ({
      name: record.playbook.name,
      phase: record.playbook.phase,
      scope: record.playbook.scope,
      interpretation: record.activeVersion!.interpretation,
    })),
  );

  const synthesis = await synthesizeAnalytics({
    surveyId,
    brief,
    playbookContext: analyticsPlaybookContext,
    coverageNodeIds: plan.nodes.map((node) => node.id),
    insights,
    evidence: evidenceRecords,
  });
  const derivedMetrics = await computeDerivedMetrics({
    surveyId,
    organizationId: survey?.organizationId ?? null,
    facts: analyticsFacts,
  });

  const version = (latestSnapshot?.version ?? 0) + 1;
  const snapshot: AnalyticsSnapshot = {
    surveyId,
    version,
    generatedAt: new Date().toISOString(),
    programId: brief.programId,
    briefVersion: briefRow.version,
    coverage,
    participation: {
      totalSessions: insights.length,
      completedSessions,
      completionRate: insights.length ? Math.round((completedSessions / insights.length) * 100) : 0,
    },
    quality: {
      averageReliability,
      averageFatigue,
      flaggedSessions,
    },
    findings: (synthesis?.findings ?? []).map((finding) => ({
      id: nanoid(),
      title: finding.title,
      summary: finding.summary,
      nodeIds: finding.nodeIds ?? [],
      supportingEvidenceIds: finding.supportingEvidenceIds ?? [],
      confidence: Math.max(0, Math.min(1, finding.confidence ?? 0.6)),
    })),
    derivedMetrics,
    recommendations: synthesis?.recommendations ?? [],
    dataGaps: synthesis?.dataGaps ?? [],
    keyQuotes: evidenceRecords.slice(0, 8),
    generation: {
      triggeredBy: generation?.triggeredBy ?? "automatic",
      triggerReason: generation?.triggerReason ?? "automatic_refresh",
      materialityScore: generation?.materialityScore ?? 0,
      completedSessionDelta:
        generation?.completedSessionDelta ??
        Math.max(0, completedSessions - (latestSnapshot?.snapshot.participation.completedSessions ?? 0)),
      overallCoverageDelta:
        generation?.overallCoverageDelta ??
        Math.abs(coverage.overall - (latestSnapshot?.snapshot.coverage.overall ?? 0)),
      reliabilityDelta:
        generation?.reliabilityDelta ??
        Math.abs(averageReliability - (latestSnapshot?.snapshot.quality.averageReliability ?? 0)),
      nodeMilestones: generation?.nodeMilestones ?? [],
    },
  };

  await replaceAnalyticsSnapshot(surveyId, snapshot);
  await replaceEmbeddedSource({
    surveyId,
    sourceType: "analytics",
    sourceId: `snapshot:${snapshot.version}`,
    content: [
      `Program: ${brief.programId}`,
      ...snapshot.findings.map((finding) => `${finding.title}: ${finding.summary}`),
      ...snapshot.recommendations.map((item) => `Recommendation: ${item}`),
      ...snapshot.dataGaps.map((item) => `Gap: ${item}`),
    ].join("\n"),
    metadata: {
      version: snapshot.version,
      generatedAt: snapshot.generatedAt,
      sessionType: "live",
    },
  }).catch((error) => {
    console.error("[analytics-workflow] failed to replace embedded insight source", {
      surveyId,
      message: error instanceof Error ? error.message : "Unknown error",
    });
  });
  await recordEducationTrace({
    surveyId,
    traceType: "analytics_snapshot",
    payload: {
      version,
      totalSessions: snapshot.participation.totalSessions,
      findings: snapshot.findings.length,
      dataGaps: snapshot.dataGaps.length,
    },
  });
  return snapshot;
}

export async function buildSessionInsight(sessionId: string): Promise<ConversationInsight | null> {
  const [turns, evidenceRows] = await Promise.all([
    listSessionTurns(sessionId),
    listEvidenceForSession(sessionId),
  ]);
  if (turns.length === 0) return null;

  const surveyId = turns[0].surveyId;
  const [briefRow, sessionRow, survey] = await Promise.all([
    getResearchBrief(surveyId),
    getSessionById(sessionId),
    getSurveyById(surveyId),
  ]);
  if (!briefRow || !sessionRow) return null;

  const brief = normalizeResearchBrief(briefRow.brief);
  if (!brief) return null;
  const transcript = turns
    .map((turn) => `${turn.role === "user" ? "Participant" : "Interviewer"}: ${turn.content}`)
    .join("\n\n");
  const evidence = normalizeEvidenceRecords(evidenceRows.map((row) => row.metadata));

  const playbookContext = await getPhasePlaybookContext({
    surveyId,
    organizationId: survey?.organizationId ?? null,
    phase: "analytics",
  });

  const systemPrompt = `${getEducationProgram(brief.programId).analyticsPrompt}

<task>
Summarize one interview session.
Return JSON only.
</task>

${playbookContext ? `<active-playbooks>\n${playbookContext}\n</active-playbooks>\n\n` : ""}

<rules>
- Keep the summary grounded in what this one session actually revealed.
- Prefer concrete findings over generic sentiment.
- Put contradictions, barriers, or reliability issues into risks when relevant.
</rules>

<schema>{"summary":"string","keyFindings":["string"],"risks":["string"]}</schema>`;
  const prompt = `<transcript>
${transcript}
</transcript>

<evidence>
${buildEvidenceDigest(evidence)}
</evidence>`;
  const raw = await generateAIResponse(prompt, systemPrompt, {
    model: analysisModel,
    temperature: 0.2,
    maxTokens: 500,
    surveyId,
    promptCache: {
      namespace: "analytics-session-insight",
      staticSystemPrompt: systemPrompt,
    },
  }).catch(() => "");
  const parsed = parseSessionInsightSummary(safeJsonParse(raw));

  const state = sessionRow.sessionState;
  const insight: ConversationInsight = {
    sessionId,
    surveyId,
    summary:
      parsed?.summary ||
      evidence[0]?.excerpt ||
      "Interview captured education feedback for this session.",
    nodeCoverage: state.coverageByNode,
    keyFindings: parsed?.keyFindings ?? evidence.slice(0, 3).map((item) => item.excerpt),
    risks: parsed?.risks ?? state.contradictions,
    notableQuotes: evidence.slice(0, 6),
    quality: {
      reliability: state.reliabilityScore,
      completeness: state.overallCoverage,
      fatigue: state.fatigueScore,
    },
  };

  await upsertSessionInsight(surveyId, sessionId, insight);
  await replaceEmbeddedSource({
    surveyId,
    sourceType: "insight",
    sourceId: sessionId,
    content: [insight.summary, ...insight.keyFindings, ...insight.risks].join("\n"),
    metadata: {
      sessionId,
      quality: insight.quality,
      sessionType: sessionRow.sessionType,
    },
  }).catch(() => {
  });
  await replaceAnalyticsFacts(surveyId, sessionId, buildSessionFacts({
    surveyId,
    sessionId,
    evidence,
  }));
  await Promise.all(
    evidence.map((item) =>
      replaceEmbeddedSource({
        surveyId,
        sourceType: "response",
        sourceId: item.id,
        content: item.excerpt,
        metadata: {
          sessionId,
          nodeId: item.nodeId,
          reliability: item.reliability,
          sentiment: item.sentiment ?? "neutral",
          sessionType: sessionRow.sessionType,
        },
      }).catch((error) => {
        console.error("[analytics-workflow] failed to replace embedded evidence source", {
          surveyId,
          sessionId,
          sourceId: item.id,
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }),
    ),
  );
  return insight;
}

export async function answerAnalyticsQuestion(input: {
  surveyId: string;
  question: string;
  language?: string;
}) {
  const [briefRow, snapshotRow, , factsRows, stateRow, survey] = await Promise.all([
    getResearchBrief(input.surveyId),
    getLatestAnalyticsSnapshot(input.surveyId),
    listEvidenceForSurveyByType(input.surveyId, "live"),
    listAnalyticsFactsForSurveyByType(input.surveyId, "live"),
    getAnalyticsState(input.surveyId),
    getSurveyById(input.surveyId),
  ]);

  if (!briefRow || !snapshotRow) {
    return {
      response: "Analytics are not ready yet. Run analytics after collecting some completed sessions.",
      sources: [],
      toolResult: null,
    };
  }

  const brief = normalizeResearchBrief(briefRow.brief);
  if (!brief) {
    return {
      response: "Analytics are not ready yet. Run analytics after collecting some completed sessions.",
      sources: [],
      toolResult: null,
    };
  }
  const program = getEducationProgram(brief.programId);
  const snapshot = snapshotRow.snapshot;
  const facts = normalizeAnalyticsFacts(factsRows.map((row) => row.fact));
  const playbookContext = await getPhasePlaybookContext({
    surveyId: input.surveyId,
    organizationId: survey?.organizationId ?? null,
    phase: "analytics",
  });

  const classifierSystemPrompt = `Classify this analytics question into one of: metric, comparison, evidence, snapshot, mixed.
Return JSON only: {"intent":"metric|comparison|evidence|snapshot|mixed","needsChart":boolean,"needsTable":boolean,"theme":"string"}.`;
  const classifierRaw = await generateAIResponse(`Question: ${input.question}`, classifierSystemPrompt, {
    model: defaultModel,
    temperature: 0,
    maxTokens: 200,
    surveyId: input.surveyId,
    promptCache: {
      namespace: "analytics-question-classifier",
      staticSystemPrompt: classifierSystemPrompt,
    },
  }).catch(() => "");
  const classifier = parseClassifierResult(safeJsonParse(classifierRaw)) ?? {
    intent: "mixed",
    needsChart: false,
    needsTable: false,
  };

  const normalizedQuestion = input.question.toLowerCase();
  const matchingFacts = facts.filter((fact) => {
    if (!classifier.theme) return true;
    return (
      fact.themes.includes(classifier.theme.toLowerCase()) ||
      fact.nodeId.toLowerCase().includes(classifier.theme.toLowerCase()) ||
      fact.outcomeSignal.toLowerCase().includes(classifier.theme.toLowerCase())
    );
  });
  const sentimentBuckets = ["positive", "negative", "neutral", "mixed"] as const;
  const factSummary = sentimentBuckets.map((sentiment) => ({
    label: sentiment,
    value: matchingFacts.filter((fact) => fact.sentiment === sentiment).length,
  }));

  const versionMatch = normalizedQuestion.match(/version\s+(\d+)/);
  const requestedVersion = versionMatch ? Number(versionMatch[1]) : null;
  const compareMatch = normalizedQuestion.match(/compare(?:\s+version)?\s+(\d+)\s+(?:and|with|to)\s+(\d+)/);
  const leftVersion = compareMatch ? Number(compareMatch[1]) : null;
  const rightVersion = compareMatch ? Number(compareMatch[2]) : null;

  const [leftSnapshotRow, rightSnapshotRow, requestedSnapshotRow, retrieved] = await Promise.all([
    leftVersion ? getAnalyticsSnapshotByVersion(input.surveyId, leftVersion) : null,
    rightVersion ? getAnalyticsSnapshotByVersion(input.surveyId, rightVersion) : null,
    requestedVersion && !compareMatch
      ? getAnalyticsSnapshotByVersion(input.surveyId, requestedVersion)
      : null,
    classifier.intent === "evidence" || classifier.intent === "mixed"
      ? executeRAGQuery(input.question, {
          surveyId: input.surveyId,
          sourceType: ["response", "insight", "analytics"],
          sessionType: "live",
          limit: 8,
        }).catch(() => [])
      : Promise.resolve([]),
  ]);

  const evidenceContext = retrieved
    .slice(0, 6)
    .map((item) => `- ${item.id} | ${item.sourceType} | ${item.content}`)
    .join("\n");

  const systemPrompt = `${program.analyticsPrompt}

<task>
Answer the creator's analytics question using the supplied analytics facts, snapshot state, and retrieved evidence.
Return JSON only.
</task>

${playbookContext ? `<active-playbooks>\n${playbookContext}\n</active-playbooks>\n\n` : ""}

<rules>
- For exact counts or percentages, rely on the fact summary or snapshot fields first.
- Use retrieved evidence only for qualitative explanation or quotes.
- Never invent counts.
- Cite snapshot versions and evidence ids when used.
- If support is weak, say so.
- Write the final answer in ${input.language ?? "en"}.
</rules>

<schema>
{
  "response":"string",
  "sources":[{"id":"string","label":"string"}],
  "toolResult":{
    "toolName":"renderTable|renderChart|null",
    "output":{}
  }
}
</schema>`;
  const prompt = `<question>${input.question}</question>

<intent>${classifier.intent}</intent>

<analytics-state>
${JSON.stringify(stateRow?.state ?? null, null, 2)}
</analytics-state>

<latest-snapshot>
${JSON.stringify(snapshot, null, 2)}
</latest-snapshot>

${requestedVersion && !compareMatch ? `<requested-version>${JSON.stringify(requestedSnapshotRow?.snapshot ?? null, null, 2)}</requested-version>` : ""}
${compareMatch ? `<comparison>\n${JSON.stringify({
    left: leftSnapshotRow?.snapshot ?? null,
    right: rightSnapshotRow?.snapshot ?? null,
  }, null, 2)}\n</comparison>` : ""}

<fact-summary>
${JSON.stringify({
    totalFacts: matchingFacts.length,
    sentimentBuckets: factSummary,
    themes: Array.from(new Set(matchingFacts.flatMap((fact) => fact.themes))).slice(0, 10),
  }, null, 2)}
</fact-summary>

<retrieved-evidence>
${evidenceContext || "None"}
</retrieved-evidence>`;
  const raw = await generateAIResponse(prompt, systemPrompt, {
    model: defaultModel,
    temperature: 0.2,
    maxTokens: 900,
    surveyId: input.surveyId,
    promptCache: {
      namespace: "analytics-answer-question",
      staticSystemPrompt: systemPrompt,
    },
  });
  const parsed = parseQuestionAnswerResult(safeJsonParse(raw));
  if (parsed?.response) return parsed;
  return {
    response: "I could not ground a reliable answer from the current analytics snapshot.",
    sources: [],
    toolResult:
      classifier.needsTable
        ? {
            toolName: "renderTable",
            output: {
              title: "Sentiment summary",
              columns: ["Sentiment", "Count"],
              rows: factSummary.map((row) => [row.label, String(row.value)]),
            },
          }
        : classifier.needsChart
          ? {
              toolName: "renderChart",
              output: {
                type: "bar",
                title: "Sentiment summary",
                data: factSummary,
              },
            }
          : null,
  };
}

