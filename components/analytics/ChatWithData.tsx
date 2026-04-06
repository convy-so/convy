"use client";

import { useChat } from "@ai-sdk/react";
import { UIMessage, DefaultChatTransport, isTextUIPart, isToolUIPart, getToolName } from "ai";
import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    History,
    ChevronDown,
    PlusCircle,
    Bot,
    User,
    Loader2,
    Send,
    Mic,
    Square,
    Search,
    Table,
    BarChart2,
    Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
    GenerativeAnalyticsRenderer,
    RenderChartResult,
    RenderTableResult,
    isRenderChartResult,
    isRenderTableResult
} from "./GenerativeAnalytics";
import toast from "react-hot-toast";

interface ChatSession {
    id: string;
    title: string;
    updatedAt: string;
    messages: Record<string, unknown>[];
}

interface ChatWithDataProps {
    surveyId: string;
}

type MyUITools = {
    renderChart: { input: Record<string, unknown>; output: RenderChartResult };
    renderTable: { input: Record<string, unknown>; output: RenderTableResult };
};

type ChatMessage = UIMessage<unknown, Record<string, unknown>, MyUITools>;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function parseChatSessionsResponse(value: unknown): { sessions: ChatSession[] } {
    if (!isRecord(value) || !Array.isArray(value.sessions)) {
        return { sessions: [] };
    }

    return {
        sessions: value.sessions.flatMap((session) => {
            if (
                !isRecord(session) ||
                typeof session.id !== "string" ||
                typeof session.title !== "string" ||
                typeof session.updatedAt !== "string" ||
                !Array.isArray(session.messages)
            ) {
                return [];
            }

            return [{
                id: session.id,
                title: session.title,
                updatedAt: session.updatedAt,
                messages: session.messages.filter(isRecord),
            }];
        }),
    };
}

function getToolOutput(
    part: ChatMessage["parts"][number],
): RenderChartResult | RenderTableResult | null {
    if (!isToolUIPart(part) || part.state !== "output-available") {
        return null;
    }

    const output = part.output;

    if (isRenderChartResult(output) || isRenderTableResult(output)) {
        return output;
    }

    return null;
}

function SuggestionPill({
    icon: Icon,
    label,
    onClick,
}: {
    icon: React.ElementType,
    label: string,
    onClick?: () => void,
}) {
    return (
        <button
            onClick={onClick}
            className="flex items-center gap-2 px-4 py-2 bg-gray-50 border border-gray-100 rounded-full text-xs font-bold text-gray-500 hover:bg-white hover:border-gray-900 hover:text-gray-900 transition-all whitespace-nowrap"
        >
            <Icon className="w-3.5 h-3.5" />
            {label}
        </button>
    );
}

