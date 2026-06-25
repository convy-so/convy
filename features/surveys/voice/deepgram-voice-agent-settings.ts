import type { SupportedVoiceLocale } from "@/features/surveys/voice/voice-locales";
import {
  SURVEY_DEFAULTS,
  SURVEY_TONE,
  type SurveyTone,
} from "@/shared/surveys/constants";

export type SupportedLanguage = SupportedVoiceLocale;

export interface VoiceAgentFunction {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  client_side?: boolean;
  endpoint?: {
    url: string;
    method: string;
    headers?: Record<string, string>;
  };
}

export interface VoiceAgentSettings {
  audio?: {
    input?: { encoding?: string; sample_rate?: number };
    output?: { encoding?: string; sample_rate?: number; container?: string };
  };
  agent: {
    language?: string;
    listen?: {
      provider: {
        type: string;
        model?: string;
        version?: string;
        language?: string;
        smart_format?: boolean;
        endpointing?: number;
        keyterms?: string[];
      };
    };
    think: {
      provider: { type: string; model?: string };
      endpoint?: {
        url: string;
        headers?: Record<string, string>;
      };
      prompt: string;
      functions?: VoiceAgentFunction[];
    };
    speak?: {
      provider: {
        type: string;
        model?: string;
        model_id?: string;
      };
    };
    greeting?: string;
    context?: {
      messages: Array<{ role: string; content: string }>;
    };
  };
  flags?: {
    history?: boolean;
  };
}

export interface ConversationTextEvent {
  role: "user" | "assistant";
  content: string;
}

export interface FunctionCallRequestEvent {
  function_call_id: string;
  function_name: string;
  input: Record<string, unknown>;
}

const VOICE_AGENT_PROVIDER = {
  llm: "open_ai",
  speech: "deepgram",
} as const;

const VOICE_AGENT_MODELS = {
  think: "gpt-4.1-mini",
  transcription: "nova-3",
  transcriptionVersion: "v1",
} as const;

const VOICE_AGENT_AUDIO = {
  inputEncoding: "linear16",
  outputEncoding: "linear16",
  outputContainer: "none",
  inputSampleRate: 16000,
  outputSampleRate: 24000,
  endpointingMs: 500,
} as const;

const VOICE_AGENT_LANGUAGE = {
  multilingual: "multi",
} as const;

const VOICE_MODEL_MAP: Record<
  SupportedLanguage,
  {
    [SURVEY_TONE.CASUAL]: string;
    [SURVEY_TONE.FORMAL]: string;
    [SURVEY_TONE.EMPATHETIC]: string;
  }
> = {
  en: {
    casual: "aura-2-asteria-en",
    formal: "aura-2-orpheus-en",
    empathetic: "aura-2-vesta-en",
  },
  fr: {
    casual: "aura-2-agathe-fr",
    formal: "aura-2-hector-fr",
    empathetic: "aura-2-agathe-fr",
  },
  de: {
    casual: "aura-2-viktoria-de",
    formal: "aura-2-fabian-de",
    empathetic: "aura-2-viktoria-de",
  },
};

export function getVoiceModel(
  language: SupportedLanguage,
  tone: SurveyTone = SURVEY_DEFAULTS.tone,
): string {
  const models = VOICE_MODEL_MAP[language] || VOICE_MODEL_MAP.en;
  if (tone === SURVEY_TONE.FORMAL) return models.formal;
  if (tone === SURVEY_TONE.EMPATHETIC) return models.empathetic;
  return models.casual;
}

export const VOICE_AGENT_THINK_MODEL = VOICE_AGENT_MODELS.think;

export function buildVoiceAgentSettings(options: {
  language: SupportedLanguage;
  tone?: SurveyTone;
  systemPrompt: string;
  greeting?: string;
  functions?: VoiceAgentFunction[];
  keyterms?: string[];
  conversationHistory?: Array<{ role: string; content: string }>;
  agentTurnEndpoint?: {
    url: string;
    sessionId: string;
    surveyId: string;
    internalKey: string;
  };
}): VoiceAgentSettings {
  const {
    language,
    tone = SURVEY_DEFAULTS.tone,
    systemPrompt,
    greeting,
    functions,
    keyterms,
    conversationHistory,
    agentTurnEndpoint,
  } = options;

  const voiceModel = getVoiceModel(language, tone);

  const thinkBlock: VoiceAgentSettings["agent"]["think"] = {
    provider: {
      type: VOICE_AGENT_PROVIDER.llm,
      model: VOICE_AGENT_THINK_MODEL,
    },
    prompt: `${systemPrompt}\n\nRespond to the user in the language they are speaking to you in. If the user speaks Spanish, reply in natural Spanish. Match the language of each user message independently to provide seamless multilingual support.`,
    ...(functions && functions.length > 0
      ? {
          functions: functions.map((fn) => {
            const functionConfig = { ...fn };
            delete functionConfig.client_side;
            return functionConfig;
          }),
        }
      : {}),
  };

  if (agentTurnEndpoint) {
    thinkBlock.endpoint = {
      url: agentTurnEndpoint.url,
      headers: {
        "x-internal-key": agentTurnEndpoint.internalKey,
        "x-session-id": agentTurnEndpoint.sessionId,
        "x-survey-id": agentTurnEndpoint.surveyId,
      },
    };
  }

  return {
    flags: {
      history: true,
    },
    audio: {
      input: {
        encoding: VOICE_AGENT_AUDIO.inputEncoding,
        sample_rate: VOICE_AGENT_AUDIO.inputSampleRate,
      },
      output: {
        encoding: VOICE_AGENT_AUDIO.outputEncoding,
        sample_rate: VOICE_AGENT_AUDIO.outputSampleRate,
        container: VOICE_AGENT_AUDIO.outputContainer,
      },
    },
    agent: {
      listen: {
        provider: {
          type: VOICE_AGENT_PROVIDER.speech,
          model: VOICE_AGENT_MODELS.transcription,
          version: VOICE_AGENT_MODELS.transcriptionVersion,
          language: VOICE_AGENT_LANGUAGE.multilingual,
          smart_format: true,
          endpointing: VOICE_AGENT_AUDIO.endpointingMs,
          ...(keyterms && keyterms.length > 0 ? { keyterms } : {}),
        },
      },
      think: thinkBlock,
      speak: {
        provider: {
          type: VOICE_AGENT_PROVIDER.speech,
          model: voiceModel,
        },
      },
      ...(greeting ? { greeting } : {}),
      ...(conversationHistory && conversationHistory.length > 0
        ? {
            context: {
              messages: conversationHistory.map((message) => ({
                role: message.role === "user" ? "user" : "assistant",
                content: message.content,
              })),
            },
          }
        : {}),
    },
  };
}
