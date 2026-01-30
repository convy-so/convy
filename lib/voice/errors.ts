/**
 * Voice Error Codes and User-Friendly Messages
 * Provides standardized error handling across the voice stack
 */

export interface VoiceError {
  code: string;
  message: string;
  userMessage: string;
  retryable: boolean;
  technicalDetails?: string;
}

/**
 * Error code definitions with user-friendly messages
 */
export const VOICE_ERRORS = {
  // Audio Format Errors
  AUDIO_FORMAT_INVALID: {
    code: "AUDIO_FORMAT_INVALID",
    message: "Invalid audio format",
    userMessage: "Your browser sent an unsupported audio format. Please try refreshing the page.",
    retryable: true,
  },
  AUDIO_TRANSCODING_FAILED: {
    code: "AUDIO_TRANSCODING_FAILED",
    message: "Failed to convert audio format",
    userMessage: "We couldn't process your audio. Please check your microphone and try again.",
    retryable: true,
  },
  AUDIO_TOO_LARGE: {
    code: "AUDIO_TOO_LARGE",
    message: "Audio chunk exceeds size limit",
    userMessage: "Audio chunk is too large. This is usually a temporary issue.",
    retryable: true,
  },

  // Microphone & Permission Errors
  MICROPHONE_PERMISSION_DENIED: {
    code: "MICROPHONE_PERMISSION_DENIED",
    message: "Microphone permission denied",
    userMessage: "Please allow microphone access in your browser settings to use voice features.",
    retryable: false,
  },
  MICROPHONE_NOT_FOUND: {
    code: "MICROPHONE_NOT_FOUND",
    message: "No microphone detected",
    userMessage: "No microphone was found. Please connect a microphone and try again.",
    retryable: false,
  },
  MICROPHONE_IN_USE: {
    code: "MICROPHONE_IN_USE",
    message: "Microphone is in use by another application",
    userMessage: "Your microphone is being used by another application. Please close other apps and try again.",
    retryable: true,
  },

  // Google STT Errors
  STT_SERVICE_DISABLED: {
    code: "STT_SERVICE_DISABLED",
    message: "Speech-to-Text API is disabled",
    userMessage: "Voice recognition is temporarily unavailable. Please contact support.",
    retryable: false,
  },
  STT_QUOTA_EXCEEDED: {
    code: "STT_QUOTA_EXCEEDED",
    message: "Speech-to-Text quota exceeded",
    userMessage: "Voice recognition quota exceeded. Please try again later or contact support.",
    retryable: true,
  },
  STT_NETWORK_ERROR: {
    code: "STT_NETWORK_ERROR",
    message: "Network error during speech recognition",
    userMessage: "Network connection issue. Please check your internet and try again.",
    retryable: true,
  },
  STT_STREAM_ERROR: {
    code: "STT_STREAM_ERROR",
    message: "Speech recognition stream error",
    userMessage: "Voice recognition encountered an error. Please try speaking again.",
    retryable: true,
  },

  // Google TTS Errors
  TTS_SERVICE_DISABLED: {
    code: "TTS_SERVICE_DISABLED",
    message: "Text-to-Speech API is disabled",
    userMessage: "Voice playback is temporarily unavailable. Please contact support.",
    retryable: false,
  },
  TTS_QUOTA_EXCEEDED: {
    code: "TTS_QUOTA_EXCEEDED",
    message: "Text-to-Speech quota exceeded",
    userMessage: "Voice synthesis quota exceeded. You'll see text responses instead.",
    retryable: false,
  },
  TTS_SYNTHESIS_FAILED: {
    code: "TTS_SYNTHESIS_FAILED",
    message: "Failed to synthesize speech",
    userMessage: "Couldn't generate voice response. You'll see the text instead.",
    retryable: true,
  },

  // Connection & Network Errors
  WEBSOCKET_CONNECTION_FAILED: {
    code: "WEBSOCKET_CONNECTION_FAILED",
    message: "WebSocket connection failed",
    userMessage: "Failed to connect to voice service. Please refresh the page.",
    retryable: true,
  },
  WEBSOCKET_DISCONNECTED: {
    code: "WEBSOCKET_DISCONNECTED",
    message: "WebSocket connection lost",
    userMessage: "Connection to voice service was lost. Reconnecting...",
    retryable: true,
  },
  NETWORK_TIMEOUT: {
    code: "NETWORK_TIMEOUT",
    message: "Network request timed out",
    userMessage: "Request timed out. Please check your internet connection.",
    retryable: true,
  },

  // Rate Limiting
  RATE_LIMIT_EXCEEDED: {
    code: "RATE_LIMIT_EXCEEDED",
    message: "Rate limit exceeded",
    userMessage: "Too many requests. Please wait a moment and try again.",
    retryable: true,
  },

  // Session Errors
  SESSION_EXPIRED: {
    code: "SESSION_EXPIRED",
    message: "Voice session expired",
    userMessage: "Your session has expired. Please refresh the page.",
    retryable: false,
  },
  SESSION_LIMIT_REACHED: {
    code: "SESSION_LIMIT_REACHED",
    message: "Concurrent session limit reached",
    userMessage: "Maximum number of active voice sessions reached. Please try again later.",
    retryable: true,
  },

  // Configuration Errors
  INVALID_CONFIGURATION: {
    code: "INVALID_CONFIGURATION",
    message: "Invalid voice configuration",
    userMessage: "Voice feature is not properly configured. Please contact support.",
    retryable: false,
  },

  // Generic Errors
  UNKNOWN_ERROR: {
    code: "UNKNOWN_ERROR",
    message: "Unknown error occurred",
    userMessage: "An unexpected error occurred. Please try again.",
    retryable: true,
  },
} as const;

/**
 * Create a voice error with technical details
 */
export function createVoiceError(
  errorCode: keyof typeof VOICE_ERRORS,
  technicalDetails?: string
): VoiceError {
  const errorDef = VOICE_ERRORS[errorCode];
  return {
    ...errorDef,
    technicalDetails,
  };
}

/**
 * Map common JavaScript errors to voice error codes
 */
export function mapBrowserErrorToVoiceError(error: Error): VoiceError {
  const message = error.message.toLowerCase();

  // Microphone permission errors
  if (message.includes("permission") || message.includes("denied")) {
    return createVoiceError("MICROPHONE_PERMISSION_DENIED", error.message);
  }

  if (message.includes("not found") || message.includes("no device")) {
    return createVoiceError("MICROPHONE_NOT_FOUND", error.message);
  }

  if (message.includes("in use") || message.includes("busy")) {
    return createVoiceError("MICROPHONE_IN_USE", error.message);
  }

  // Network errors
  if (message.includes("network") || message.includes("timeout")) {
    return createVoiceError("NETWORK_TIMEOUT", error.message);
  }

  // WebSocket errors
  if (message.includes("websocket") || message.includes("connection")) {
    return createVoiceError("WEBSOCKET_CONNECTION_FAILED", error.message);
  }

  // Default to unknown error
  return createVoiceError("UNKNOWN_ERROR", error.message);
}

/**
 * Send error to client via WebSocket with proper formatting
 */
export function sendVoiceError(
  send: (data: unknown) => void,
  error: VoiceError
): void {
  send({
    type: "error",
    code: error.code,
    message: error.userMessage,
    retryable: error.retryable,
    // Don't send technical details to client in production
    ...(process.env.NODE_ENV === "development" && {
      technicalDetails: error.technicalDetails,
    }),
  });
}
