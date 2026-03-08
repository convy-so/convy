"use client";

import { clientEnv } from "@/lib/env.client";

import { useState, useRef, useEffect, FormEvent } from "react";
import { useParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/routing";
import { useTranslations } from "next-intl";
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
import { queryKeys } from "@/lib/query-keys";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { toast } from "react-hot-toast";
import { useAuth } from "@/components/providers/auth-provider";
import { ClientT } from "@/components/i18n/client-t";
import { getClientTranslation } from "@/app/actions/translate";
import { useVoiceWebSocket } from "@/hooks/use-voice-websocket";
import { MediaDisplay } from "@/components/surveys/media-display";
import { MarkdownMessage } from "@/components/ui/markdown-message";
import { useQuery } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type ToolInvocation } from "ai";
import { VoiceSurveyStartOverlay } from "@/components/surveys/voice-survey-start-overlay";
import { addSampleConversationCommentAction } from "@/app/actions/sample-conversation";

const MAX_SAMPLE_CONVERSATIONS = 3;

import { type SurveyUIMessage, type SurveyMedia } from "@/lib/types/survey-flow";

type Message = SurveyUIMessage;



export default function SampleReviewPage() {
    const params = useParams();
    const router = useRouter();
    const queryClient = useQueryClient();
    const { user, session } = useAuth();
    const surveyId = params.surveyId as string;
    const t = useTranslations("Survey.SampleReview");

    const [isConfirming, setIsConfirming] = useState(false);
    const [feedback, setFeedback] = useState("");
    const [isRetrying, setIsRetrying] = useState(false);
    const [inputMode, setInputMode] = useState<"voice" | "text">("text");
    const [textInput, setTextInput] = useState("");
    const [hasAutoGreeted, setHasAutoGreeted] = useState(false);
    const [hasStarted, setHasStarted] = useState(false);
    const [commentText, setCommentText] = useState("");
    const [isCommenting, setIsCommenting] = useState(false);
    const [showTranscript, setShowTranscript] = useState(false);

    // Publish Modal State
    const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
    const [publishTitle, setPublishTitle] = useState("");
    const [publishDescription, setPublishDescription] = useState("");

    // Translated placeholders
    const [placeholders, setPlaceholders] = useState({
        textInput: "Type your response...",
        feedback: "Tell the AI what to improve...",
        publishTitle: "e.g. Q3 Customer Satisfaction",
        publishDescription: "Briefly describe the purpose of this survey..."
    });

    useEffect(() => {
        const translatePlaceholders = async () => {
            try {
                const [textInput, feedback, pTitle, pDesc] = await Promise.all([
                    getClientTranslation("Type your response..."),
                    getClientTranslation("Tell the AI what to improve..."),
                    getClientTranslation("e.g. Q3 Customer Satisfaction"),
                    getClientTranslation("Briefly describe the purpose of this survey...")
                ]);
                setPlaceholders({
                    textInput,
                    feedback,
                    publishTitle: pTitle,
                    publishDescription: pDesc
                });
            } catch (err) {
                console.error("Failed to translate placeholders", err);
            }
        };
        translatePlaceholders();
    }, []);


    const VisualizerRing = ({ isRecording, isAgentSpeaking, size = "normal" }: { isRecording: boolean; isAgentSpeaking: boolean; size?: "normal" | "large" }) => (
        <div className="relative flex items-center justify-center">
            {(isRecording || isAgentSpeaking) && (
                <>
                    <div className={cn(
                        "absolute inset-0 rounded-full border-4 border-indigo-500/20 animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]",
                        size === "large" ? "border-8" : "border-4",
                        isAgentSpeaking ? "border-emerald-500/20" : "border-indigo-500/20"
                    )} />
                    <div className={cn(
                        "absolute inset-0 rounded-full border-4 border-indigo-500/10 animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite]",
                        size === "large" ? "border-8" : "border-4",
                        isAgentSpeaking ? "border-emerald-500/10" : "border-indigo-500/10"
                    )} />
                </>
            )}
            <div className={cn(
                "relative z-10 rounded-full flex items-center justify-center transition-all duration-500 shadow-2xl backdrop-blur-sm border border-white/10",
                voiceWs.status === "error"
                    ? "bg-red-500 shadow-red-500/50"
                    : isAgentSpeaking
                        ? "bg-gradient-to-br from-emerald-500 to-teal-600 scale-110 shadow-emerald-500/30"
                        : isRecording
                            ? "bg-gradient-to-br from-indigo-600 to-violet-600 scale-110 shadow-indigo-500/50"
                            : "bg-gray-900 shadow-xl hover:scale-105",
                size === "large" ? "w-32 h-32" : "w-14 h-14"
            )}>
                {voiceWs.status === "error" ? (
                    <Loader2 className={cn("text-white animate-spin", size === "large" ? "w-12 h-12" : "w-6 h-6")} />
                ) : isAgentSpeaking ? (
                    <Bot className={cn("text-white animate-pulse", size === "large" ? "w-12 h-12" : "w-6 h-6")} />
                ) : isRecording ? (
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

    // A workspace context exists if the current session is in a workspace
    // OR the survey itself belongs to an organization.
    const isWorkspaceContext = !!(
        (session as { activeOrganizationId?: string } | null)?.activeOrganizationId ||
        survey?.organizationId
    );

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
                getClientTranslation("Your survey is complete!").then(toast.success);
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
        const hasCompletionTool = msg.role === "assistant" && msg.parts?.some(p => (p.type === 'tool-invocation' || p.type === 'tool-call') && (p as { toolName?: string }).toolName === 'finishSurvey');

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
            if (data.type === "conversation_text") {
                const { role, content } = data;

                // Filter out internal thinking/directives
                if (content.includes("<thinking>") || content.includes("Internal instructions:")) {
                    return;
                }

                setMessages(prev => {
                    // Avoid duplicate messages if the same text was already transcribed or sent
                    const lastMsg = prev[prev.length - 1];
                    const lastText = lastMsg?.parts?.find(p => p.type === 'text')?.text;
                    if (lastText === content && lastMsg?.role === role) return prev;

                    return [...prev, {
                        id: `voice-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        role: role as "assistant" | "user",
                        parts: [{ type: 'text', text: content }],
                        timestamp: new Date().toISOString()
                    } as Message];
                });
            } else if (data.type === "audio_sent" || data.type === "text_response") {
                if (!data.text) return;
                setMessages(prev => [...prev, {
                    id: `legacy-${Date.now()}`,
                    role: "assistant",
                    parts: [{ type: 'text', text: data.text }],
                    timestamp: new Date().toISOString()
                } as Message]);
            } else if (data.type === "transcription" && data.isFinal) {
                // DUAL-AGENT BUG FIX: No longer calling sendMessage() here
                console.log("[Sample Review] Transcription received (Voice):", data.text);
            } else if (data.type === 'display_media') {
                if (survey?.media) {
                    const fullMedia = survey.media.find((m: SurveyMedia) => m.id === data.media.id);
                    if (fullMedia) {
                        setMessages(prev => [...prev, {
                            id: `media-${Date.now()}`,
                            role: "assistant",
                            parts: [{ type: 'text', text: "Shared media" }],
                            timestamp: new Date().toISOString(),
                            media: fullMedia
                        } as Message]);
                    }
                }
            }
        }
    });

    // Auto-greeting mutation is replaced by useChat use effect

    // Auto-connect voice or trigger text greeting when survey loads
    useEffect(() => {
        if (!survey || hasAutoGreeted) return;

        // For voice surveys, we wait for hasStarted (user clicked through the overlay)
        if (survey.isVoice && !hasStarted) return;

        if (inputMode === "voice" && survey.isVoice) {
            console.log("Connecting voice websocket...");
            voiceWs.connect();
        } else if (inputMode === "text") {
            const lastMessage = messages[messages.length - 1];
            const isNew = messages.length === 0;
            const userSpokeLast = lastMessage?.role === "user";

            if (isNew || userSpokeLast) {
                console.log("[Sample Review] Triggering AI catch-up/start (Text Mode)...");
                sendMessage({
                    id: isNew ? "init_ping_hidden" : `resume_ping_${Date.now()}`,
                    role: "user",
                    parts: [{
                        type: 'text',
                        text: isNew
                            ? "Start the conversation now. Greet the participant according to the system prompt instructions."
                            : "The user has returned to this sample survey review. Respond to their last input and continue the interview naturally."
                    }]
                } as Message);
            }
        }

        setHasAutoGreeted(true);
    }, [survey, inputMode, hasAutoGreeted, messages, sendMessage, hasStarted, voiceWs]);

    // Initialize inputMode based on survey type
    useEffect(() => {
        if (survey?.isVoice) {
            setInputMode("voice");
            setShowTranscript(false);
        } else {
            setShowTranscript(true);
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
            } as Message);
        } catch {
            getClientTranslation("Failed to send message. Please try again.").then(toast.error);
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
                getClientTranslation("Feedback applied. Starting new simulation...").then(toast.success);
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
                        } as Message);
                    }, 500);
                }
            } else {
                getClientTranslation("Failed to apply feedback.").then(toast.error);
            }
        } catch {
            getClientTranslation("An error occurred. Please try again.").then(toast.error);
        } finally {
            setIsRetrying(false);
        }
    };

    // Opens the new publish modal and populates current title/desc
    const handleConfirm = () => {
        setPublishTitle(survey?.title || "");
        setPublishDescription(survey?.description || survey?.expertState?.objective?.context || "");
        setIsPublishModalOpen(true);
    };

    // Actually perform the network request from the modal
    const submitPublish = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();

        setIsConfirming(true);
        try {
            const finalTitle = publishTitle.trim() || survey?.title;
            const finalDesc = publishDescription.trim();
            const response = await fetch(`/api/surveys/${surveyId}/publish`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: finalTitle,
                    description: finalDesc
                }),
            });

            if (response.ok) {
                getClientTranslation("Survey published successfully!").then(toast.success);
                setIsPublishModalOpen(false);

                // Optimistically update the query cache so the destination page doesn't flash the old State & "sample_review" button
                queryClient.setQueryData(queryKeys.surveys.detail(surveyId), (oldData: { survey: Record<string, unknown> } | undefined) => {
                    if (!oldData || !oldData.survey) return oldData;
                    return {
                        ...oldData,
                        survey: {
                            ...oldData.survey,
                            status: "active",
                            title: finalTitle,
                            description: finalDesc
                        }
                    };
                });

                // Invalidate the query entirely so an actual fresh background fetch begins as well
                queryClient.invalidateQueries({ queryKey: queryKeys.surveys.detail(surveyId) });

                router.push(`/dashboard/surveys/${surveyId}`);
            } else {
                getClientTranslation("Failed to publish survey.").then(toast.error);
            }
        } catch {
            getClientTranslation("An error occurred while publishing.").then(toast.error);
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
                getClientTranslation("Comment added").then(toast.success);
                setCommentText("");
                refetchSurvey();
            } else {
                toast.error(result.error);
            }
        } catch {
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

    const handleStartSample = async () => {
        setHasStarted(true);
    };

    return (
        <div className="flex flex-row h-[calc(100vh-4rem)] bg-white overflow-hidden relative">

            {/* Start Overlay for Voice Samples */}
            {survey?.isVoice && !hasStarted && !isLoading && (
                <VoiceSurveyStartOverlay
                    onStart={handleStartSample}
                    initialLanguage={survey?.language || "en"}
                    title={survey?.title || "Sample Review"}
                    description={survey?.expertState?.objective?.context || "Experience your survey exactly as a participant will."}
                    t={t}
                />
            )}

            {/* Main Application Area (Left/Center) */}
            <div className="flex-1 flex flex-col min-w-0 bg-white relative">

                {/* Header */}
                <header className="bg-white border-b border-gray-100 px-4 sm:px-6 py-3 z-10 flex-shrink-0">
                    <div className="flex items-center justify-between gap-4 h-14">
                        {/* Left: Back and Title */}
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                            <Link
                                href={`/dashboard/surveys/${surveyId}`}
                                className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-900 flex-shrink-0"
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </Link>
                            <div className="flex flex-col min-w-0">
                                <h1 className="text-sm font-semibold text-gray-900 tracking-tight truncate">
                                    {survey?.title}
                                </h1>
                                <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">
                                    <ClientT>Sample Review</ClientT>
                                </span>
                            </div>
                        </div>

                        {/* Right: Action Buttons */}
                        <div className="flex items-center justify-end gap-2 sm:gap-3 flex-shrink-0">
                            <button
                                onClick={handleConfirm}
                                disabled={isConfirming || messages.length < 2}
                                className="flex items-center gap-2 px-4 sm:px-5 py-2 bg-gray-900 text-white text-xs sm:text-sm font-medium rounded-lg hover:bg-black transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                            >
                                {isConfirming ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <CheckCircle className="w-4 h-4" />
                                )}
                                <span><ClientT>Publish Survey</ClientT></span>
                            </button>
                        </div>
                    </div>
                </header>

                {/* Chat Area Container */}
                <div className="flex-1 flex flex-col min-h-0 bg-white relative">
                    {inputMode === "voice" && (
                        <div className="flex-shrink-0 flex flex-col items-center justify-center p-4 border-b border-gray-50 bg-slate-50/50 z-20">
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
                                className="group focus:outline-none transition-transform active:scale-95 my-2"
                            >
                                <VisualizerRing
                                    isRecording={voiceWs.isRecording}
                                    isAgentSpeaking={voiceWs.isPlaying}
                                    size="normal"
                                />
                            </button>

                            <div className="text-center animate-in fade-in slide-in-from-top-2 duration-500">
                                <p className="text-xs font-medium text-gray-900">
                                    {voiceWs.isRecording ? <ClientT>Listening...</ClientT> : voiceWs.isPlaying ? <ClientT>AI Speaking...</ClientT> : <ClientT>Tap to speak</ClientT>}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Messages Scroll Area */}
                    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-6 scrollbar-thumb-gray-200 scrollbar-track-transparent">
                        {messages.length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center text-center space-y-6 opacity-40 py-20">
                                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center">
                                    <Bot className="w-8 h-8 text-gray-400" />
                                </div>
                                <div className="space-y-2 max-w-xs">
                                    <p className="text-sm font-medium text-gray-900"><ClientT>Experience your survey</ClientT></p>
                                    <p className="text-xs text-gray-500">
                                        {inputMode === "voice"
                                            ? <ClientT>Speak naturally to the AI researcher to test the conversation flow.</ClientT>
                                            : <ClientT>Type your responses below to see how the AI handles different scenarios.</ClientT>}
                                    </p>
                                </div>
                            </div>
                        )}

                        {visibleMessages.map((msg: Message) => (
                            <div key={msg.id} className={cn("flex flex-col gap-2 max-w-[85%]", msg.role === "user" ? "self-end items-end" : "self-start items-start")}>
                                <div className={cn(
                                    "px-5 py-3 rounded-2xl text-[15px] leading-relaxed shadow-sm",
                                    msg.role === "assistant"
                                        ? "bg-gray-50 text-gray-800 rounded-tl-sm border border-gray-100"
                                        : "bg-black text-white rounded-tr-sm"
                                )}>
                                    {msg.toolInvocations?.map((inv: ToolInvocation, index: number) => {
                                        if (inv.toolName === 'showMedia' && inv.state === 'result') {
                                            const media = inv.result?.media || (typeof inv.result === 'string' ? JSON.parse(inv.result).media : null);
                                            return media ? <MediaDisplay key={inv.toolCallId || index} media={media} /> : null;
                                        }
                                        if (inv.toolName === 'finishSurvey') {
                                            return (
                                                <div key={inv.toolCallId || index} className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100 mt-2">
                                                    <CheckCircle className="w-3.5 h-3.5" />
                                                    <ClientT>Your survey is complete!</ClientT>
                                                </div>
                                            );
                                        }
                                        return null;
                                    })}

                                    {/* Legacy multipart/fallback support */}
                                    {(!msg.toolInvocations || msg.toolInvocations.length === 0) && msg.parts?.map((part: { type: string; text?: string }, index: number) => {
                                        if (part.type === 'text') {
                                            return <MarkdownMessage key={index} content={part.text} />;
                                        }
                                        if (part.type === 'tool-invocation' || part.type === 'tool-call') {
                                            const inv = part as ToolInvocation;
                                            if (inv.toolName === 'showMedia' && inv.state === 'result') {
                                                const media = inv.result?.media || (typeof inv.result === 'string' ? JSON.parse(inv.result).media : null);
                                                return media ? <MediaDisplay key={inv.toolCallId || index} media={media} /> : null;
                                            }
                                            if (inv.toolName === 'finishSurvey') {
                                                return (
                                                    <div key={inv.toolCallId || index} className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100 mt-2">
                                                        <CheckCircle className="w-3.5 h-3.5" />
                                                        <ClientT>Your survey is complete!</ClientT>
                                                    </div>
                                                );
                                            }
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
                                    }}
                                    className={cn(
                                        "px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5",
                                        inputMode === "voice"
                                            ? "bg-gray-100 text-gray-900"
                                            : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                                    )}
                                >
                                    <Volume2 className="w-3 h-3" /> <ClientT>Voice</ClientT>
                                </button>
                                <button
                                    onClick={() => {
                                        setInputMode("text");
                                        voiceWs.disconnect();
                                        setShowTranscript(true);
                                    }}
                                    className={cn(
                                        "px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5",
                                        inputMode === "text"
                                            ? "bg-gray-100 text-gray-900"
                                            : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                                    )}
                                >
                                    <Keyboard className="w-3 h-3" /> <ClientT>Text</ClientT>
                                </button>
                                {survey?.isVoice && (
                                    <button
                                        onClick={() => setShowTranscript(!showTranscript)}
                                        className={cn(
                                            "px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5",
                                            showTranscript
                                                ? "bg-gray-100 text-gray-900"
                                                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                                        )}
                                    >
                                        <MessageSquare className="w-3 h-3" /> <ClientT>Transcript</ClientT>
                                    </button>
                                )}
                            </div>

                            {inputMode === "voice" ? (
                                <div className="flex flex-col items-center justify-center space-y-3 pb-2 pt-2">
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
                                        {voiceWs.isRecording ? (voiceWs.transcription || <ClientT>Listening...</ClientT>) : (voiceWs.status !== "connected" ? <ClientT>Connecting...</ClientT> : <ClientT>Tap to speak</ClientT>)}
                                    </p>

                                    {/* Live Transcription Display */}
                                    {showTranscript && (voiceWs.isRecording || voiceWs.isPlaying) && (voiceWs.transcription || voiceWs.interimTranscription) && (
                                        <div className="mt-4 bg-gray-50 border border-gray-200 rounded-2xl p-4 animate-in fade-in slide-in-from-bottom-2 duration-200 max-w-lg mx-auto">
                                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 text-center">
                                                <ClientT>Live Transcription</ClientT>
                                            </p>
                                            <p className="text-sm text-gray-900 leading-relaxed text-center">
                                                {voiceWs.transcription}
                                                <span className="text-gray-400 italic">{voiceWs.interimTranscription}</span>
                                            </p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <form onSubmit={handleTextSubmit} className="relative">
                                    <input
                                        value={textInput}
                                        onChange={(e) => setTextInput(e.target.value)}
                                        placeholder={placeholders.textInput}
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
            </div>

            {/* Right Sidebar - Feedback & Controls */}
            <div className="w-80 border-l border-gray-100 bg-gray-50/30 flex flex-col hidden lg:flex">
                <div className="p-6 space-y-6 flex-1 overflow-y-auto">
                    {isOwnerOrEditor && (
                        <>
                            <div>
                                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-widest mb-1 flex items-center gap-2">
                                    <MessageSquare className="w-3 h-3 text-gray-500" />
                                    <ClientT>Simulation Feedback</ClientT>
                                </h3>
                                <p className="text-xs text-gray-500 leading-relaxed">
                                    <ClientT>Is the AI not behaving as expected? Refine its logic by providing feedback below and restarting the simulation.</ClientT>
                                </p>
                            </div>

                            <div className="space-y-3 pb-6 border-b border-gray-200">
                                <textarea
                                    value={feedback}
                                    onChange={(e) => setFeedback(e.target.value)}
                                    placeholder={placeholders.feedback}
                                    className="w-full h-32 p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-900/5 focus:border-gray-300 outline-none resize-none bg-white text-sm placeholder:text-gray-400"
                                />

                                <div className="flex items-center justify-between text-xs text-gray-400 px-1">
                                    <span>{feedback.length} <ClientT>chars</ClientT></span>
                                    <span>{samplesRemaining} <ClientT>retries left</ClientT></span>
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
                                    {isRetrying ? <ClientT>Applying...</ClientT> : <ClientT>Restart with Feedback</ClientT>}
                                </button>

                                {!canRetry && (
                                    <div className="p-3 bg-amber-50 rounded-lg border border-amber-100 text-amber-800 text-xs mt-2">
                                        <ClientT>Simulation limit reached for this version.</ClientT>
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {/* Team Comments Section — only visible when in a workspace context */}
                    {isWorkspaceContext && (
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
                                <div className="text-sm text-gray-500 italic p-4 bg-white rounded-xl border border-gray-100 shadow-sm text-center">
                                    Comments are saved for your team to review.
                                </div>
                            </div>

                            <div className="mt-auto space-y-3">
                                <textarea
                                    value={commentText}
                                    onChange={(e) => setCommentText(e.target.value)}
                                    placeholder="Add a comment..."
                                    className="w-full h-24 p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-900/5 focus:border-gray-300 outline-none resize-none bg-white text-sm placeholder:text-gray-400"
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
                                    <ClientT>Post Comment</ClientT>
                                </button>
                            </div>
                        </div>
                    )}

                </div>
            </div>
            {/* Publish Modal Overlay */}
            {
                isPublishModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-gray-100 overflow-hidden animate-in zoom-in-95 duration-200">
                            <div className="px-6 py-5 border-b border-gray-100 bg-gray-50/50">
                                <h2 className="text-xl font-semibold text-gray-900"><ClientT>Publish Survey</ClientT></h2>
                                <p className="text-sm text-gray-500 mt-1">
                                    <ClientT>{"Review your survey's details before making it live and shareable."}</ClientT>
                                </p>
                            </div>

                            <form onSubmit={submitPublish} className="p-6 space-y-5">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700">
                                        <ClientT>Survey Title</ClientT>
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={publishTitle}
                                        onChange={(e) => setPublishTitle(e.target.value)}
                                        placeholder={placeholders.publishTitle}
                                        className="w-full px-4 py-2.5 bg-white border border-gray-200 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 rounded-xl transition-all outline-none text-sm text-gray-900 placeholder:text-gray-400"
                                        disabled={isConfirming}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700">
                                        <ClientT>Description</ClientT> <span className="text-gray-400 font-normal">(<ClientT>Optional</ClientT>)</span>
                                    </label>
                                    <textarea
                                        value={publishDescription}
                                        onChange={(e) => setPublishDescription(e.target.value)}
                                        placeholder={placeholders.publishDescription}
                                        rows={3}
                                        className="w-full px-4 py-3 bg-white border border-gray-200 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 rounded-xl transition-all outline-none resize-none text-sm text-gray-900 placeholder:text-gray-400"
                                        disabled={isConfirming}
                                    />
                                </div>

                                <div className="pt-2 flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setIsPublishModalOpen(false)}
                                        disabled={isConfirming}
                                        className="flex-1 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 font-medium text-sm rounded-xl hover:bg-gray-50 hover:text-gray-900 transition-colors disabled:opacity-50"
                                    >
                                        <ClientT>Cancel</ClientT>
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={!publishTitle.trim() || isConfirming}
                                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 text-white font-medium text-sm rounded-xl hover:bg-black transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isConfirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                        <ClientT>Confirm Publish</ClientT>
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }
        </div>
    );
}

