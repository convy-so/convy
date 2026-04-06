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
      "Call this only when the education study brief is complete and the survey is ready for sample review.",
    parameters: EMPTY_TOOL_INPUT_SCHEMA,
  } as const;
}

export function getCreationRequestMediaUploadToolDefinition() {
  return {
    name: "requestMediaUpload",
    description:
      "Legacy survey media tool. Survey media is disabled and this should not be used.",
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
      "Legacy survey media tool. Survey media is disabled and this should not be used.",
    parameters: SHOW_MEDIA_INPUT_SCHEMA,
  } as const;
}

export function buildRespondentVoiceFunctions(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- parameter kept for signature compatibility while media support is disabled
  _includeMedia: boolean,
): VoiceAgentFunction[] {
  return [getRespondentFinishSurveyToolDefinition()];
}

export function buildSampleVoiceFunctions(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- parameter kept for signature compatibility while media support is disabled
  _includeMedia: boolean,
): VoiceAgentFunction[] {
  return [getSampleFinishSurveyToolDefinition()];
}

export function buildCreationVoiceFunctions(): VoiceAgentFunction[] {
  return [getCreationFinishSurveyToolDefinition()];
}

export function createEmptyMediaDecision(): CreationMediaDecision {
  return {
    status: "not_needed",
    recommendation: "not_needed",
    rationale: "Survey media is disabled for creation, rehearsal, and respondent flows.",
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
  void input;
  return createEmptyMediaDecision();
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
