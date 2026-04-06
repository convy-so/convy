"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SurveyMedia, VoiceAgentMessage } from "@/lib/chat-types";

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

type VoiceWebSocketStatus = "disconnected" | "connecting" | "connected" | "error";

type VoiceSocketJsonMessage = VoiceAgentMessage;

interface UseVoiceWebSocketOptions {
  url: string;
  onMessage?: (message: VoiceSocketJsonMessage) => void;
  onReady?: () => void;
  onError?: (error: unknown) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseSurveyMedia(value: unknown): (SurveyMedia & { id: string }) | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (
    typeof value.id !== "string" ||
    (value.type !== "image" && value.type !== "video" && value.type !== "audio") ||
    typeof value.url !== "string"
  ) {
    return undefined;
  }

  return {
    id: value.id,
    type: value.type,
    url: value.url,
    description: typeof value.description === "string" ? value.description : undefined,
    mimeType: typeof value.mimeType === "string" ? value.mimeType : undefined,
    altText: typeof value.altText === "string" ? value.altText : undefined,
    durationMs: typeof value.durationMs === "number" ? value.durationMs : undefined,
  };
}

function parseVoiceSocketJsonMessage(value: unknown): VoiceSocketJsonMessage | null {
  if (!isRecord(value) || typeof value.type !== "string") {
    return null;
  }

  return {
    type: value.type,
    text: typeof value.text === "string" ? value.text : undefined,
    isFinal: typeof value.isFinal === "boolean" ? value.isFinal : undefined,
    role: typeof value.role === "string" ? value.role : undefined,
    content: typeof value.content === "string" ? value.content : undefined,
    error:
      typeof value.error === "string" || isRecord(value.error)
        ? value.error
        : undefined,
    description: typeof value.description === "string" ? value.description : undefined,
    awaitingAgentIntro:
      typeof value.awaitingAgentIntro === "boolean"
        ? value.awaitingAgentIntro
        : undefined,
    streamId: typeof value.streamId === "string" ? value.streamId : undefined,
    toolCallId: typeof value.toolCallId === "string" ? value.toolCallId : undefined,
    allowedTypes:
      Array.isArray(value.allowedTypes) &&
      value.allowedTypes.every((item) => typeof item === "string")
        ? value.allowedTypes
        : undefined,
    recommendation:
      typeof value.recommendation === "string" ? value.recommendation : undefined,
    rationale: typeof value.rationale === "string" ? value.rationale : undefined,
    suggestedDescription:
      typeof value.suggestedDescription === "string"
        ? value.suggestedDescription
        : undefined,
    suggestedFeedbackFocus:
      typeof value.suggestedFeedbackFocus === "string"
        ? value.suggestedFeedbackFocus
        : undefined,
    extractedData: isRecord(value.extractedData) ? value.extractedData : undefined,
    collectedInfo: isRecord(value.collectedInfo) ? value.collectedInfo : undefined,
    media: parseSurveyMedia(value.media),
    connectionId:
      typeof value.connectionId === "string" ? value.connectionId : undefined,
  };
}

function getTokenFromPayload(value: unknown): string | null {
  if (!isRecord(value) || typeof value.token !== "string") {
    return null;
  }

  return value.token;
}

function getAudioContextConstructor() {
  const AudioContextConstructor = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContextConstructor) {
    throw new Error("AudioContext is not supported in this browser.");
  }
  return AudioContextConstructor;
}

