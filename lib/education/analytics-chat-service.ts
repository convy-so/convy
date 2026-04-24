import { defaultModel, generateAIResponse } from "@/lib/ai";
import { executeRAGQuery } from "@/lib/rag/search";
import { getAnalyticsSnapshotByVersion } from "./storage";
import { sanitizeUserInput } from "@/lib/ai/sanitization";

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

function parseClassifierResult(value: unknown): {
  intent?: "metric" | "comparison" | "evidence" | "snapshot" | "mixed";
  needsChart?: boolean;
  needsTable?: boolean;
  theme?: string;
} | null {
  if (!isRecord(value)) return null;
  return {
    intent: ["metric", "comparison", "evidence", "snapshot", "mixed"].includes(value.intent as string) ? (value.intent as any) : undefined,
    needsChart: typeof value.needsChart === "boolean" ? value.needsChart : undefined,
    needsTable: typeof value.needsTable === "boolean" ? value.needsTable : undefined,
    theme: typeof value.theme === "string" ? value.theme : undefined,
  };
}

function parseQuestionAnswerResult(value: unknown): {
  response?: string;
  sources?: Array<{ id: string; label: string }>;
  toolResult?: { toolName: "renderTable" | "renderChart" | null; output: Record<string, unknown> };
} | null {
  if (!isRecord(value)) return null;
  return {
    response: typeof value.response === "string" ? value.response : undefined,
    sources: Array.isArray(value.sources) ? value.sources.filter(isRecord) as any : undefined,
    toolResult: isRecord(value.toolResult) ? (value.toolResult as any) : undefined,
  };
}

/**
 * Classify the user's question to determine retrieval strategy
 */
export async function classifyQuestionIntent(surveyId: string, question: string) {
  const systemPrompt = `Classify this analytics question into one of: metric, comparison, evidence, snapshot, mixed.
Return JSON only: {"intent":"metric|comparison|evidence|snapshot|mixed","needsChart":boolean,"needsTable":boolean,"theme":"string"}.`;

  const raw = await generateAIResponse(`Question: ${question}`, systemPrompt, {
    model: defaultModel,
    temperature: 0,
    maxTokens: 200,
    surveyId,
  }).catch(() => "");

  return parseClassifierResult(safeJsonParse(raw)) ?? {
    intent: "mixed" as const,
    needsChart: false,
    needsTable: false,
  };
}

/**
 * Retrieve relevant context for an analytics question
 */
export async function retrieveQuestionContext(params: {
  surveyId: string;
  question: string;
  classifier: { intent?: string };
}) {
  const normalizedQuestion = params.question.toLowerCase();
  
  // Extract version requests
  const versionMatch = normalizedQuestion.match(/version\s+(\d+)/);
  const requestedVersion = versionMatch ? Number(versionMatch[1]) : null;
  const compareMatch = normalizedQuestion.match(/compare(?:\s+version)?\s+(\d+)\s+(?:and|with|to)\s+(\d+)/);
  const leftVersion = compareMatch ? Number(compareMatch[1]) : null;
  const rightVersion = compareMatch ? Number(compareMatch[2]) : null;

  const [leftSnapshot, rightSnapshot, requestedSnapshot, retrieved] = await Promise.all([
    leftVersion ? getAnalyticsSnapshotByVersion(params.surveyId, leftVersion) : null,
    rightVersion ? getAnalyticsSnapshotByVersion(params.surveyId, rightVersion) : null,
    requestedVersion && !compareMatch ? getAnalyticsSnapshotByVersion(params.surveyId, requestedVersion) : null,
    params.classifier.intent === "evidence" || params.classifier.intent === "mixed"
      ? executeRAGQuery(params.question, {
          surveyId: params.surveyId,
          sourceType: ["response", "insight", "analytics"],
          sessionType: "live",
          limit: 8,
        })
      : null,
  ]);

  return { leftSnapshot, rightSnapshot, requestedSnapshot, retrieved };
}

/**
 * Generate an answer to a chat question about the survey data
 */
export async function answerAnalyticsQuestion(params: {
  surveyId: string;
  question: string;
  context: {
    leftSnapshot: any;
    rightSnapshot: any;
    requestedSnapshot: any;
    retrieved: any[] | null;
  };
  classifier: any;
}) {
  const { leftSnapshot, rightSnapshot, requestedSnapshot, retrieved } = params.context;
  
  const snapshotPrompt = requestedSnapshot
    ? `Snapshot Version ${requestedSnapshot.version}:\n${JSON.stringify(requestedSnapshot.snapshot, null, 2)}`
    : "";
  const comparisonPrompt = leftSnapshot && rightSnapshot
    ? `Comparison:\nLeft (v${leftSnapshot.version}): ${JSON.stringify(leftSnapshot.snapshot)}\nRight (v${rightSnapshot.version}): ${JSON.stringify(rightSnapshot.snapshot)}`
    : "";
    
  const evidencePrompt = retrieved
    ? `Retrieved Evidence:\n${retrieved.map((r: any) => {
        const sanitizedContent = sanitizeUserInput(r.content, { maxLength: 800 });
        return `[${r.sourceId}] ${sanitizedContent}`;
      }).join("\n\n")}`
    : "";

  const systemPrompt = `You are an education research assistant. Answer the user's question based on the provided data snapshots and evidence.
If the question is about a specific version, use only that version's data.
If the question asks for a chart or table, include a toolResult.
Return JSON only: {"response":"string","sources":[{"id":"string","label":"string"}],"toolResult":{"toolName":"renderTable|renderChart|null","output":{}}}`;

  const prompt = `Question: ${params.question}\n\n${snapshotPrompt}\n${comparisonPrompt}\n${evidencePrompt}`;

  const raw = await generateAIResponse(prompt, systemPrompt, {
    model: defaultModel,
    temperature: 0.1,
    maxTokens: 1000,
    surveyId: params.surveyId,
  }).catch(() => "");

  return parseQuestionAnswerResult(safeJsonParse(raw));
}
