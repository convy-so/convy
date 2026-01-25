"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface UseVoiceWebSocketOptions {
    url: string;
    onMessage?: (message: any) => void;
    onReady?: () => void;
    onError?: (error: any) => void;
}

export function useVoiceWebSocket({ url, onMessage, onReady, onError }: UseVoiceWebSocketOptions) {
    const [status, setStatus] = useState<"disconnected" | "connecting" | "connected" | "error">("disconnected");
    const [isRecording, setIsRecording] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [transcription, setTranscription] = useState("");
    const [interimTranscription, setInterimTranscription] = useState("");

    const wsRef = useRef<WebSocket | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const audioQueueRef = useRef<Blob[]>([]);
    const isPlayingRef = useRef(false);

    // Initialize WebSocket
    const connect = useCallback(() => {
        if (wsRef.current) return;

        setStatus("connecting");
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
            setStatus("connected");
            onReady?.();
        };

        ws.onmessage = async (event) => {
            if (event.data instanceof Blob) {
                // AI Voice Audio
                handleIncomingAudio(event.data);
            } else {
                try {
                    const data = JSON.parse(event.data);
                    handleJsonMessage(data);
                } catch (e) {
                    console.error("Failed to parse WS message", e);
                }
            }
        };

        ws.onerror = (e) => {
            console.error("WebSocket error", e);
            setStatus("error");
            onError?.(e);
        };

        ws.onclose = () => {
            setStatus("disconnected");
            wsRef.current = null;
        };
    }, [url, onReady, onError]);

    const disconnect = useCallback(() => {
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
        stopRecording();
    }, []);

    const handleJsonMessage = (data: any) => {
        switch (data.type) {
            case "transcription":
                if (data.isFinal) {
                    setTranscription(data.text);
                    setInterimTranscription("");
                }
                break;
            case "transcription_interim":
                setInterimTranscription(data.text);
                break;
            case "audio_sent":
                // AI started speaking
                break;
            case "error":
                console.error("Server error:", data.error);
                break;
        }
        onMessage?.(data);
    };

    const handleIncomingAudio = async (blob: Blob) => {
        audioQueueRef.current.push(blob);
        if (!isPlayingRef.current) {
            playNextInQueue();
        }
    };

    const playNextInQueue = async () => {
        if (audioQueueRef.current.length === 0) {
            setIsPlaying(false);
            isPlayingRef.current = false;
            return;
        }

        setIsPlaying(true);
        isPlayingRef.current = true;
        const blob = audioQueueRef.current.shift()!;
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);

        audio.onended = () => {
            URL.revokeObjectURL(url);
            playNextInQueue();
        };

        try {
            await audio.play();
        } catch (e) {
            console.error("Playback failed", e);
            playNextInQueue();
        }
    };

    const startRecording = async () => {
        if (isRecording) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
            mediaRecorderRef.current = mediaRecorder;

            mediaRecorder.ondataavailable = async (event) => {
                if (event.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
                    wsRef.current.send(event.data);
                }
            };

            mediaRecorder.start(250); // Send chunks every 250ms
            setIsRecording(true);
        } catch (e) {
            console.error("Failed to start recording", e);
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
            mediaRecorderRef.current.stop();
            mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
        }
        setIsRecording(false);
    };

    const sendJson = (data: any) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(data));
        }
    };

    return {
        status,
        connect,
        disconnect,
        isRecording,
        isPlaying,
        startRecording,
        stopRecording,
        transcription,
        interimTranscription,
        sendJson
    };
}
