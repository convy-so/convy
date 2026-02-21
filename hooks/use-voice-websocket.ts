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
    const [hasAudioPlayed, setHasAudioPlayed] = useState(false);
    const [transcription, setTranscription] = useState("");
    const [interimTranscription, setInterimTranscription] = useState("");
    const [isMicMuted, setIsMicMutedState] = useState(false); 
    const isMicMutedRef = useRef(false); 

    const [error, setError] = useState<string | null>(null);

    const wsRef = useRef<WebSocket | null>(null);
    const recordingContextRef = useRef<AudioContext | null>(null);
    const playbackContextRef = useRef<AudioContext | null>(null);
    const workletNodeRef = useRef<AudioWorkletNode | null>(null);
    const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const audioQueueRef = useRef<Blob[]>([]);
    const isPlayingRef = useRef(false);
    const activeAudioRef = useRef<HTMLAudioElement | null>(null);
    
    // Keep latest callback in ref to avoid stale closures in ws.onmessage
    const onMessageRef = useRef(onMessage);
    useEffect(() => {
        onMessageRef.current = onMessage;
    }, [onMessage]);

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
        if (url.includes("/voice/survey-creation") || url.includes("/voice/sample-conversation") || url.includes("/analytics")) {
             try {
                console.log("[Voice WS] Fetching auth token...");
                const res = await fetch("/api/auth/token");
                console.log("[Voice WS] Token fetch response:", res.status, res.ok);
                if (res.ok) {
                    const { token } = await res.json();
                    console.log("[Voice WS] Got token:", token ? `${token.substring(0, 20)}...` : "null");
                    if (token) {
                        const urlObj = new URL(url);
                        urlObj.searchParams.set("token", token);
                        connectionUrl = urlObj.toString();
                        console.log("[Voice WS] Updated connection URL with token");
                    }
                } else {
                    console.warn("[Voice WS] Token fetch failed with status:", res.status);
                }
             } catch (e) {
                 console.error("[Voice WS] Failed to fetch auth token:", e);
             }
        }

        let ws: WebSocket;
        try {
            console.log("[Voice WS] Creating WebSocket connection to:", connectionUrl);
            ws = new WebSocket(connectionUrl);
            wsRef.current = ws;
            console.log("[Voice WS] WebSocket object created, readyState:", ws.readyState);
        } catch (e) {
            console.error("[Voice WS] Failed to create WebSocket instance:", e);
            setStatus("error");
            setError(e instanceof Error ? e.message : "Failed to create WebSocket connection");
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
                console.log(`[Voice WS] 📥 Audio Blob received: ${event.data.size} bytes`);
                // AI Voice Audio
                handleIncomingAudio(event.data);
            } else {
                try {
                    const data = JSON.parse(event.data);
                    console.log("[Voice WS] 📥 JSON Message received:", data.type);
                    handleJsonMessage(data);
                } catch (e) {
                    console.error("Failed to parse WS message", e);
                }
            }
        };

        ws.onerror = (e) => {
            console.error("[Voice WS] ❌ WebSocket ERROR:", e);
            console.error("[Voice WS] Error details:", { readyState: ws.readyState, url: connectionUrl });
            setStatus("error");
            // WebSocket onError doesn't provide error details for security reasons
            // We'll rely on server sending an error message or the close event
            onError?.(e);
        };

        ws.onclose = (event) => {
            console.log("[Voice WS] WebSocket CLOSED:", { code: event.code, reason: event.reason, wasClean: event.wasClean });
            setStatus(prev => prev !== "error" ? "disconnected" : prev);
            if (event.reason) {
                setError(event.reason);
            }
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
            case "conversation_text":
                // Voice Agent API: unified conversation text event
                if (data.role === "user") {
                    setTranscription(data.content);
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
                break;
            case "agent_audio_done":
                // AI finished speaking (Voice Agent API)
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
                break;
            case "error":
                console.error("Server error (full data):", data);
                // Handle both string errors and object errors
                const errorMessage = typeof data.error === 'string' 
                    ? data.error 
                    : data.error?.message || JSON.stringify(data.error) || "Unknown server error";
                
                console.error("Server error message:", errorMessage);
                setStatus("error");
                setError(errorMessage);
                if (onError) onError(errorMessage);
                break;
        }
        onMessageRef.current?.(data);
    };

    // --- Audio Playback Logic (PCM Streaming) ---

    const handleIncomingAudio = async (blob: Blob) => {
        // We now receive raw PCM (linear16, 24kHz) from Deepgram
        // Convert Blob -> ArrayBuffer -> Int16Array -> Float32Array -> AudioBuffer
        try {
            const arrayBuffer = await blob.arrayBuffer();
            const audioCtx = getPlaybackContext();
            
            // Create audio buffer (1 channel, length, sampleRate)
            // Deepgram output is 16-bit linear PCM at 24000Hz (mono)
            const sampleRate = 24000;
            const int16Data = new Int16Array(arrayBuffer);
            const float32Data = new Float32Array(int16Data.length);
            
            // Convert Int16 to Float32 [-1.0, 1.0]
            for (let i = 0; i < int16Data.length; i++) {
                float32Data[i] = int16Data[i] / 32768.0;
            }

            const audioBuffer = audioCtx.createBuffer(1, float32Data.length, sampleRate);
            audioBuffer.getChannelData(0).set(float32Data);

            // Queue and play
            queueAudioBuffer(audioBuffer);
        } catch (err) {
            console.error("[Voice WS] Error processing audio chunk:", err);
        }
    };

    // Queue for scheduling audio chunks continuously
    const nextStartTimeRef = useRef<number>(0);

    const queueAudioBuffer = (audioBuffer: AudioBuffer) => {
        const audioCtx = getPlaybackContext();
        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioCtx.destination);

        // Schedule playback
        // Ensure we don't schedule in the past
        const currentTime = audioCtx.currentTime;
        // Add a small buffering delay if we fell behind (re-sync)
        if (nextStartTimeRef.current < currentTime) {
            nextStartTimeRef.current = currentTime + 0.05; // 50ms buffer
        }

        source.start(nextStartTimeRef.current);
        nextStartTimeRef.current += audioBuffer.duration;
        
        setIsPlaying(true);
        isPlayingRef.current = true;
        setHasAudioPlayed(true);

        // Reset playing state when this chunk ends (approximate, for UI)
        // In a real stream, we might stay "playing" until silence.
        // For now, we rely on the stream continuing or checking if startTime > currentTime
        source.onended = () => {
             // Check if we have more audio pending or if this was the last one
             if (audioCtx.currentTime >= nextStartTimeRef.current - 0.1) {
                 setIsPlaying(false);
                 isPlayingRef.current = false;
             }
        };
    };

    const getPlaybackContext = () => {
        if (!playbackContextRef.current) {
            playbackContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        if (playbackContextRef.current.state === 'suspended') {
            playbackContextRef.current.resume();
        }
        return playbackContextRef.current;
    };


    const playNextInQueue = async () => {
       // Legacy method - no longer used for PCM streaming
    };

    /**
     * Start recording using AudioWorklet for raw PCM capture
     * The worklet handles downsampling from the native sample rate (typically 48kHz) to 16kHz
     * and buffers audio into ~80ms chunks (2560 bytes) as required by Deepgram Flux
     */
    const startRecording = async () => {
        if (isRecording) return;
        setError(null); // Clear errors on restart attempt

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
            // Force 16kHz to use native browser resampling for recording input
            const recordingContext = new AudioContext({ sampleRate: 16000 });
            recordingContextRef.current = recordingContext;

            // Load the AudioWorklet processor
            await recordingContext.audioWorklet.addModule('/audio-worklet-processor.js');

            // Create source from microphone
            const source = recordingContext.createMediaStreamSource(stream);
            sourceNodeRef.current = source;

            // Create worklet node
            const workletNode = new AudioWorkletNode(recordingContext, 'pcm-processor');
            workletNodeRef.current = workletNode;

            // Send initial configuration immediately to ensure server is ready
            // The worklet outputs 16kHz audio after decimation
            const initialConfig = {
                type: 'audio_config',
                sampleRate: 16000,  // Fixed: worklet outputs 16kHz
                encoding: 'linear16'
            };
            
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                console.log("[Voice] Sending initial audio config:", initialConfig);
                wsRef.current.send(JSON.stringify(initialConfig));
            }

            // Handle PCM audio chunks from worklet
            workletNode.port.onmessage = (event) => {
                // Send audio buffer directly without muting check
                if (event.data.type === 'audio' 
                    && wsRef.current?.readyState === WebSocket.OPEN) {
                    wsRef.current.send(event.data.buffer);
                }
            };

            // Connect: microphone -> worklet
            source.connect(workletNode);
            // Note: Don't connect to destination to avoid feedback

            setIsRecording(true);
            console.log("[Voice] Started recording with AudioWorklet at", recordingContext.sampleRate, "Hz");
        } catch (e) {
            console.error("Failed to start recording", e);
            setError("Microphone access failed. Please check permissions.");
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
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }

        setIsRecording(false);
    }, []);

    const sendJson = (data: any) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            console.log("[Voice WS] 📤 Sending JSON:", data.type);
            wsRef.current.send(JSON.stringify(data));
        } else {
            console.warn("[Voice WS] ⚠️ Cannot send JSON, socket state:", wsRef.current?.readyState);
        }
    };

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
        startRecording,
        stopRecording,
        transcription,
        interimTranscription,
        sendJson,
        error,
        isMicMuted,
        setMicMuted,
        hasAudioPlayed
    };
}
