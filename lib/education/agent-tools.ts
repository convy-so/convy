import type { VoiceAgentFunction } from "@/lib/voice/deepgram-voice-agent";
import type { ChatMessage, ExtractedData } from "@/lib/chat-types";

export type CreationMediaRecommendation = "add_media" | "not_needed";
export type CreationMediaDecisionStatus =
  | "pending"
  | "not_needed"
  | "declined"
  | "uploaded";

export interface CreationMediaDecision {
  status: CreationMediaDecisionStatus;
  recommendation: CreationMediaRecommendation;
  rationale: string;
  recommendedTypes: string[];
  suggestedDescription: string;
  suggestedFeedbackFocus: string;
}

export const EMPTY_TOOL_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {},
  additionalProperties: false,
};

export const SHOW_MEDIA_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    mediaId: {
      type: "string" as const,
      description: "The media identifier to display.",
    },
  },
  required: ["mediaId"],
  additionalProperties: false,
};

export const REQUEST_MEDIA_UPLOAD_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    allowedTypes: {
      type: "array" as const,
      items: { type: "string" as const },
      description: "Allowed media types, such as image, audio, or video.",
    },
    recommendation: {
      type: "string" as const,
      enum: ["add_media", "not_needed"],
      description:
        "Whether the assistant recommends adding media or thinks media is optional and not necessary.",
    },
    rationale: {
      type: "string" as const,
      description:
        "A short explanation of why media would help or why it is not necessary.",
    },
    suggestedDescription: {
      type: "string" as const,
      description:
        "Suggested description to prefill if the creator chooses to upload media.",
    },
    suggestedFeedbackFocus: {
      type: "string" as const,
      description:
        "Suggested feedback focus or learning goal for the uploaded media.",
    },
  },
  required: [
    "allowedTypes",
    "recommendation",
    "rationale",
    "suggestedDescription",
    "suggestedFeedbackFocus",
  ],
  additionalProperties: false,
};

export function getCreationFinishSurveyToolDefinition() {
  return {
    name: "finishSurvey",
    description:
      "Call this only when the education study brief is complete, the media decision is resolved, and the survey is ready for sample review.",
    parameters: EMPTY_TOOL_INPUT_SCHEMA,
  } as const;
}

export function getCreationRequestMediaUploadToolDefinition() {
  return {
    name: "requestMediaUpload",
    description:
      "Use this after you advise the creator about media so they can decide whether to continue without media or upload optional supporting media now.",
    parameters: REQUEST_MEDIA_UPLOAD_INPUT_SCHEMA,
  } as const;
}

export function getRespondentFinishSurveyToolDefinition() {
  return {
    name: "finishSurvey",
    description:
      "Call this only when the interview has gathered enough evidence and you are ready to close the participant interview naturally.",
    parameters: EMPTY_TOOL_INPUT_SCHEMA,
  } as const;
}

export function getSampleFinishSurveyToolDefinition() {
  return {
    name: "finishSurvey",
    description:
      "Call this only when the interview has gathered enough evidence and you are ready to close the rehearsal naturally.",
    parameters: EMPTY_TOOL_INPUT_SCHEMA,
  } as const;
}

export function getShowMediaToolDefinition() {
  return {
    name: "showMedia",
    description:
      "Display a survey media asset only when it is directly relevant to the current question.",
    parameters: SHOW_MEDIA_INPUT_SCHEMA,
  } as const;
}

export function buildRespondentVoiceFunctions(
  includeMedia: boolean,
): VoiceAgentFunction[] {
  const functions: VoiceAgentFunction[] = [
    getRespondentFinishSurveyToolDefinition(),
  ];

  if (includeMedia) {
    functions.unshift(getShowMediaToolDefinition());
  }

  return functions;
}

export function buildSampleVoiceFunctions(
  includeMedia: boolean,
): VoiceAgentFunction[] {
  const functions: VoiceAgentFunction[] = [getSampleFinishSurveyToolDefinition()];

  if (includeMedia) {
    functions.unshift(getShowMediaToolDefinition());
  }

  return functions;
}

export function buildCreationVoiceFunctions(): VoiceAgentFunction[] {
  return [
    getCreationFinishSurveyToolDefinition(),
    getCreationRequestMediaUploadToolDefinition(),
  ];
}

export function createEmptyMediaDecision(): CreationMediaDecision {
  return {
    status: "pending",
    recommendation: "not_needed",
    rationale: "",
    recommendedTypes: [],
    suggestedDescription: "",
    suggestedFeedbackFocus: "",
  };
}

