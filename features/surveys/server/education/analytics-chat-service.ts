import { defaultModel, generateAIResponse } from "@/shared/ai";
import { safeJsonParse } from "@/shared/ai/json-object-parser";
import { executeRAGQuery } from "@/shared/retrieval/search";
import { getAnalyticsSnapshotByVersion } from "./storage";
import { sanitizeUserInput } from "@/shared/ai/sanitization";
import {
  ANALYTICS_CHAT_ANSWER_SYSTEM_PROMPT,
  ANALYTICS_CHAT_CLASSIFIER_SYSTEM_PROMPT,
  buildAnalyticsChatAnswerUserPrompt,
  buildAnalyticsChatClassifierUserPrompt,
} from "./prompts/analytics-chat";
import { createLogger, serializeError } from "@/shared/infra/logger";

const log = createLogger("analytics-chat");
const ANALYTICS_CLASSIFIER_CACHE_TTL_MS = 5 * 60 * 1000;
const analyticsClassifierCache = new Map<
  string,
  {
    expiresAt: number;
    value: ReturnType<typeof parseClassifierResult>;
  }
>();


function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}


function parseClassifierResult(value: unknown): {
  intent?: "metric" | "comparison" | "evidence" | "snapshot" | "mixed";
  needsChart?: boolean;
  needsTable?: boolean;
  theme?: string;
} | null {
  if (!isRecord(value)) return null;
  const allowedIntents = [
    "metric",
    "comparison",
    "evidence",
    "snapshot",
    "mixed",
  ] as const;
  const intent =
    typeof value.intent === "string" &&
    allowedIntents.includes(value.intent as (typeof allowedIntents)[number])
      ? (value.intent as (typeof allowedIntents)[number])
      : undefined;
  return {
    intent,
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
  const sources = Array.isArray(value.sources)
    ? value.sources
        .filter(
          (item): item is { id: string; label: string } =>
            isRecord(item) &&
            typeof item.id === "string" &&
            typeof item.label === "string",
        )
    : undefined;
  let toolResult:
    | { toolName: "renderTable" | "renderChart" | null; output: Record<string, unknown> }
    | undefined;

  if (isRecord(value.toolResult) && isRecord(value.toolResult.output)) {
    const toolName =
      value.toolResult.toolName === "renderTable" ||
      value.toolResult.toolName === "renderChart" ||
      value.toolResult.toolName === null
        ? value.toolResult.toolName
        : undefined;

    if (toolName !== undefined) {
      toolResult = {
        toolName,
        output: value.toolResult.output,
      };
    }
  }

  return {
    response: typeof value.response === "string" ? value.response : undefined,
    sources,
    toolResult,
  };
}

function getClassifierCacheKey(surveyId: string, question: string) {
  return `${surveyId}::${question.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

function readClassifierCache(cacheKey: string) {
  const cached = analyticsClassifierCache.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    analyticsClassifierCache.delete(cacheKey);
    return null;
  }
  return cached.value;
}

function writeClassifierCache(
  cacheKey: string,
  value: ReturnType<typeof parseClassifierResult>,
) {
  analyticsClassifierCache.set(cacheKey, {
    expiresAt: Date.now() + ANALYTICS_CLASSIFIER_CACHE_TTL_MS,
    value,
  });
}

function classifyQuestionHeuristically(question: string) {
  const normalizedQuestion = question.toLowerCase();
  if (/compare(?:\s+version)?\s+\d+\s+(?:and|with|to)\s+\d+/.test(normalizedQuestion)) {
    return {
      intent: "comparison" as const,
      needsChart: true,
      needsTable: true,
      theme: "version_comparison",
    };
  }

  if (/version\s+\d+/.test(normalizedQuestion) || /\bsnapshot\b/.test(normalizedQuestion)) {
    return {
      intent: "snapshot" as const,
      needsChart: false,
      needsTable: false,
      theme: "snapshot_lookup",
    };
  }

  if (
    /\b(evidence|quote|quotes|respondent|session|sessions|why|because|examples?)\b/.test(
      normalizedQuestion,
    )
  ) {
    return {
      intent: "evidence" as const,
      needsChart: false,
      needsTable: false,
      theme: "evidence_lookup",
    };
  }

  return null;
}

/**
 * Classify the user's question to determine retrieval strategy
 */
export async function classifyQuestionIntent(surveyId: string, question: string) {
  const cacheKey = getClassifierCacheKey(surveyId, question);
  const cached = readClassifierCache(cacheKey);
  if (cached) {
    return cached ?? {
      intent: "mixed" as const,
      needsChart: false,
      needsTable: false,
    };
  }

  const heuristic = classifyQuestionHeuristically(question);
  if (heuristic) {
    writeClassifierCache(cacheKey, heuristic);
    return heuristic;
  }

  let raw = "";
  try {
    raw = await generateAIResponse(
      buildAnalyticsChatClassifierUserPrompt(question),
      ANALYTICS_CHAT_CLASSIFIER_SYSTEM_PROMPT,
      {
        model: defaultModel,
        temperature: 0,
        maxTokens: 200,
        attribution: {
          surveyId,
          feature: "survey-analytics-chat-classify",
        },
      },
    );
  } catch (error) {
    log.error("classifyQuestionIntent failed; using fallback classifier", {
      survey_id: surveyId,
      ...serializeError(error),
    });
  }

  const result = parseClassifierResult(safeJsonParse(raw)) ?? {
    intent: "mixed" as const,
    needsChart: false,
    needsTable: false,
  };
  writeClassifierCache(cacheKey, result);
  return result;
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
    leftSnapshot: { version: number; snapshot: unknown } | null;
    rightSnapshot: { version: number; snapshot: unknown } | null;
    requestedSnapshot: { version: number; snapshot: unknown } | null;
    retrieved: Array<{ sourceId?: string | null; content: string }> | null;
  };
  classifier: { intent?: string };
}) {
  const { leftSnapshot, rightSnapshot, requestedSnapshot, retrieved } = params.context;
  
  const snapshotPrompt = requestedSnapshot
    ? `Snapshot Version ${requestedSnapshot.version}:\n${JSON.stringify(requestedSnapshot.snapshot, null, 2)}`
    : "";
  const comparisonPrompt = leftSnapshot && rightSnapshot
    ? `Comparison:\nLeft (v${leftSnapshot.version}): ${JSON.stringify(leftSnapshot.snapshot)}\nRight (v${rightSnapshot.version}): ${JSON.stringify(rightSnapshot.snapshot)}`
    : "";
    
  const evidencePrompt = retrieved
    ? `Retrieved Evidence:\n${retrieved.map((r) => {
        const sanitizedContent = sanitizeUserInput(r.content, { maxLength: 800 });
        return `[${r.sourceId}] ${sanitizedContent}`;
      }).join("\n\n")}`
    : "";

  const prompt = buildAnalyticsChatAnswerUserPrompt({
    question: params.question,
    snapshotPrompt,
    comparisonPrompt,
    evidencePrompt,
  });

  let raw = "";
  try {
    raw = await generateAIResponse(prompt, ANALYTICS_CHAT_ANSWER_SYSTEM_PROMPT, {
      model: defaultModel,
      temperature: 0.1,
      maxTokens: 1000,
      attribution: {
        surveyId: params.surveyId,
        feature: "survey-analytics-chat-answer",
      },
    });
  } catch (error) {
    log.error("answerAnalyticsQuestion failed; returning null parse result", {
      survey_id: params.surveyId,
      ...serializeError(error),
    });
  }

  return parseQuestionAnswerResult(safeJsonParse(raw));
}