export function useVoiceWebSocket({
  url,
  onMessage,
  onReady,
  onError,
}: UseVoiceWebSocketOptions) {
  const [status, setStatus] = useState<VoiceWebSocketStatus>("disconnected");
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasAudioPlayed, setHasAudioPlayed] = useState(false);
  const [transcription, setTranscription] = useState("");
  const [interimTranscription, setInterimTranscription] = useState("");
  const [isMicMuted, setIsMicMutedState] = useState(false);
  const isMicMutedRef = useRef(false);
  const micEnabledRef = useRef(false);
  const [isMicEnabled, setIsMicEnabled] = useState(false);

  const [lastEventId] = useState<string | null>(null);
  const lastEventIdRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const recordingContextRef = useRef<AudioContext | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const isPlayingRef = useRef(false);
  const isPlayingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isAgentSpeakingRef = useRef(false);
  const lastPlaybackEndTimeRef = useRef<number>(0);
  const nextStartTimeRef = useRef<number>(0);

  useEffect(() => {
    lastEventIdRef.current = lastEventId;
  }, [lastEventId]);

  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const getPlaybackContext = useCallback(() => {
    if (!playbackContextRef.current) {
      const AudioContextConstructor = getAudioContextConstructor();
      playbackContextRef.current = new AudioContextConstructor();
    }

    if (playbackContextRef.current.state === "suspended") {
      void playbackContextRef.current.resume();
    }

    return playbackContextRef.current;
  }, []);

  const queueAudioBuffer = useCallback(
    (audioBuffer: AudioBuffer) => {
      const audioCtx = getPlaybackContext();
      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioCtx.destination);

      const currentTime = audioCtx.currentTime;
      if (nextStartTimeRef.current < currentTime) {
        nextStartTimeRef.current = currentTime + 0.15;
      }

      source.start(nextStartTimeRef.current);
      nextStartTimeRef.current += audioBuffer.duration;

      setIsPlaying(true);
      isPlayingRef.current = true;
      setHasAudioPlayed(true);

      source.onended = () => {
        if (isPlayingTimeoutRef.current) {
          clearTimeout(isPlayingTimeoutRef.current);
        }

        isPlayingTimeoutRef.current = setTimeout(() => {
          if (audioCtx.currentTime >= nextStartTimeRef.current - 0.1) {
            setIsPlaying(false);
            isPlayingRef.current = false;
            lastPlaybackEndTimeRef.current = Date.now();
          }
        }, 100);
      };
    },
    [getPlaybackContext],
  );

  const handleIncomingAudio = useCallback(
    async (blob: Blob) => {
      try {
        const arrayBuffer = await blob.arrayBuffer();
        const sampleRate = 24000;
        const int16Data = new Int16Array(arrayBuffer);
        const float32Data = new Float32Array(int16Data.length);

        for (let index = 0; index < int16Data.length; index += 1) {
          float32Data[index] = int16Data[index] / 32768;
        }

        const audioCtx = getPlaybackContext();
        const audioBuffer = audioCtx.createBuffer(1, float32Data.length, sampleRate);
        audioBuffer.getChannelData(0).set(float32Data);
        queueAudioBuffer(audioBuffer);
      } catch {
      }
    },
    [getPlaybackContext, queueAudioBuffer],
  );

  const stopRecording = useCallback(() => {
    if (workletNodeRef.current) {
      workletNodeRef.current.port.postMessage({ command: "stop" });
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }

    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }

    if (recordingContextRef.current) {
      void recordingContextRef.current.close().catch(() => undefined);
      recordingContextRef.current = null;
    }

    if (playbackContextRef.current) {
      void playbackContextRef.current.close().catch(() => undefined);
      playbackContextRef.current = null;
      nextStartTimeRef.current = 0;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    micEnabledRef.current = false;
    setIsMicEnabled(false);
    setIsRecording(false);
  }, []);

  const startRecording = useCallback(async () => {
    if (isRecording) return;
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const AudioContextConstructor = getAudioContextConstructor();
      const recordingContext = new AudioContextConstructor({ sampleRate: 16000 });
      recordingContextRef.current = recordingContext;
      await recordingContext.audioWorklet.addModule("/audio-worklet-processor.js");

      const source = recordingContext.createMediaStreamSource(stream);
      sourceNodeRef.current = source;

      const workletNode = new AudioWorkletNode(recordingContext, "pcm-processor");
      workletNodeRef.current = workletNode;

      workletNode.port.onmessage = (event) => {
        const payload = event.data;
        if (!isRecord(payload) || payload.type !== "audio") {
          return;
        }

        if (!micEnabledRef.current || wsRef.current?.readyState !== WebSocket.OPEN) {
          return;
        }

        const timeSincePlayback = Date.now() - (lastPlaybackEndTimeRef.current || 0);
        if (
          isAgentSpeakingRef.current ||
          isPlayingRef.current ||
          (lastPlaybackEndTimeRef.current > 0 && timeSincePlayback < 150)
        ) {
          return;
        }

        if (payload.buffer instanceof ArrayBuffer) {
          wsRef.current.send(payload.buffer);
        }
      };

      source.connect(workletNode);
      setIsRecording(true);
    } catch (recordingError) {
      setError("Microphone access failed. Please check permissions.");
      onError?.(recordingError);
    }
  }, [isRecording, onError]);

  const handleJsonMessage = useCallback(
    (data: VoiceSocketJsonMessage) => {
      switch (data.type) {
        case "transcription":
          if (data.isFinal) {
            setTranscription(data.text ?? "");
            setInterimTranscription("");
          }
          break;
        case "transcription_interim":
          setInterimTranscription(data.text ?? "");
          break;
        case "conversation_text":
          if (data.role === "user") {
            setTranscription(data.content ?? "");
            setInterimTranscription("");
          }
          break;
        case "agent_started_speaking":
          isAgentSpeakingRef.current = true;
          break;
        case "agent_ready":
          if (!micEnabledRef.current) {
            micEnabledRef.current = true;
            setIsMicEnabled(true);
            void startRecording().catch(() => {
            });
          }
          break;
        case "agent_audio_done":
          isAgentSpeakingRef.current = false;
          break;
        case "interrupt":
          if (activeAudioRef.current) {
            activeAudioRef.current.pause();
            activeAudioRef.current = null;
          }
          setIsPlaying(false);
          isPlayingRef.current = false;
          isAgentSpeakingRef.current = false;
          break;
        case "error": {
          let nextErrorMessage = "Unknown error";
          if (typeof data.error === "string") {
            nextErrorMessage = data.error;
          } else if (typeof data.description === "string") {
            nextErrorMessage = data.description;
          } else if (data.error !== undefined) {
            nextErrorMessage = JSON.stringify(data.error);
          } else {
            nextErrorMessage = JSON.stringify(data);
          }

          setStatus("error");
          setError(nextErrorMessage);
          onError?.(nextErrorMessage);
          break;
        }
        default:
          break;
      }

      onMessageRef.current?.(data);
    },
    [onError, startRecording],
  );

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    stopRecording();
  }, [stopRecording]);

  const connect = useCallback(async () => {
    if (wsRef.current) return;

    setStatus("connecting");
    setHasAudioPlayed(false);
    setError(null);

    let connectionUrl = url;

    if (url.includes("/voice/sample-conversation")) {
      try {
        const response = await fetch("/api/auth/token");
        if (response.ok) {
          const token = getTokenFromPayload(await response.json());
          if (token) {
            const urlObject = new URL(url);
            urlObject.searchParams.set("token", token);
            connectionUrl = urlObject.toString();
          }
        }
      } catch {
      }
    }

    let ws: WebSocket;
    try {
      ws = new WebSocket(connectionUrl);
      wsRef.current = ws;
    } catch (connectionError) {
      setStatus("error");
      setError(
        connectionError instanceof Error
          ? connectionError.message
          : "Failed to create WebSocket connection",
      );
      onError?.(connectionError);
      return;
    }

    ws.onopen = () => {
      setStatus("connected");
      onReady?.();
    };

    ws.onmessage = async (event) => {
      if (event.data instanceof Blob) {
        await handleIncomingAudio(event.data);
        return;
      }

      if (typeof event.data !== "string") {
        return;
      }

      try {
        const parsed = parseVoiceSocketJsonMessage(JSON.parse(event.data));
        if (!parsed) {
          return;
        }

        handleJsonMessage(parsed);
      } catch {
      }
    };

    ws.onerror = (socketError) => {
      setStatus("error");
      onError?.(socketError);
    };

    ws.onclose = (event) => {
      setStatus((currentStatus) =>
        currentStatus !== "error" ? "disconnected" : currentStatus,
      );
      if (event.reason) {
        setError(event.reason);
      }
      wsRef.current = null;
    };
  }, [handleIncomingAudio, handleJsonMessage, onError, onReady, url]);

  const sendJson = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    } else {
    }
  }, []);

  const enableMic = useCallback(() => {
    micEnabledRef.current = true;
    setIsMicEnabled(true);
  }, []);

  const disableMic = useCallback(() => {
    micEnabledRef.current = false;
    setIsMicEnabled(false);
  }, []);

  const setMicMuted = useCallback((muted: boolean) => {
    isMicMutedRef.current = muted;
    setIsMicMutedState(muted);
  }, []);

  useEffect(() => {
    return () => {
      stopRecording();
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [stopRecording]);

  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  return {
    status,
    statusRef,
    connect,
    disconnect,
    isRecording,
    isPlaying,
    isMicEnabled,
    startRecording,
    stopRecording,
    transcription,
    interimTranscription,
    sendJson,
    error,
    isMicMuted,
    setMicMuted,
    enableMic,
    disableMic,
    hasAudioPlayed,
    lastEventId,
  };
}