function normalizeRecommendation(
  value: unknown,
): CreationMediaRecommendation {
  return value === "add_media" ? "add_media" : "not_needed";
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(String).map((item) => item.trim()).filter(Boolean)
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseMaybeJson(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (isRecord(value)) {
    return value;
  }
  if (typeof value !== "string") return null;

  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function getToolPartName(part: unknown): string | null {
  if (!isRecord(part)) return null;
  const p = part;
  if (typeof p.type === "string" && p.type.startsWith("tool-")) {
    return p.type.replace(/^tool-/, "");
  }
  if (
    (p.type === "tool-invocation" || p.type === "tool-call") &&
    typeof p.toolName === "string"
  ) {
    return p.toolName;
  }
  return null;
}

function getToolPartInput(part: unknown): Record<string, unknown> {
  if (!isRecord(part)) {
    return {};
  }

  const candidate = part.input ?? part.args ?? part.parameters;
  return isRecord(candidate) ? candidate : {};
}

function getToolPartOutput(part: unknown): Record<string, unknown> | null {
  if (!isRecord(part)) {
    return null;
  }

  const p = part;
  return parseMaybeJson(p?.output ?? p?.result ?? null);
}

function getLatestRequestMediaUploadPart(messages: ChatMessage[]): unknown | null {
  let latest: unknown | null = null;

  for (const message of Array.isArray(messages) ? messages : []) {
    const parts = Array.isArray(message?.parts) ? message.parts : [];
    for (const part of parts) {
      if (getToolPartName(part) === "requestMediaUpload") {
        latest = part;
      }
    }
  }

  return latest;
}

export function normalizeCreationMediaDecision(
  value: unknown,
): CreationMediaDecision {
  const base = createEmptyMediaDecision();
  const raw = isRecord(value) ? value : {};

  const status = raw.status;
  return {
    status:
      status === "uploaded" ||
      status === "declined" ||
      status === "not_needed" ||
      status === "pending"
        ? status
        : base.status,
    recommendation: normalizeRecommendation(raw.recommendation),
    rationale: typeof raw.rationale === "string" ? raw.rationale : "",
    recommendedTypes: normalizeStringArray(raw.recommendedTypes),
    suggestedDescription:
      typeof raw.suggestedDescription === "string"
        ? raw.suggestedDescription
        : "",
    suggestedFeedbackFocus:
      typeof raw.suggestedFeedbackFocus === "string"
        ? raw.suggestedFeedbackFocus
        : "",
  };
}

export function isCreationMediaDecisionResolved(
  decision: CreationMediaDecision | null | undefined,
): boolean {
  return Boolean(decision && decision.status !== "pending");
}

export function deriveCreationMediaDecision(input: {
  extractedData?: ExtractedData | null;
  messages?: ChatMessage[];
}): CreationMediaDecision {
  const stored = normalizeCreationMediaDecision(input.extractedData?.mediaDecision);
  const latestPart = getLatestRequestMediaUploadPart(input.messages || []);

  if (!latestPart) {
    return stored;
  }

  const partInput = getToolPartInput(latestPart);
  const partOutput = getToolPartOutput(latestPart);
  const recommendation = normalizeRecommendation(partInput.recommendation);

  const next: CreationMediaDecision = {
    ...stored,
    recommendation,
    rationale:
      typeof partInput.rationale === "string"
        ? partInput.rationale
        : stored.rationale,
    recommendedTypes:
      normalizeStringArray(partInput.allowedTypes).length > 0
        ? normalizeStringArray(partInput.allowedTypes)
        : stored.recommendedTypes,
    suggestedDescription:
      typeof partInput.suggestedDescription === "string"
        ? partInput.suggestedDescription
        : stored.suggestedDescription,
    suggestedFeedbackFocus:
      typeof partInput.suggestedFeedbackFocus === "string"
        ? partInput.suggestedFeedbackFocus
        : stored.suggestedFeedbackFocus,
  };

  if (!partOutput) {
    return {
      ...next,
      status: "pending",
    };
  }

  if (
    partOutput.decision === "uploaded" ||
    (partOutput.success === true &&
      Array.isArray(partOutput.media) &&
      partOutput.media.length > 0)
  ) {
    return {
      ...next,
      status: "uploaded",
    };
  }

  if (
    partOutput.decision === "declined" ||
    partOutput.skipped === true ||
    (partOutput.success === false && partOutput.skipped === true)
  ) {
    return {
      ...next,
      status: recommendation === "not_needed" ? "not_needed" : "declined",
    };
  }

  return next;
}

export function applyCreationMediaDecision(
  extractedData: ExtractedData | null | undefined,
  decision: CreationMediaDecision,
): ExtractedData {
  return {
    ...(extractedData || {}),
    mediaDecision: decision,
  };
}
