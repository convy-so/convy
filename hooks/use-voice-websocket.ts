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
    const audioContextRef = useRef<AudioContext | null>(null);
    const workletNodeRef = useRef<AudioWorkletNode | null>(null);
    const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const audioQueueRef = useRef<Blob[]>([]);
    const isPlayingRef = useRef(false);
    
    // Keep latest callback in ref to avoid stale closures in ws.onmessage
    const onMessageRef = useRef(onMessage);
    useEffect(() => {
        onMessageRef.current = onMessage;
    }, [onMessage]);

    // Initialize WebSocket
    const connect = useCallback(async () => {
        if (wsRef.current) return;

        setStatus("connecting");

        let connectionUrl = url;

        // Auto-inject token if we can find one for authenticated endpoints
        // We do this check to avoid fetching for public endpoints
        if (url.includes("/voice/survey-creation") || url.includes("/voice/sample-conversation") || url.includes("/analytics")) {
             try {
                const res = await fetch("/api/auth/token");
                if (res.ok) {
                    const { token } = await res.json();
                    if (token) {
                        const urlObj = new URL(url);
                        urlObj.searchParams.set("token", token);
                        connectionUrl = urlObj.toString();
                    }
                }
             } catch (e) {
                 console.warn("Failed to fetch auth token for voice WebSocket", e);
             }
        }

        const ws = new WebSocket(connectionUrl);
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
                console.error("Server error (full data):", data);
                console.error("Server error (error prop):", data.error);
                break;
        }
        onMessageRef.current?.(data);
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

    /**
     * Start recording using AudioWorklet for raw PCM capture
     * This sends 16-bit PCM audio at 16kHz directly to the WebSocket
     */
    const startRecording = async () => {
        if (isRecording) return;

        try {
            // Get microphone access
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                }
            });
            streamRef.current = stream;

            // Create audio context (browser may use 44100 or 48000)
            const audioContext = new AudioContext();
            audioContextRef.current = audioContext;

            // Load the AudioWorklet processor
            await audioContext.audioWorklet.addModule('/audio-worklet-processor.js');

            // Create source from microphone
            const source = audioContext.createMediaStreamSource(stream);
            sourceNodeRef.current = source;

            // Create worklet node
            const workletNode = new AudioWorkletNode(audioContext, 'pcm-processor');
            workletNodeRef.current = workletNode;

            // Handle PCM audio chunks from worklet
            workletNode.port.onmessage = (event) => {
                if (event.data.type === 'audio' && wsRef.current?.readyState === WebSocket.OPEN) {
                    // Send raw PCM buffer directly
                    wsRef.current.send(event.data.buffer);
                }
            };

            // Connect: microphone -> worklet
            source.connect(workletNode);
            // Note: Don't connect to destination to avoid feedback

            setIsRecording(true);
            console.log("[Voice] Started recording with AudioWorklet at", audioContext.sampleRate, "Hz");
        } catch (e) {
            console.error("Failed to start recording", e);
            onError?.(e);
        }
    };

    const stopRecording = useCallback(() => {
        // Stop the worklet
        if (workletNodeRef.current) {
            workletNodeRef.current.port.postMessage({ command: 'stop' });
            workletNodeRef.current.disconnect();
            workletNodeRef.current = null;
        }

        // Disconnect source
        if (sourceNodeRef.current) {
            sourceNodeRef.current.disconnect();
            sourceNodeRef.current = null;
        }

        // Close audio context
        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }

        // Stop media stream tracks
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }

        setIsRecording(false);
    }, []);

    const sendJson = (data: any) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(data));
        }
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopRecording();
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, [stopRecording]);

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
