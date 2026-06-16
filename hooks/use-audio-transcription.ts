"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { SpeechToTextLanguage } from "@/lib/voice/voice-locales";

type SupportedRecordingMimeType = "audio/webm;codecs=opus" | "audio/webm";
type TranscriptionPhase = "recording" | "transcribing" | null;

import toast from "react-hot-toast";

type StartTranscriptionParams = {
  target: string;
  language: SpeechToTextLanguage;
  onTranscript: (transcript: string) => void;
};

function getPreferredMimeType(): SupportedRecordingMimeType {
  if (
    typeof MediaRecorder !== "undefined" &&
    MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
  ) {
    return "audio/webm;codecs=opus";
  }

  return "audio/webm";
}

export function useAudioTranscription(params?: {
  onError?: (message: string) => void;
}) {
  const onError = params?.onError;
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const pendingTargetRef = useRef<string | null>(null);
  const pendingLanguageRef = useRef<SpeechToTextLanguage>("multi");
  const onTranscriptRef = useRef<((transcript: string) => void) | null>(null);

  const [activeTarget, setActiveTarget] = useState<string | null>(null);
  const [phase, setPhase] = useState<TranscriptionPhase>(null);

  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    setIsSupported(
      typeof window !== "undefined" &&
      typeof navigator !== "undefined" &&
      typeof navigator.mediaDevices?.getUserMedia === "function" &&
      typeof MediaRecorder !== "undefined"
    );
  }, []);

  const clearStream = useCallback(() => {
    if (!mediaStreamRef.current) {
      return;
    }

    mediaStreamRef.current.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }, []);

  const resetState = useCallback(() => {
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    pendingTargetRef.current = null;
    onTranscriptRef.current = null;
    setActiveTarget(null);
    setPhase(null);
  }, []);

  const stopRecording = useCallback(() => {
    const mediaRecorder = mediaRecorderRef.current;

    if (!mediaRecorder || mediaRecorder.state === "inactive") {
      clearStream();
      resetState();
      return;
    }

    mediaRecorder.stop();
  }, [clearStream, resetState]);

  const startTranscription = useCallback(
    async ({ target, language, onTranscript }: StartTranscriptionParams) => {
      if (!isSupported) {
        onError?.("Voice input is not supported in this browser.");
        return;
      }

      if (activeTarget === target && phase === "recording") {
        stopRecording();
        return;
      }

      if (phase) {
        return;
      }

      try {
        try {
          const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
          if (permissionStatus.state === 'denied') {
            onError?.("Microphone access is blocked. Please allow microphone access in your browser settings (usually a 🔒 icon in the URL bar) and try again.");
            return;
          } else if (permissionStatus.state === 'prompt') {
            toast("Please click 'Allow' in the browser prompt above.", { icon: "🎤" });
          }
        } catch {
          // Browser may not support navigator.permissions for microphone, safely ignore
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        mediaStreamRef.current = stream;
        audioChunksRef.current = [];
        pendingTargetRef.current = target;
        pendingLanguageRef.current = language;
        onTranscriptRef.current = onTranscript;
        setActiveTarget(target);
        setPhase("recording");

        const mimeType = getPreferredMimeType();
        const mediaRecorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, {
            type: mediaRecorder.mimeType || "audio/webm",
          });

          clearStream();

          if (audioBlob.size === 0) {
            resetState();
            return;
          }

          setPhase("transcribing");

          try {
            const formData = new FormData();
            formData.append(
              "audio",
              new File([audioBlob], "speech-input.webm", {
                type: audioBlob.type || "audio/webm",
              }),
            );
            formData.append("language", pendingLanguageRef.current);

            const response = await fetch("/api/voice/transcribe", {
              method: "POST",
              body: formData,
            });
            const data: unknown = await response.json();

            if (!response.ok) {
              const errorMessage =
                typeof data === "object" &&
                data !== null &&
                "error" in data &&
                typeof data.error === "string"
                  ? data.error
                  : "Voice transcription failed";
              throw new Error(errorMessage);
            }

            if (
              typeof data !== "object" ||
              data === null ||
              !("transcript" in data) ||
              typeof data.transcript !== "string"
            ) {
              throw new Error("Voice transcription returned an invalid response");
            }

            const transcript = data.transcript.trim();
            if (!transcript) {
              throw new Error("No transcript generated from audio");
            }

            onTranscriptRef.current?.(transcript);
          } catch (error) {
            onError?.(
              error instanceof Error
                ? error.message
                : "Voice transcription failed",
            );
          } finally {
            resetState();
          }
        };

        mediaRecorder.start(250);
      } catch (error) {
        clearStream();
        resetState();
        onError?.(
          error instanceof Error
            ? error.message
            : "Microphone access failed. Please check permissions.",
        );
      }
    },
    [
      activeTarget,
      clearStream,
      isSupported,
      onError,
      phase,
      resetState,
      stopRecording,
    ],
  );

  useEffect(() => stopRecording, [stopRecording]);

  return {
    activeTarget,
    isSupported,
    phase,
    startTranscription,
    stopRecording,
  };
}