export function ChatWithData({ surveyId }: ChatWithDataProps) {
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [isSessionsOpen, setIsSessionsOpen] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [input, setInput] = useState("");
    const [chatPlaceholder] = useState("Ask anything about your data...");
    const [isRecordingAudio, setIsRecordingAudio] = useState(false);
    const [isTranscribingAudio, setIsTranscribingAudio] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const suggestions = [
        "How many students reported positive outcomes?",
        "What barriers appear most often?",
        "Compare the latest snapshot with the previous one.",
        "Show the strongest evidence behind the top finding.",
    ];

    // 1. Fetch past sessions
    const { data: sessionsData, refetch: refetchSessions } = useQuery({
        queryKey: ["chat-sessions", surveyId],
        queryFn: async () => {
            const res = await fetch(`/api/surveys/${surveyId}/analytics/chat-sessions`);
            if (!res.ok) throw new Error("Failed to fetch sessions");
            return parseChatSessionsResponse(await res.json());
        },
    });

    // 2. Initialize Chat
    const { messages, setMessages, sendMessage, status } = useChat<ChatMessage>({
        transport: new DefaultChatTransport({
            api: `/api/surveys/${surveyId}/analytics/chat`,
        }),
        onFinish: async ({ message, messages }) => {
            // Save session on finish
            saveSession([...messages, message]);
        },
    });

    const isLoading = status === "streaming" || status === "submitted";

    // 3. Save session to DB
    const saveSession = async (currentMessages: ChatMessage[]) => {
        try {
            const res = await fetch(`/api/surveys/${surveyId}/analytics/chat-sessions`, {
                method: "POST",
                body: JSON.stringify({
                    sessionId: currentSessionId,
                    messages: currentMessages,
                }),
            });
            if (res.ok) {
                const { session } = await res.json();
                if (!currentSessionId) {
                    setCurrentSessionId(session.id);
                    refetchSessions();
                }
            }
        } catch {
        }
    };

    // 4. Load a session
    const loadSession = async (sessionId: string) => {
        try {
            const res = await fetch(`/api/surveys/${surveyId}/analytics/chat-sessions/${sessionId}`);
            if (res.ok) {
                const { session } = await res.json();
                setMessages(session.messages || []);
                setCurrentSessionId(session.id);
            }
        } catch {
        }
    };

    const handleNewChat = () => {
        setMessages([]);
        setCurrentSessionId(null);
        setInput("");
    };

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!input.trim() || isLoading) return;

        const text = input;
        setInput("");
        sendMessage({ role: "user", parts: [{ type: "text", text }] });
    };

    const stopAudioStream = () => {
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach((track) => track.stop());
            mediaStreamRef.current = null;
        }
    };

    const handleVoiceInput = async () => {
        if (isTranscribingAudio || isLoading) return;

        if (isRecordingAudio) {
            mediaRecorderRef.current?.stop();
            setIsRecordingAudio(false);
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });
            mediaStreamRef.current = stream;
            audioChunksRef.current = [];

            const preferredMimeType =
                typeof MediaRecorder !== "undefined" &&
                MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
                    ? "audio/webm;codecs=opus"
                    : undefined;
            const recorder = preferredMimeType
                ? new MediaRecorder(stream, { mimeType: preferredMimeType })
                : new MediaRecorder(stream);

            mediaRecorderRef.current = recorder;

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            recorder.onstop = async () => {
                stopAudioStream();
                const audioBlob = new Blob(audioChunksRef.current, {
                    type: recorder.mimeType || "audio/webm",
                });
                audioChunksRef.current = [];
                mediaRecorderRef.current = null;

                if (audioBlob.size === 0) {
                    return;
                }

                setIsTranscribingAudio(true);
                try {
                    const formData = new FormData();
                    formData.append(
                        "audio",
                        new File([audioBlob], "analytics-voice.webm", {
                            type: audioBlob.type || "audio/webm",
                        }),
                    );
                    formData.append("language", "multi");

                    const response = await fetch(
                        `/api/surveys/${surveyId}/analytics/transcribe`,
                        {
                            method: "POST",
                            body: formData,
                        },
                    );

                    const data = await response.json();
                    if (!response.ok) {
                        throw new Error(data.error || "Voice transcription failed");
                    }

                    const transcript = typeof data.transcript === "string" ? data.transcript.trim() : "";
                    if (!transcript) {
                        throw new Error("No transcript generated from audio");
                    }

                    await sendMessage({
                        role: "user",
                        parts: [{ type: "text", text: transcript }],
                    });
                } catch (error) {
                    const message =
                        error instanceof Error
                            ? error.message
                            : "Voice transcription failed";
                    toast.error(message);
                } finally {
                    setIsTranscribingAudio(false);
                }
            };

            recorder.start(250);
            setIsRecordingAudio(true);
        } catch {
            stopAudioStream();
            mediaRecorderRef.current = null;
            setIsRecordingAudio(false);
            toast.error(
                "Microphone access failed. Please check your browser permissions.",
            );
        }
    };

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    useEffect(() => {
        return () => {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
                mediaRecorderRef.current.stop();
            }
            stopAudioStream();
        };
    }, []);

    const [welcomeMessage, setWelcomeMessage] = useState<ChatMessage | null>(null);

    useEffect(() => {
        setWelcomeMessage({
            id: "welcome",
            role: "assistant",
            parts: [{
                type: "text",
                text: "Hi! I'm your research assistant. I can help you analyze your data, find patterns, or visualize specific metrics. What would you like to explore today?",
            }],
        });
    }, []);

    const allMessages = messages.length === 0 ? (welcomeMessage ? [welcomeMessage] : []) : messages;

    const getTextContent = (m: ChatMessage) => {
        return m.parts
            .filter(isTextUIPart)
            .map(p => p.text)
            .join("\n");
    };

    return (
        <div className="flex flex-col h-full bg-white">
            {/* Session Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
                <div className="relative">
                    <button
                        onClick={() => setIsSessionsOpen(!isSessionsOpen)}
                        className="flex items-center gap-2 px-4 py-2 hover:bg-gray-50 rounded-full transition-all text-sm font-bold text-gray-900"
                    >
                        <History className="w-4 h-4 text-gray-400" />
                        {currentSessionId
                            ? sessionsData?.sessions.find(s => s.id === currentSessionId)?.title || "Current Chat"
                            : "New Exploration"}
                        <ChevronDown className={cn("w-4 h-4 text-gray-400 transition-transform", isSessionsOpen && "rotate-180")} />
                    </button>

                    {isSessionsOpen && (
                        <div className="absolute top-full left-0 mt-2 w-72 bg-white border border-gray-100 rounded-3xl shadow-2xl z-50 p-2 overflow-hidden">
                            <div className="max-h-64 overflow-y-auto custom-scrollbar">
                                {sessionsData?.sessions.length === 0 ? (
                                    <div className="p-4 text-xs text-gray-400 text-center italic">No past sessions</div>
                                ) : (
                                    sessionsData?.sessions.map((s) => (
                                        <button
                                            key={s.id}
                                            onClick={() => {
                                                loadSession(s.id);
                                                setIsSessionsOpen(false);
                                            }}
                                            className="w-full text-left px-4 py-3 hover:bg-gray-50 rounded-2xl transition-all group"
                                        >
                                            <div className="text-xs font-bold text-gray-900 truncate">{s.title}</div>
                                            <div className="text-[10px] text-gray-400 mt-0.5">{new Date(s.updatedAt).toLocaleDateString()}</div>
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <button
                    onClick={handleNewChat}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-900 transition-colors"
                >
                    <PlusCircle className="w-4 h-4" />
                    New Chat
                </button>
            </div>

            {/* Messages Area */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8"
            >
                {allMessages.map((m: ChatMessage) => (
                    <div
                        key={m.id}
                        className={cn(
                            "flex gap-4 max-w-4xl mx-auto",
                            m.role === "user" ? "justify-end" : "justify-start"
                        )}
                    >
                        {m.role === "assistant" && (
                            <div className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center flex-shrink-0 mt-1">
                                <Bot className="w-4 h-4 text-white" />
                            </div>
                        )}

                        <div className={cn(
                            "space-y-4",
                            m.role === "user" ? "max-w-[80%]" : "max-w-full flex-1"
                        )}>
                            {getTextContent(m) && (
                                <div className={cn(
                                    "p-5 rounded-[2rem] text-sm leading-relaxed",
                                    m.role === "user"
                                        ? "bg-gray-900 text-white font-medium"
                                        : "text-gray-900 bg-transparent p-0"
                                )}>
                                    {getTextContent(m)}
                                </div>
                            )}

                            {/* Handle Tool Invocations from parts */}
                            {m.parts.filter(isToolUIPart).map((part) => {
                                const toolOutput = getToolOutput(part);

                                return (
                                    <div
                                        key={part.toolCallId}
                                        className="mt-4 rounded-[2.5rem] bg-[#F2F5F8] overflow-hidden p-8 border border-[#E5E9EE]"
                                    >
                                        {toolOutput ? (
                                            <GenerativeAnalyticsRenderer
                                                toolName={getToolName(part)}
                                                result={toolOutput}
                                            />
                                        ) : (
                                            <div className="flex items-center gap-3 text-sm text-gray-400 font-bold italic animate-pulse">
                                                <Sparkles className="w-4 h-4" />
                                                Synthesizing {getToolName(part).replace("render", "").toLowerCase()}...
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {m.role === "user" && (
                            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-1">
                                <User className="w-4 h-4 text-gray-500" />
                            </div>
                        )}
                    </div>
                ))}
                {isLoading && !allMessages[allMessages.length - 1]?.parts.some(isToolUIPart) && (
                    <div className="flex gap-4 max-w-4xl mx-auto">
                        <div className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center flex-shrink-0 animate-pulse">
                            <Bot className="w-4 h-4 text-white" />
                        </div>
                        <div className="p-2">
                            <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
                        </div>
                    </div>
                )}
            </div>

            {/* Input Area */}
            <div className="p-6 border-t border-gray-100 flex-shrink-0">
                <form
                    onSubmit={handleSubmit}
                    className="max-w-4xl mx-auto relative group"
                >
                    <input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={chatPlaceholder}
                        disabled={isLoading || isTranscribingAudio}
                        className="w-full pl-6 pr-28 py-5 bg-[#F2F5F8] focus:bg-white border-2 border-transparent focus:border-gray-900 rounded-[2rem] text-sm font-medium transition-all outline-none disabled:opacity-70"
                    />
                    <button
                        type="button"
                        onClick={handleVoiceInput}
                        disabled={isLoading || isTranscribingAudio}
                        className={cn(
                            "absolute right-16 top-2.5 p-3 h-12 w-12 rounded-full flex items-center justify-center transition-all disabled:opacity-50",
                            isRecordingAudio
                                ? "bg-red-100 text-red-600 hover:bg-red-200"
                                : "bg-white text-gray-500 hover:text-gray-900 border border-gray-200 hover:border-gray-900",
                        )}
                        aria-label={isRecordingAudio ? "Stop recording" : "Start voice input"}
                    >
                        {isTranscribingAudio ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : isRecordingAudio ? (
                            <Square className="w-4 h-4 fill-current" />
                        ) : (
                            <Mic className="w-5 h-5" />
                        )}
                    </button>
                    <button
                        type="submit"
                        disabled={!input.trim() || isLoading || isTranscribingAudio}
                        className="absolute right-3 top-2.5 p-3 h-12 w-12 bg-gray-900 text-white rounded-full flex items-center justify-center hover:bg-black transition-all disabled:opacity-50 disabled:bg-gray-200"
                    >
                        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                    </button>
                </form>
                {(isRecordingAudio || isTranscribingAudio) && (
                    <div className="max-w-4xl mx-auto mt-3 px-2 text-sm text-gray-500">
                        {isRecordingAudio ? (
                            "Listening for your question..."
                        ) : (
                            "Transcribing your question..."
                        )}
                    </div>
                )}
                <div className="max-w-4xl mx-auto flex gap-4 mt-6 overflow-x-auto pb-2 px-2 no-scrollbar">
                    <SuggestionPill icon={Search} label="Finding trends" onClick={() => setInput(suggestions[1])} />
                    <SuggestionPill icon={Table} label="Pivot data" onClick={() => setInput(suggestions[0])} />
                    <SuggestionPill icon={BarChart2} label="Visualize metrics" onClick={() => setInput(suggestions[2])} />
                    <SuggestionPill icon={Sparkles} label="AI Insights" onClick={() => setInput(suggestions[3])} />
                </div>
            </div>
        </div>
    );
}


