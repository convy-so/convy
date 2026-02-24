"use client";

import { clientEnv } from "@/lib/env.client";

import { useState, useRef, useEffect, FormEvent } from "react";
import { useParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/routing";
import {
    Mic,
    MicOff,
    Loader2,
    ArrowLeft,
    CheckCircle,
    MessageSquare,
    RefreshCcw,
    Bot,
    Send,
    Keyboard,
    Volume2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/providers/auth-provider";
import { useVoiceWebSocket } from "@/hooks/use-voice-websocket";
import { MediaDisplay } from "@/components/surveys/media-display";
import { MarkdownMessage } from "@/components/ui/markdown-message";
import { useQuery } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { addSampleConversationCommentAction } from "@/app/actions/sample-conversation";

const MAX_SAMPLE_CONVERSATIONS = 3;

type Message = {
    id: string;
    role: "user" | "assistant";
    parts: Array<{ type: string; text?: string;[key: string]: any }>;
    timestamp: string;
    media?: any;
    toolInvocations?: Array<any>;
};

export default function SampleReviewPage() {
    const t = useTranslations("Survey.SampleReview");
    const params = useParams();
    const router = useRouter();
    const { user } = useAuth();
    const surveyId = params.surveyId as string;

    const [isConfirming, setIsConfirming] = useState(false);
    const [feedback, setFeedback] = useState("");
    const [isRetrying, setIsRetrying] = useState(false);
    const [inputMode, setInputMode] = useState<"voice" | "text">("text");
    const [textInput, setTextInput] = useState("");
    const [hasAutoGreeted, setHasAutoGreeted] = useState(false);
    const [showTranscript, setShowTranscript] = useState(true);

    const [commentText, setCommentText] = useState("");
    const [isCommenting, setIsCommenting] = useState(false);

    const VisualizerRing = ({ isRecording, size = "normal" }: { isRecording: boolean; size?: "normal" | "large" }) => (
        <div className="relative flex items-center justify-center">
            {isRecording && (
                <>
                    <div className={cn(
                        "absolute inset-0 rounded-full border-4 border-indigo-500/20 animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]",
                        size === "large" ? "border-8" : "border-4"
                    )} />
                    <div className={cn(
                        "absolute inset-0 rounded-full border-4 border-indigo-500/10 animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite]",
                        size === "large" ? "border-8" : "border-4"
                    )} />
                </>
            )}
            <div className={cn(
                "relative z-10 rounded-full flex items-center justify-center transition-all duration-500 shadow-2xl backdrop-blur-sm border border-white/10",
                isRecording
                    ? "bg-gradient-to-br from-indigo-600 to-violet-600 scale-110 shadow-indigo-500/50"
                    : "bg-gray-900 shadow-xl hover:scale-105",
                size === "large" ? "w-32 h-32" : "w-14 h-14"
            )}>
                {isRecording ? (
                    <MicOff className={cn("text-white", size === "large" ? "w-12 h-12" : "w-6 h-6")} />
                ) : (
                    <Mic className={cn("text-white", size === "large" ? "w-12 h-12" : "w-6 h-6")} />
                )}
            </div>
        </div>
    );

    const { data: surveyData, isLoading, refetch: refetchSurvey } = useQuery({
        queryKey: ['survey', surveyId],
        queryFn: async () => {
            const response = await fetch(`/api/surveys/${surveyId}/details`);
            if (!response.ok) throw new Error('Failed to load survey');
            return response.json();
        },
        retry: 1,
    });

    const survey = surveyData?.survey;

    // Computed values
    const currentSampleNumber = (survey?.sampleConversationCount || 0) + 1;
    const samplesRemaining = MAX_SAMPLE_CONVERSATIONS - (survey?.sampleConversationCount || 0);
    const canRetry = samplesRemaining > 0;

    const isOwnerOrEditor = survey?.userId === user?.id || survey?.collaborators?.includes(user?.id || "");

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    const { messages, setMessages, sendMessage, status } = useChat({
        id: `sample-${currentSampleNumber}`,
        transport: new DefaultChatTransport({
            api: `/api/surveys/${surveyId}/sample`,
            body: { conversationNumber: currentSampleNumber },
        }),
        onFinish: ({ message }) => {
            const messageText = message.parts
                ?.filter(part => part.type === "text")
                .map(part => part.text)
                .join("") || "";
            if (messageText.includes("[[SURVEY_COMPLETED]]")) {
                toast.success(t("Toasts.Finished"));
            }
        }
    });

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const isTextLoading = status === "streaming" || status === "submitted";

    // Clean up SURVEY_COMPLETED tags from rendering
    const visibleMessages = messages.map(msg => {
        const textPart = msg.parts?.find(p => p.type === 'text');
        const hasCompletionTag = msg.role === "assistant" && textPart && textPart.text.includes("[[SURVEY_COMPLETED]]");
        const hasCompletionTool = msg.role === "assistant" && msg.parts?.some(p => (p.type === 'tool-invocation' || p.type === 'tool-call') && (p as any).toolName === 'finishSurvey');

        if (hasCompletionTag || hasCompletionTool) {
            return {
                ...msg,
                parts: msg.parts.map(p => {
                    if (p.type === 'text') {
                        return { ...p, text: p.text.replace("[[SURVEY_COMPLETED]]", "").trim() };
                    }
                    return p;
                })
            };
        }
        return msg;
    }).filter(m => m.id !== "init_ping_hidden");

    // WebSocket Hook for Voice Conversation
    const voiceWs = useVoiceWebSocket({
        url: `${clientEnv.NEXT_PUBLIC_WEBSOCKET_URL}/voice/sample-conversation?surveyId=${surveyId}&conversationNumber=${currentSampleNumber}`,
        onReady: () => {
            console.log("Sample conversation WebSocket ready");
        },
        onMessage: (data) => {
            if (data.type === "audio_sent" || data.type === "text_response") {
                setMessages(prev => [...prev, {
                    id: Date.now().toString(),
                    role: "assistant",
                    parts: [{ type: 'text', text: data.text }],
                    timestamp: new Date().toISOString()
                } as any]);
            } else if (data.type === "transcription" && data.isFinal) {
                setMessages(prev => [...prev, {
                    id: Date.now().toString(),
                    role: "user",
                    parts: [{ type: 'text', text: data.text }],
                    timestamp: new Date().toISOString()
                } as any]);
            } else if (data.type === 'display_media') {
                if (survey?.media) {
                    const fullMedia = survey.media.find((m: any) => m.id === data.media.id);
                    if (fullMedia) {
                        setMessages(prev => [...prev, {
                            id: Date.now().toString(),
                            role: "assistant",
                            parts: [{ type: 'text', text: "Shared media" }],
                            timestamp: new Date().toISOString(),
                            media: fullMedia
                        } as any]);
                    }
                }
            }
        }
    });

    // Auto-greeting mutation is replaced by useChat use effect

    // Auto-connect voice or trigger text greeting when survey loads
    useEffect(() => {
        if (!survey || hasAutoGreeted) return;

        if (inputMode === "voice" && survey.isVoice) {
            setShowTranscript(false);
            console.log("Connecting voice websocket...");
            voiceWs.connect();
        } else if (inputMode === "text" && messages.length === 0) {
            sendMessage({
                id: "init_ping_hidden",
                role: "user",
                parts: [{ type: 'text', text: "Start the conversation now. Greet the participant according to the system prompt instructions." }]
            } as any);
        }

        setHasAutoGreeted(true);
    }, [survey, inputMode, hasAutoGreeted]);

    // Initialize inputMode based on survey type
    useEffect(() => {
        if (survey?.isVoice) {
            setInputMode("voice");
            setShowTranscript(false);
        }
    }, [survey?.isVoice]);

    const handleTextSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!textInput.trim() || isTextLoading) return;

        const currentInput = textInput.trim();
        setTextInput('');

        try {
            await sendMessage({
                role: "user",
                parts: [{ type: 'text', text: currentInput }],
            } as any);
        } catch (error) {
            toast.error(t("Toasts.AIResponseFailed"));
        }
    };

    const handleRetry = async () => {
        if (!canRetry) {
            toast.error(t("Toasts.NoRetries"));
            return;
        }

        setIsRetrying(true);
        try {
            // Save feedback and increment count
            const response = await fetch(`/api/surveys/${surveyId}/sample/feedback`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ feedback }),
            });

            if (response.ok) {
                toast.success(t("Toasts.FeedbackApplied"));
                setFeedback("");
                setMessages([]);

                // Refresh survey data to get new conversation count
                await refetchSurvey(); // FIX: Using refetch instead of setSurvey

                // Reconnect WS with new number if in voice mode
                if (inputMode === "voice") {
                    voiceWs.disconnect();
                    setTimeout(() => voiceWs.connect(), 500);
                }

                // If in text mode, trigger greeting again
                if (inputMode === "text") {
                    // small delay to allow state reset
                    setTimeout(() => {
                        sendMessage({
                            id: "init_ping_hidden",
                            role: "user",
                            parts: [{ type: 'text', text: "Start the conversation now. Greet the participant according to the system prompt instructions." }]
                        } as any);
                    }, 500);
                }
            } else {
                toast.error(t("Toasts.FeedbackFailed"));
            }
        } catch (error) {
            toast.error(t("Toasts.FeedbackError"));
        } finally {
            setIsRetrying(false);
        }
    };

    const handleConfirm = async () => {
        if (!confirm(t("ConfirmDialog.Message"))) return;

        setIsConfirming(true);
        try {
            const response = await fetch(`/api/surveys/${surveyId}/publish`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });

            if (response.ok) {
                toast.success(t("Toasts.Confirmed"));
                router.push(`/dashboard/surveys/${surveyId}`);
            } else {
                toast.error(t("Toasts.ConfirmFailed"));
            }
        } catch (error) {
            toast.error(t("Toasts.Error")); // Was "An error occurred" - generic
        } finally {
            setIsConfirming(false);
        }
    };

    const handleAddComment = async () => {
        if (!commentText.trim()) return;

        setIsCommenting(true);
        try {
            const result = await addSampleConversationCommentAction(
                surveyId,
                currentSampleNumber,
                commentText
            );

            if (result.success) {
                toast.success(t("Feedback.CommentAdded") || "Comment added");
                setCommentText("");
                refetchSurvey();
            } else {
                toast.error(result.error);
            }
        } catch (error) {
            toast.error("Failed to add comment");
        } finally {
            setIsCommenting(false);
        }
    };

    if (isLoading) {
        return (
            <div className="h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
        );
    }

    return (
        <div className="flex flex-row h-[calc(100vh-4rem)] bg-white overflow-hidden">

            {/* Main Application Area (Left/Center) */}
            <div className="flex-1 flex flex-col min-w-0 bg-white relative">

                {/* Header (Non-sticky to avoid overlap issues) */}
                <header className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-white z-10">
                    <div className="flex items-center gap-4">
                        <Link
                            href={`/dashboard/surveys/${surveyId}`}
                            className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-900"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div className="flex flex-col">
                            <h1 className="text-lg font-semibold text-gray-900 tracking-tight">{survey?.title}</h1>
                            <span className="text-xs text-gray-500 font-medium">{t("Header.Title")}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {inputMode === "voice" && (
                            <button
                                onClick={() => setShowTranscript(!showTranscript)}
                                className="px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                {showTranscript ? t("Actions.HideText") : t("Actions.ShowText")}
                            </button>
                        )}
                        <button
                            onClick={handleConfirm}
                            disabled={isConfirming || messages.length < 2}
                            className="flex items-center gap-2 px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-black transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isConfirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                            {t("Actions.Publish")}
                        </button>
                    </div>
                </header>

                {/* Chat Area */}
                <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-6 scrollbar-thumb-gray-200 scrollbar-track-transparent">
                    {(!showTranscript && inputMode === "voice") ? (
                        <div className="flex-1 h-full flex flex-col items-center justify-center p-8 min-h-[400px]">
                            <button
                                onClick={() => {
                                    if (voiceWs.status !== "connected") {
                                        voiceWs.connect();
                                    } else if (voiceWs.isRecording) {
                                        voiceWs.stopRecording();
                                    } else {
                                        voiceWs.startRecording();
                                    }
                                }}
                                className="group focus:outline-none transition-transform active:scale-95 mb-8"
                            >
                                <VisualizerRing isRecording={voiceWs.isRecording} size="large" />
                            </button>

                            <div className="text-center max-w-md animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
                                <p className="text-xl font-medium text-gray-900 mb-2">
                                    {voiceWs.isRecording ? t("VoiceVisualizer.Listening") : voiceWs.isPlaying ? t("VoiceVisualizer.AISpeaking") : t("VoiceVisualizer.TapToSpeak")}
                                </p>
                                <p className="text-gray-500">
                                    {voiceWs.status === "connected"
                                        ? t("VoiceVisualizer.SpeakInstruction")
                                        : t("VoiceVisualizer.Connecting")}
                                </p>
                            </div>
                        </div>
                    ) : (
                        <>
                            {messages.length === 0 && (
                                <div className="h-full flex flex-col items-center justify-center text-center space-y-6 opacity-40">
                                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center">
                                        <Bot className="w-8 h-8 text-gray-400" />
                                    </div>
                                    <div className="space-y-2 max-w-xs">
                                        <p className="text-sm font-medium text-gray-900">{t("EmptyState.StartTitle")}</p>
                                        <p className="text-xs text-gray-500">
                                            {inputMode === "voice"
                                                ? t("EmptyState.VoiceInstruction")
                                                : t("EmptyState.TextInstruction")}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {visibleMessages.map((msg: any) => (
                                <div key={msg.id} className={cn("flex flex-col gap-2 max-w-[85%]", msg.role === "user" ? "self-end items-end" : "self-start items-start")}>
                                    <div className={cn(
                                        "px-5 py-3 rounded-2xl text-[15px] leading-relaxed shadow-sm",
                                        msg.role === "assistant"
                                            ? "bg-gray-50 text-gray-800 rounded-tl-sm border border-gray-100"
                                            : "bg-black text-white rounded-tr-sm"
                                    )}>
                                        {msg.toolInvocations?.map((inv: any, index: number) => {
                                            if (inv.toolName === 'showMedia' && inv.state === 'result') {
                                                const media = inv.result?.media || (typeof inv.result === 'string' ? JSON.parse(inv.result).media : null);
                                                return media ? <MediaDisplay key={inv.toolCallId || index} media={media} /> : null;
                                            }
                                            if (inv.toolName === 'finishSurvey') {
                                                return (
                                                    <div key={inv.toolCallId || index} className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100 mt-2">
                                                        <CheckCircle className="w-3.5 h-3.5" />
                                                        {t("Toasts.Finished")}
                                                    </div>
                                                );
                                            }
                                            return null;
                                        })}

                                        {/* Legacy multipart/fallback support */}
                                        {(!msg.toolInvocations || msg.toolInvocations.length === 0) && msg.parts?.map((part: any, index: number) => {
                                            if (part.type === 'text') {
                                                return <MarkdownMessage key={index} content={part.text} />;
                                            }
                                            if (part.type === 'tool-invocation' || part.type === 'tool-call') {
                                                const inv = part as any;
                                                if (inv.toolName === 'showMedia' && inv.state === 'result') {
                                                    const media = inv.result?.media || (typeof inv.result === 'string' ? JSON.parse(inv.result).media : null);
                                                    return media ? <MediaDisplay key={inv.toolCallId || index} media={media} /> : null;
                                                }
                                                if (inv.toolName === 'finishSurvey') {
                                                    return (
                                                        <div key={inv.toolCallId || index} className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100 mt-2">
                                                            <CheckCircle className="w-3.5 h-3.5" />
                                                            {t("Toasts.Finished")}
                                                        </div>
                                                    );
                                                }
                                            }
                                            return null;
                                        })}

                                        {/* Fallback for basic text messages with parts but no toolInvocations (common in SDK v6 Message type) */}
                                        {msg.toolInvocations && msg.toolInvocations.length > 0 && msg.parts?.map((part: any, index: number) => {
                                            if (part.type === 'text') {
                                                return <MarkdownMessage key={index} content={part.text} />;
                                            }
                                            return null;
                                        })}
                                        {msg.media && <MediaDisplay media={msg.media} />}
                                    </div>
                                </div>
                            ))}

                            {isTextLoading && (
                                <div className="self-start">
                                    <div className="px-4 py-3 bg-gray-50 rounded-2xl rounded-tl-sm border border-gray-100 flex items-center gap-1.5 ">
                                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} className="h-2" />
                        </>
                    )}
                </div>

                {/* Input Area */}
                <div className="p-4 bg-white border-t border-gray-50/50">
                    <div className="max-w-2xl mx-auto w-full relative">
                        {/* Input Mode Toggles */}
                        <div className="absolute -top-14 left-1/2 -translate-x-1/2 flex items-center gap-1 p-1 bg-white border border-gray-100 shadow-sm rounded-full">
                            <button
                                onClick={() => {
                                    setInputMode("voice");
                                    if (survey?.isVoice) voiceWs.connect();
                                    // Don't auto-hide transcript here, let user toggle or persist
                                }}
                                className={cn(
                                    "px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5",
                                    inputMode === "voice"
                                        ? "bg-gray-100 text-gray-900"
                                        : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                                )}
                            >
                                <Volume2 className="w-3 h-3" /> {t("Input.Voice")}
                            </button>
                            <button
                                onClick={() => {
                                    setInputMode("text");
                                    voiceWs.disconnect();
                                    setShowTranscript(true); // Always show transcript for text
                                }}
                                className={cn(
                                    "px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5",
                                    inputMode === "text"
                                        ? "bg-gray-100 text-gray-900"
                                        : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                                )}
                            >
                                <Keyboard className="w-3 h-3" /> {t("Input.Text")}
                            </button>
                        </div>

                        {inputMode === "voice" ? (
                            <div className="flex flex-col items-center justify-center space-y-3 pb-2 pt-2">
                                {!showTranscript ? (
                                    // Helper text or Live Transcription only
                                    <div className="w-full">
                                        {voiceWs.isRecording && (voiceWs.transcription || voiceWs.interimTranscription) && (
                                            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 animate-in fade-in slide-in-from-bottom-2 duration-200 max-w-lg mx-auto">
                                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 text-center">
                                                    {t("Input.LiveTranscription")}
                                                </p>
                                                <p className="text-sm text-gray-900 leading-relaxed text-center">
                                                    {voiceWs.transcription}
                                                    <span className="text-gray-400 italic">{voiceWs.interimTranscription}</span>
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <>
                                        <button
                                            onClick={() => {
                                                if (voiceWs.status !== "connected") {
                                                    voiceWs.connect();
                                                } else if (voiceWs.isRecording) {
                                                    voiceWs.stopRecording();
                                                } else {
                                                    voiceWs.startRecording();
                                                }
                                            }}
                                            className={cn(
                                                "relative w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300",
                                                voiceWs.status !== "connected" ? "bg-gray-100 text-gray-400" :
                                                    voiceWs.isRecording ? "bg-red-50 text-red-600 ring-2 ring-red-100" :
                                                        "bg-black text-white hover:scale-105 shadow-md"
                                            )}
                                        >
                                            {voiceWs.isRecording && (
                                                <span className="absolute inset-0 rounded-full bg-red-500/10 animate-ping" />
                                            )}
                                            {voiceWs.status !== "connected" ? <Loader2 className="w-5 h-5 animate-spin" /> :
                                                voiceWs.isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                                        </button>

                                        <p className="text-xs text-center h-4 text-gray-500 font-medium truncate max-w-sm">
                                            {voiceWs.isRecording ? (voiceWs.transcription || t("VoiceVisualizer.Listening")) : (voiceWs.status !== "connected" ? t("VoiceVisualizer.Connecting") : t("VoiceVisualizer.TapToSpeak"))}
                                        </p>
                                    </>
                                )}
                            </div>
                        ) : (
                            <form onSubmit={handleTextSubmit} className="relative">
                                <input
                                    value={textInput}
                                    onChange={(e) => setTextInput(e.target.value)}
                                    placeholder={t("Input.Placeholder")}
                                    className="w-full pl-5 pr-12 py-3.5 bg-gray-50 border-transparent focus:border-gray-200 focus:bg-white focus:ring-4 focus:ring-gray-100 rounded-xl transition-all outline-none text-sm placeholder:text-gray-400 text-gray-900"
                                    autoFocus
                                />
                                <button
                                    type="submit"
                                    disabled={!textInput.trim() || isTextLoading}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-white text-gray-900 rounded-lg hover:bg-gray-100 transition-all disabled:opacity-0 shadow-sm border border-gray-100"
                                >
                                    <Send className="w-4 h-4" />
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            </div>

            {/* Right Sidebar - Feedback & Controls */}
            <div className="w-80 border-l border-gray-100 bg-gray-50/30 flex flex-col hidden lg:flex">
                <div className="p-6 space-y-6 flex-1 overflow-y-auto">
                    {isOwnerOrEditor && (
                        <>
                            <div>
                                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-widest mb-1 flex items-center gap-2">
                                    <MessageSquare className="w-3 h-3 text-gray-500" />
                                    {t("Feedback.Title")}
                                </h3>
                                <p className="text-xs text-gray-500 leading-relaxed">
                                    {t("Feedback.Description")}
                                </p>
                            </div>

                            <div className="space-y-3 pb-6 border-b border-gray-200">
                                <textarea
                                    value={feedback}
                                    onChange={(e) => setFeedback(e.target.value)}
                                    placeholder={t("Feedback.Placeholder")}
                                    className="w-full h-32 p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-gray-900/5 focus:border-gray-300 outline-none resize-none bg-white text-sm placeholder:text-gray-400"
                                />

                                <div className="flex items-center justify-between text-xs text-gray-400 px-1">
                                    <span>{t("Feedback.Chars", { count: feedback.length })}</span>
                                    <span>{t("Feedback.RetriesLeft", { count: samplesRemaining })}</span>
                                </div>

                                <button
                                    onClick={handleRetry}
                                    disabled={!feedback.trim() || isRetrying || !canRetry}
                                    className={cn(
                                        "w-full py-2.5 px-4 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 shadow-sm",
                                        feedback.trim() && canRetry
                                            ? "bg-gray-900 text-white hover:bg-black"
                                            : "bg-gray-200 text-gray-400 cursor-not-allowed"
                                    )}
                                >
                                    {isRetrying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5" />}
                                    {isRetrying ? t("Feedback.Applying") : t("Feedback.Button")}
                                </button>

                                {!canRetry && (
                                    <div className="p-3 bg-amber-50 rounded-lg border border-amber-100 text-amber-800 text-xs mt-2">
                                        {t("Feedback.LimitReached")}
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {/* Team Comments Section */}
                    <div className="pt-2 flex flex-col flex-1">
                        <div className="mb-4">
                            <h3 className="text-xs font-bold text-gray-900 uppercase tracking-widest mb-1 flex items-center gap-2">
                                <MessageSquare className="w-3 h-3 text-gray-500" />
                                Team Comments
                            </h3>
                            <p className="text-xs text-gray-500 leading-relaxed">
                                Discuss this sample with your team.
                            </p>
                        </div>

                        <div className="flex-1 overflow-y-auto mb-4 space-y-4">
                            {/* We don't have direct access to the conversation comments easily without fetching the specific conversation. For now, since comments are per-conversation, let's just show an input to post them. The best UX would fetch current comments via a hook. We'll leave the display simplified or query them if possible. */}
                            <div className="text-sm text-gray-500 italic p-4 bg-white rounded-xl border border-gray-100 shadow-sm text-center">
                                Comments are saved for your team to review.
                            </div>
                        </div>

                        <div className="mt-auto space-y-3">
                            <textarea
                                value={commentText}
                                onChange={(e) => setCommentText(e.target.value)}
                                placeholder="Add a comment..."
                                className="w-full h-24 p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-gray-900/5 focus:border-gray-300 outline-none resize-none bg-white text-sm placeholder:text-gray-400"
                            />
                            <button
                                onClick={handleAddComment}
                                disabled={!commentText.trim() || isCommenting}
                                className={cn(
                                    "w-full py-2.5 px-4 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 shadow-sm",
                                    commentText.trim()
                                        ? "bg-indigo-600 text-white hover:bg-indigo-700"
                                        : "bg-gray-200 text-gray-400 cursor-not-allowed"
                                )}
                            >
                                {isCommenting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                Post Comment
                            </button>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
