"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface UseVoiceWebSocketOptions {
  url: string;
  onMessage?: (message: Record<string, unknown>) => void;
  onReady?: () => void;
  onError?: (error: unknown) => void;
}

export function useVoiceWebSocket({
  url,
  onMessage,
  onReady,
  onError,
}: UseVoiceWebSocketOptions) {
  const [status, setStatus] = useState<
    "disconnected" | "connecting" | "connected" | "error"
  >("disconnected");
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasAudioPlayed, setHasAudioPlayed] = useState(false);
  const [transcription, setTranscription] = useState("");
  const [interimTranscription, setInterimTranscription] = useState("");
  const [isMicMuted, setIsMicMutedState] = useState(false);
  const isMicMutedRef = useRef(false);
  // Gate: mic audio is sent to WS only after the greeting ends (agent_audio_done)
  // This prevents ambient silence from triggering UserStartedSpeaking before AI greeted,
  // and prevents echo from AI TTS being picked up by the mic.
  const micEnabledRef = useRef(false);
  const [isMicEnabled, setIsMicEnabled] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const recordingContextRef = useRef<AudioContext | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioQueueRef = useRef<Blob[]>([]);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const isPlayingRef = useRef(false);
  const isPlayingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isAgentSpeakingRef = useRef(false); // Gate for local mic gating

  // Keep latest callback in ref to avoid stale closures in ws.onmessage
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const getPlaybackContext = useCallback(() => {
    if (!playbackContextRef.current) {
      playbackContextRef.current = new (window.AudioContext ||
        (window as typeof window & { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext)();
    }
    if (playbackContextRef.current.state === "suspended") {
      playbackContextRef.current.resume();
    }
    return playbackContextRef.current;
  }, []);

  // Queue for scheduling audio chunks continuously
  const nextStartTimeRef = useRef<number>(0);

  const queueAudioBuffer = useCallback(
    (audioBuffer: AudioBuffer) => {
      const audioCtx = getPlaybackContext();
      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioCtx.destination);

      // Schedule playback
      const currentTime = audioCtx.currentTime;
      if (nextStartTimeRef.current < currentTime) {
        // INCREASED JITTER BUFFER: 150ms (0.15) to prevent interruptions/chunks
        nextStartTimeRef.current = currentTime + 0.15;
      }

      if (Math.random() < 0.05) {
        console.log(
          `[ChainOfTrust] [Hook] 🔈 Scheduling audio chunk at ${nextStartTimeRef.current.toFixed(
            3,
          )}s (Context time: ${currentTime.toFixed(3)}s)`,
        );
      }

      source.start(nextStartTimeRef.current);
      nextStartTimeRef.current += audioBuffer.duration;

      setIsPlaying(true);
      isPlayingRef.current = true;
      setHasAudioPlayed(true);

      source.onended = () => {
        // HYSTERESIS: Wait 250ms before saying "not playing" to bridge tiny gaps
        if (isPlayingTimeoutRef.current)
          clearTimeout(isPlayingTimeoutRef.current);

        isPlayingTimeoutRef.current = setTimeout(() => {
          if (audioCtx.currentTime >= nextStartTimeRef.current - 0.1) {
            setIsPlaying(false);
            isPlayingRef.current = false;
          }
        }, 250);
      };
    },
    [getPlaybackContext],
  );

  const handleIncomingAudio = useCallback(
    async (blob: Blob) => {
      // We now receive raw PCM (linear16, 24kHz) from Deepgram
      // Convert Blob -> ArrayBuffer -> Int16Array -> Float32Array -> AudioBuffer
      try {
        const arrayBuffer = await blob.arrayBuffer();
        const sampleRate = 24000;
        const int16Data = new Int16Array(arrayBuffer);
        const float32Data = new Float32Array(int16Data.length);

        // Convert Int16 to Float32 [-1.0, 1.0]
        for (let i = 0; i < int16Data.length; i++) {
          float32Data[i] = int16Data[i] / 32768.0;
        }

        const totalDuration = float32Data.length / sampleRate;
        if (Math.random() < 0.05) {
          console.log(
            `[ChainOfTrust] [Hook] 📥 Received audio chunk: ${
              arrayBuffer.byteLength
            } bytes (${(totalDuration * 1000).toFixed(1)}ms)`,
          );
        }

        const audioCtx = getPlaybackContext();
        const audioBuffer = audioCtx.createBuffer(
          1,
          float32Data.length,
          sampleRate,
        );
        audioBuffer.getChannelData(0).set(float32Data);

        // Queue and play
        queueAudioBuffer(audioBuffer);
      } catch (err) {
        console.error("[Voice WS] Error processing audio chunk:", err);
      }
    },
    [getPlaybackContext, queueAudioBuffer],
  );

  const stopRecording = useCallback(() => {
    // Stop the worklet
    if (workletNodeRef.current) {
      workletNodeRef.current.port.postMessage({ command: "stop" });
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }

    // Disconnect source
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }

    // Close audio contexts
    if (recordingContextRef.current) {
      recordingContextRef.current.close().catch(console.error);
      recordingContextRef.current = null;
    }

    if (playbackContextRef.current) {
      playbackContextRef.current.close().catch(console.error);
      playbackContextRef.current = null;
      nextStartTimeRef.current = 0;
    }

    // Stop media stream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    // Reset mic gate on stop — next session starts muted
    micEnabledRef.current = false;
    setIsMicEnabled(false);
    setIsRecording(false);
  }, []);

  /**
   * Start recording using AudioWorklet for raw PCM capture
   * The worklet handles downsampling from the native sample rate (typically 48kHz) to 16kHz
   * and buffers audio into ~80ms chunks (2560 bytes) as required by Deepgram Flux
   */
  const startRecording = useCallback(async () => {
    if (isRecording) return;
    console.log(
      "[ChainOfTrust] [Hook] 🎤 startRecording requested. Checking permissions...",
    );
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      console.log("[ChainOfTrust] [Hook] ✅ Microphone stream acquired.");
      streamRef.current = stream;

      const recordingContext = new AudioContext({ sampleRate: 16000 });
      console.log(
        `[ChainOfTrust] [Hook] Created AudioContext at ${recordingContext.sampleRate}Hz`,
      );
      recordingContextRef.current = recordingContext;

      await recordingContext.audioWorklet.addModule(
        "/audio-worklet-processor.js",
      );
      console.log("[ChainOfTrust] [Hook] AudioWorklet module loaded.");

      const source = recordingContext.createMediaStreamSource(stream);
      sourceNodeRef.current = source;

      const workletNode = new AudioWorkletNode(
        recordingContext,
        "pcm-processor",
      );
      workletNodeRef.current = workletNode;

      workletNode.port.onmessage = (event) => {
        if (
          event.data.type === "audio" &&
          micEnabledRef.current &&
          wsRef.current?.readyState === WebSocket.OPEN
        ) {
          // Chain of Trust: Audio Egress
          // Echo Protection: Gate mic audio if AI is actively speaking
          if (isAgentSpeakingRef.current) {
            return;
          }

          if (Math.random() < 0.01) {
            // Very throttled
            console.log(
              `[ChainOfTrust] [Hook] 📤 Forwarding PCM chunk to server (${event.data.buffer.byteLength} bytes)`,
            );
          }
          wsRef.current.send(event.data.buffer);
        }
      };

      source.connect(workletNode);
      setIsRecording(true);
    } catch (e) {
      console.error("[ChainOfTrust] [Hook] ❌ startRecording failed:", e);
      setError("Microphone access failed. Please check permissions.");
      onError?.(e);
    }
  }, [isRecording, onError]);

  const handleJsonMessage = useCallback(
    (data: Record<string, unknown>) => {
      switch (data.type) {
        case "transcription":
          if (data.isFinal) {
            setTranscription(data.text as string);
            setInterimTranscription("");
          }
          break;
        case "transcription_interim":
          setInterimTranscription(data.text as string);
          break;
        case "conversation_text":
          // Voice Agent API: unified conversation text event
          if (data.role === "user") {
            setTranscription(data.content as string);
            setInterimTranscription("");
          }
          break;
        case "audio_sent":
          // AI started speaking (legacy)
          break;
        case "agent_thinking":
          // AI is processing (Voice Agent API)
          break;
        case "agent_started_speaking":
          // AI started speaking (Voice Agent API)
          isAgentSpeakingRef.current = true;
          break;
        case "agent_ready":
          // Deepgram settings applied: agent is ready to listen
          // We open the gate NOW so user can barge-in and interrupt greetings!
          if (!micEnabledRef.current) {
            console.log(
              "[Voice WS] 🤖 Agent Ready: un-gating mic for user input",
            );
            micEnabledRef.current = true;
            setIsMicEnabled(true);

            // Proactively start recording for high-premium hands-free experience
            // Users who clicked "Start" have already given gesture-based permission
            startRecording().catch((err) => {
              console.error("[Voice WS] Failed to auto-start recording:", err);
            });
          }
          break;
        case "agent_audio_done":
          // AI finished speaking
          isAgentSpeakingRef.current = false;
          break;
        case "speech_start":
          // User started speaking
          break;
        case "interrupt":
          console.log("[Voice WS] Interruption signal received");
          // Clear queue
          audioQueueRef.current = [];
          // Stop current playback
          if (activeAudioRef.current) {
            activeAudioRef.current.pause();
            activeAudioRef.current = null;
          }
          setIsPlaying(false);
          isPlayingRef.current = false;
          isAgentSpeakingRef.current = false;
          break;
        case "error":
          console.error(
            "[ChainOfTrust] [Hook] ❌ Server-reported error:",
            JSON.stringify(data, null, 2),
          );
          // Extract a string representation of the error to show in UI
          let errorMessage = "Unknown error";
          if (data.error) {
            errorMessage =
              typeof data.error === "string"
                ? data.error
                : JSON.stringify(data.error);
          } else if (data.description) {
            errorMessage = data.description as string;
          } else {
            errorMessage = JSON.stringify(data);
          }

          console.error(
            "[ChainOfTrust] [Hook] Calculated error message:",
            errorMessage,
          );
          setStatus("error");
          setError(errorMessage);
          if (onError) onError(errorMessage);
          break;
        default:
          console.log(
            `[ChainOfTrust] [Hook] Unhandled message type: ${data.type}`,
          );
          break;
      }
      onMessageRef.current?.(data);
    },
    [onError, startRecording],
  );

  // Initialize WebSocket
  const connect = useCallback(async () => {
    console.log("[Voice WS] connect() called", { url });
    if (wsRef.current) {
      console.log("[Voice WS] Already have connection, skipping");
      return;
    }

    console.log("[Voice WS] Setting status to connecting");
    setStatus("connecting");
    setHasAudioPlayed(false);
    setError(null);
    console.log("[Voice WS] Connection state reset. hasAudioPlayed=false");

    let connectionUrl = url;

    // Auto-inject token if we can find one for authenticated endpoints
    // We do this check to avoid fetching for public endpoints
    if (
      url.includes("/voice/survey-creation") ||
      url.includes("/voice/sample-conversation") ||
      url.includes("/analytics")
    ) {
      try {
        console.log("[Voice WS] Fetching auth token...");
        const res = await fetch("/api/auth/token");
        console.log("[Voice WS] Token fetch response:", res.status, res.ok);
        if (res.ok) {
          const { token } = await res.json();
          console.log(
            "[Voice WS] Got token:",
            token ? `${token.substring(0, 20)}...` : "null",
          );
          if (token) {
            const urlObj = new URL(url);
            urlObj.searchParams.set("token", token);
            connectionUrl = urlObj.toString();
            console.log("[Voice WS] Updated connection URL with token");
          }
        } else {
          console.warn(
            "[Voice WS] Token fetch failed with status:",
            res.status,
          );
        }
      } catch (e) {
        console.error("[Voice WS] Failed to fetch auth token:", e);
      }
    }

    let ws: WebSocket;
    try {
      console.log(
        "[Voice WS] Creating WebSocket connection to:",
        connectionUrl,
      );
      ws = new WebSocket(connectionUrl);
      wsRef.current = ws;
      console.log(
        "[Voice WS] WebSocket object created, readyState:",
        ws.readyState,
      );
    } catch (e) {
      console.error("[Voice WS] Failed to create WebSocket instance:", e);
      setStatus("error");
      setError(
        e instanceof Error
          ? e.message
          : "Failed to create WebSocket connection",
      );
      onError?.(e);
      return;
    }

    ws.onopen = () => {
      console.log("[Voice WS] ✅ WebSocket OPENED successfully!");
      setStatus("connected");
      onReady?.();
    };

    ws.onmessage = async (event) => {
      if (event.data instanceof Blob) {
        // Chain of Trust: Audio Ingress
        if (Math.random() < 0.1) {
          // Reduced noise
          console.log(
            `[ChainOfTrust] [Hook] 📥 Received audio chunk: ${event.data.size} bytes`,
          );
        }
        handleIncomingAudio(event.data);
      } else {
        try {
          const data = JSON.parse(event.data) as Record<string, unknown>;
          console.log(
            `[ChainOfTrust] [Hook] 📥 Received JSON (${data.type})`,
            data,
          );
          handleJsonMessage(data);
        } catch (e) {
          console.error(
            "[ChainOfTrust] [Hook] Failed to parse JSON message",
            e,
            event.data,
          );
        }
      }
    };

    ws.onerror = (e) => {
      console.error("[Voice WS] ❌ WebSocket ERROR:", e);
      console.error("[Voice WS] Error details:", {
        readyState: ws.readyState,
        url: connectionUrl,
      });
      setStatus("error");
      // WebSocket onError doesn't provide error details for security reasons
      // We'll rely on server sending an error message or the close event
      onError?.(e);
    };

    ws.onclose = (event) => {
      console.log("[Voice WS] WebSocket CLOSED:", {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
      });
      setStatus((prev) => (prev !== "error" ? "disconnected" : prev));
      if (event.reason) {
        setError(event.reason);
      }
      wsRef.current = null;
    };
  }, [url, onReady, onError, handleIncomingAudio, handleJsonMessage]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    stopRecording();
  }, [stopRecording]);

  const sendJson = useCallback((data: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log("[Voice WS] 📤 Sending JSON:", data.type);
      wsRef.current.send(JSON.stringify(data));
    } else {
      console.warn(
        "[Voice WS] ⚠️ Cannot send JSON, socket state:",
        wsRef.current?.readyState,
      );
    }
  }, []);

  const enableMic = useCallback(() => {
    console.log("[Voice WS] enableMic() called");
    micEnabledRef.current = true;
    setIsMicEnabled(true);
  }, []);

  const disableMic = useCallback(() => {
    console.log("[Voice WS] disableMic() called");
    micEnabledRef.current = false;
    setIsMicEnabled(false);
  }, []);

  const setMicMuted = useCallback((muted: boolean) => {
    isMicMutedRef.current = muted;
    setIsMicMutedState(muted);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording();
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [stopRecording]);

  // Keep latest status in ref to avoid stale closures during connection polling
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
  };
}
