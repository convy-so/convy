"use client";

import { clientEnv } from "@/shared/config/client-env";

import { useState, useRef, useEffect, FormEvent } from "react";
import { Link, useRouter } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import {
    Mic,
    MicOff,
    Loader2,
    ArrowLeft,
    CheckCircle,
    MessageSquare,
    Send,

} from "lucide-react";
import { queryKeys } from "@/shared/http/query-keys";
import { readJsonResponseValue } from "@/shared/http/json";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/shared/ui/tailwind-class-utils";
import { toast } from "react-hot-toast";
import { useAuth } from "@/features/auth/public-ui";
import { publishSurveyAction } from "@/app/actions/survey";
import { useVoiceWebSocket } from "@/features/surveys/client/hooks/use-voice-websocket";
import { useQuery } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { SurveyStartOverlay } from "@/features/surveys/ui/survey-start-overlay";
import { getMessageText } from "@/shared/chat/chat-message-text";
import {
    hasSurveyCompletionText,
    stripSurveyCompletionTag,
} from "@/shared/chat/chat-ui-signals";
import { RefinementAssistantPanel } from "@/features/surveys/ui/refinement-assistant-panel";
import { getFriendlyActionError } from "@/shared/http/friendly-action-error";
import {
    fetchSurveyDetails,
    type SurveyDetailsResponse,
} from "@/features/surveys/client/api/surveys-api";
import { SamplePublishModal } from "./sample-publish-modal";
import { SampleReviewMessageList } from "./sample-review-message-list";
import {
    isConversationRole,
    isFinishSurveyPart,
    normalizeSampleMessage,
    normalizeSurveyMedia,
    type SampleReviewMessage,
    VisualizerRing,
} from "./sample-review-message-utils";

const MAX_SAMPLE_CONVERSATIONS = 3;

type SampleHistoryResponse = {
    messages: unknown[];
    completed: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function normalizeSampleHistoryResponse(value: unknown): SampleHistoryResponse {
    if (!isRecord(value)) {
        return { messages: [], completed: false };
    }

    return {
        messages: Array.isArray(value.messages) ? value.messages : [],
        completed: value.completed === true,
    };
}

function normalizeSampleHistoryMessages(messages: readonly unknown[]): SampleReviewMessage[] {
    return messages.flatMap((message, index) => {
        if (!isRecord(message) || typeof message.role !== "string") {
            return [];
        }

        const normalizedMessage = normalizeSampleMessage(
            {
                id: typeof message.id === "string" ? message.id : undefined,
                role: message.role,
                content: typeof message.content === "string" ? message.content : undefined,
                parts: message.parts,
                timestamp: typeof message.timestamp === "string" ? message.timestamp : undefined,
            },
            index,
        );

        return normalizedMessage ? [normalizedMessage] : [];
    });
}

export function SampleReviewPageClient({
    surveyId,
    initialSurveyData,
    initialHistoryData,
}: {
    surveyId: string;
    initialSurveyData: SurveyDetailsResponse | null;
    initialHistoryData: { messages: unknown[] } | null;
}) {
    const router = useRouter();
    const queryClient = useQueryClient();
    useAuth();
    const t = useTranslations("Survey.SampleReview");

    const [isConfirming, setIsConfirming] = useState(false);
    const [inputMode, setInputMode] = useState<"voice" | "text">("text");
    const [textInput, setTextInput] = useState("");
    const [hasAutoGreeted, setHasAutoGreeted] = useState(false);
    const [hasStarted, setHasStarted] = useState(false);
    const [showTranscript, setShowTranscript] = useState(false);
    const [selectedSampleNumber, setSelectedSampleNumber] = useState<number | null>(null);
    const isHandlingGreetingRef = useRef(false);

    // Publish Modal State
    const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
    const [publishTitle, setPublishTitle] = useState("");
    const [publishDescription, setPublishDescription] = useState("");

    // Translated placeholders
    const [placeholders, setPlaceholders] = useState({
        textInput: "Type your response...",
        publishTitle: "e.g. Q3 Customer Satisfaction",
        publishDescription: "Briefly describe the purpose of this survey..."
    });

    useEffect(() => {
        setPlaceholders({
            textInput: t("Input.Placeholder"),
            publishTitle: "e.g. Q3 Customer Satisfaction",
            publishDescription: "Briefly describe the purpose of this survey...",
        });
    }, [t]);


    const { data: surveyData, isLoading } = useQuery<SurveyDetailsResponse>({
        queryKey: ['survey', surveyId],
        queryFn: () => fetchSurveyDetails(surveyId),
        initialData: initialSurveyData ?? undefined,
        staleTime: 30_000,
        retry: 1,
    });

    const survey = surveyData?.survey;

    // Computed values
    const currentSampleNumber = (survey?.sampleConversationCount || 0) + 1;
    const activeSampleNumber = selectedSampleNumber || currentSampleNumber;
    const samplesRemaining = MAX_SAMPLE_CONVERSATIONS - (survey?.sampleConversationCount || 0);
    const sampleConversationCount = survey?.sampleConversationCount ?? 0;
    const canRetry = samplesRemaining > 0;

    const isOwnerOrEditor = Boolean(survey?.permission?.canEdit);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    const { data: historyData, isLoading: isHistoryLoading } = useQuery<SampleHistoryResponse>({
        queryKey: ['sample-history', surveyId, activeSampleNumber],
        queryFn: async () => {
            const response = await fetch(`/api/surveys/${surveyId}/sample?conversationNumber=${activeSampleNumber}`);
            if (!response.ok) {
                return { messages: [], completed: false };
            }
            return normalizeSampleHistoryResponse(await readJsonResponseValue(response));
        },
        initialData:
            activeSampleNumber === (initialSurveyData?.survey.sampleConversationCount || 0) + 1
                ? normalizeSampleHistoryResponse(initialHistoryData)
                : undefined,
        staleTime: 30_000,
        enabled: !!surveyId,
    });

    const { messages, setMessages, sendMessage, status } = useChat({
        id: `sample-${activeSampleNumber}`,
        messages: normalizeSampleHistoryMessages(initialHistoryData?.messages ?? []),
        transport: new DefaultChatTransport({
            api: `/api/surveys/${surveyId}/sample`,
            body: { conversationNumber: activeSampleNumber },
        }),
        onFinish: ({ message, finishReason }) => {
            const messageText = getMessageText(message);
            const hasFinishTool = message.parts?.some((part) => isFinishSurveyPart(part));
            if (hasSurveyCompletionText(messageText) || finishReason === 'tool-calls' || hasFinishTool) {
                toast.success(t("Toasts.Finished"));
            }
        }
    });
    const messagesRef = useRef(messages);

    const appendMessage = (nextMessage: SampleReviewMessage) => {
        const currentMessages = messagesRef.current;
        const lastMsg = currentMessages[currentMessages.length - 1];
        const lastText = lastMsg?.parts?.find(
            (part) => part.type === "text" && "text" in part,
        )?.text;
        const nextText = nextMessage.parts.find(
            (part) => part.type === "text" && "text" in part,
        )?.text;

        if (lastText === nextText && lastMsg?.role === nextMessage.role) {
            return;
        }

        setMessages([...currentMessages, nextMessage]);
    };

    // Sync historyData with useChat messages when it finishes loading
    useEffect(() => {
        if (!isHistoryLoading && historyData?.messages) {
            if (messages.length === 0 && historyData.messages.length > 0) {
                setMessages(normalizeSampleHistoryMessages(historyData.messages));
            }
        }
    }, [isHistoryLoading, historyData, setMessages, messages.length]);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    // Clean up SURVEY_COMPLETED tags and track completion
    const isCompleted =
        historyData?.completed === true ||
        messages.some(msg =>
            msg.role === "assistant" && (
                hasSurveyCompletionText(getMessageText(msg)) ||
                msg.parts?.some(isFinishSurveyPart)
            )
        );

    const isSimulating = status === "streaming" || status === "submitted";

    const visibleMessages = messages.map(msg => {
        const textPart = msg.parts?.find(p => p.type === 'text');
        const hasCompletionTag = msg.role === "assistant" && textPart && hasSurveyCompletionText(textPart.text);
        const hasCompletionTool =
            msg.role === "assistant" && msg.parts?.some(isFinishSurveyPart);

        if (hasCompletionTag || hasCompletionTool) {
            return {
                ...msg,
                parts: msg.parts.map(p => {
                    if (p.type === 'text') {
                        return { ...p, text: stripSurveyCompletionTag(p.text) };
                    }
                    return p;
                })
            };
        }
        return msg;
    }).filter(m => {
        const text = m.parts?.find(p => p.type === 'text')?.text || "";
        const isInternalPing = text.includes("Start the conversation now") || text.includes("The user has returned to this sample");
        const hasVisibleContent = m.parts?.some(p => 
            (p.type === 'text' && p.text.trim()) || 
            p.type === 'dynamic-tool' ||
            p.type.startsWith('tool-') ||
            p.type === 'tool-invocation' || 
            p.type === 'tool-call' ||
            p.type === 'tool-result'
        );
        return !isInternalPing && Boolean(hasVisibleContent);
    });

    // WebSocket Hook for Voice Conversation
    const voiceWs = useVoiceWebSocket({
        url: `${clientEnv.NEXT_PUBLIC_WEBSOCKET_URL}/voice/sample-conversation?surveyId=${surveyId}&conversationNumber=${activeSampleNumber}`,
        onReady: () => {
        },
        onMessage: (data) => {
            if (data.type === "conversation_text") {
                const { role, content } = data;
                if (!isConversationRole(role || "") || typeof content !== "string") {
                    return;
                }
                const normalizedRole = role === "user" ? "user" : "assistant";

                // Filter out internal thinking/directives
                if (content && (content.includes("<thinking>") || content.includes("Internal instructions:"))) {
                    return;
                }

                appendMessage({
                    id: `voice-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                    role: normalizedRole,
                    parts: [{ type: 'text', text: content }],
                    createdAt: new Date()
                });
            } else if (data.type === "audio_sent" || data.type === "text_response") {
                if (!data.text) return;
                appendMessage({
                    id: `legacy-${Date.now()}`,
                    role: "assistant",
                    parts: [{ type: 'text', text: data.text }],
                    createdAt: new Date()
                });
            } else if (data.type === "transcription" && data.isFinal) {
                // DUAL-AGENT BUG FIX: No longer calling sendMessage() here
            } else if (data.type === 'display_media') {
                const surveyMedia = normalizeSurveyMedia(survey?.media);
                if (surveyMedia.length > 0) {
                    const fullMedia = surveyMedia.find((media) => media.id === data.media?.id);
                    if (fullMedia) {
                        appendMessage({
                            id: `media-${Date.now()}`,
                            role: "assistant",
                            parts: [
                                { type: 'text', text: "Shared media" },
                                {
                                    type: 'tool-showMedia' as const,
                                    toolCallId: `show-media-${Date.now()}`,
                                    state: 'output-available' as const,
                                    input: {},
                                    output: { media: fullMedia },
                                },
                            ],
                            createdAt: new Date(),
                        });
                    }
                }
            }
        }
    });

    // Auto-greeting mutation is replaced by useChat use effect
    const historyMessages = normalizeSampleHistoryMessages(historyData?.messages ?? []);

    // Reset hasAutoGreeted when sample number changes
    useEffect(() => {
        setHasAutoGreeted(false);
        isHandlingGreetingRef.current = false;
    }, [activeSampleNumber]);

    // Auto-greeting trigger
    useEffect(() => {
        if (!survey || hasAutoGreeted || isHandlingGreetingRef.current) return;
        if (isHistoryLoading) return;

        // For voice surveys, we wait for hasStarted (user clicked through the overlay)
        if (survey.isVoice && !hasStarted) return;

        if (survey.isVoice) {
            void voiceWs.connect();
            setHasAutoGreeted(true);
            isHandlingGreetingRef.current = true;
        } else if (status === "ready") {
            const hasExistingHistory = historyData?.messages && historyData.messages.length > 0;
            const lastHistoryMessage = hasExistingHistory
                ? historyMessages[historyMessages.length - 1]
                : null;
            const lastMessage = messages[messages.length - 1] || lastHistoryMessage;
            const isNew = !hasExistingHistory && messages.length === 0;
            const userSpokeLast = lastMessage?.role === "user";

            if (isNew || userSpokeLast) {
                isHandlingGreetingRef.current = true;
                setHasAutoGreeted(true);
                void sendMessage({
                    text: isNew
                        ? "Start the conversation now. Greet the participant according to the system prompt instructions."
                        : "The user has returned to this sample survey review. Respond to their last input and continue the interview naturally."
                }).catch(() => {
                    isHandlingGreetingRef.current = false;
                    setHasAutoGreeted(false);
                });
            }
        }
    }, [survey, hasAutoGreeted, isHistoryLoading, hasStarted, status, sendMessage, voiceWs, messages, historyData, surveyId, historyMessages]);

    // Initialize inputMode based on survey type
    useEffect(() => {
        if (survey?.isVoice) {
            setInputMode("voice");
            setShowTranscript(false);
        } else {
            setInputMode("text");
            setShowTranscript(true);
        }
    }, [survey?.isVoice]);

    const handleTextSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (!textInput.trim() || isSimulating || isCompleted) return;

        const currentInput = textInput.trim();
        setTextInput('');

        void sendMessage({
                text: currentInput
            }).catch((error) => {
                console.error("[handleTextSubmit] Failed:", error);
                toast.error(t("Toasts.ResponseFailed"));
            });
    };

    // Opens the new publish modal and populates current title/desc
    const handleConfirm = () => {
        setPublishTitle(survey?.title || "");
        setPublishDescription(survey?.description || survey?.brief?.learningContext || "");
        setIsPublishModalOpen(true);
    };

    // Actually perform the network request from the modal
    const submitPublish = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();

        setIsConfirming(true);
        try {
            const finalTitle = publishTitle.trim() || survey?.title;
            const finalDesc = publishDescription.trim();
            const result = await publishSurveyAction({
                surveyId,
                title: finalTitle,
                description: finalDesc,
            });

            if (result.success) {
                toast.success(t("Toasts.Confirmed"));
                setIsPublishModalOpen(false);

                // Optimistically update the query cache so the destination page doesn't flash the old State & "sample_review" button
                queryClient.setQueryData(queryKeys.surveys.all(), (oldData: { surveys: Array<{ id: string; status: string }> } | undefined) => {
                    if (!oldData || !oldData.surveys) return oldData;
                    return {
                        ...oldData,
                        surveys: oldData.surveys.map(s => s.id === surveyId ? { ...s, status: 'active' } : s)
                    };
                });

                queryClient.setQueryData(queryKeys.surveys.detail(surveyId), (oldData: { survey: { id: string; status: string; title: string; description: string } } | undefined) => {
                    if (!oldData || !oldData.survey) return oldData;
                    return {
                        ...oldData,
                        survey: {
                            ...oldData.survey,
                            status: "active",
                            title: finalTitle || "",
                            description: finalDesc
                        }
                    };
                });

                // Invalidate the query entirely so an actual fresh background fetch begins as well
                void queryClient.invalidateQueries({ queryKey: queryKeys.surveys.detail(surveyId) });

                router.push(`/dashboard/surveys/${surveyId}`);
            } else {
                toast.error(getFriendlyActionError(result.error, t("Toasts.ConfirmFailed")));
            }
        } catch (error) {
            console.error("[submitPublish] Failed:", error);
            toast.error(error instanceof Error ? error.message : t("Toasts.ConfirmFailed"));
        } finally {
            setIsConfirming(false);
        }
    };

    if (isLoading) {
        return (
            <div className="h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
        );
    }

    const handleStartSample = () => {
        setHasStarted(true);
    };

    return (
        <div className="flex flex-row h-[calc(100vh-6.5rem)] lg:h-[calc(100vh-7.5rem)] bg-white overflow-hidden relative rounded-2xl border border-gray-100 shadow-sm">

            {/* Start Overlay for Voice Samples */}
            {survey?.isVoice && !hasStarted && !isLoading && (
                <SurveyStartOverlay
                    onStart={handleStartSample}
                    initialLanguage={survey?.language || "en"}
                    title={survey?.title || "Sample Review"}
                    description={survey?.brief?.learningContext || "Experience your survey exactly as a participant will."}
                    isVoice={survey?.isVoice}
                    translations={{
                        selectLanguage: t("selectLanguage"),
                        micPermissionDenied: t("micPermissionDenied"),
                        micConsentTitle: t("micConsentTitle"),
                        micConsentDescription: t("micConsentDescription"),
                        initializing: t("initializing"),
                        startInterview: t("startInterview"),
                    }}
                />
            )}

            {/* Main Application Area (Left/Center) */}
            <div className="flex-1 flex flex-col min-w-0 bg-white relative">

                {/* Header */}
                <header className="bg-white border-b border-gray-100 px-4 sm:px-6 py-3 z-[1] flex-shrink-0">
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
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">
                                        Sample Review
                                    </span>
                                    {sampleConversationCount > 0 && (
                                        <div className="flex items-center gap-1 ml-1 border-l border-gray-200 pl-2">
                                            {Array.from({ length: sampleConversationCount + (canRetry ? 1 : 0) }).map((_, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => setSelectedSampleNumber(i + 1)}
                                                    className={cn(
                                                        "w-5 h-5 rounded-md text-[9px] font-bold transition-all",
                                                        activeSampleNumber === i + 1
                                                            ? "bg-gray-900 text-white"
                                                            : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                                                    )}
                                                >
                                                    {i + 1}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
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
                                <span>{t("Actions.Publish")}</span>
                            </button>
                        </div>
                    </div>
                </header>

                {/* Chat Area Container */}
                <div className="flex-1 flex flex-col min-h-0 bg-white relative">
                    {inputMode === "voice" && (
                        <div className="flex-shrink-0 flex flex-col items-center justify-center p-4 border-b border-gray-50 bg-slate-50/50 z-[2]">
                            <button
                                onClick={() => {
                                    if (isCompleted) return;
                                    if (voiceWs.status !== "connected") {
                                        void voiceWs.connect();
                                    } else if (voiceWs.isRecording) {
                                        voiceWs.stopRecording();
                                    } else {
                                        void voiceWs.startRecording();
                                    }
                                }}
                                className="group focus:outline-none transition-transform active:scale-95 my-2"
                                disabled={isCompleted}
                            >
                                <VisualizerRing
                                    isRecording={voiceWs.isRecording}
                                    isAgentSpeaking={voiceWs.isPlaying}
                                    size="normal"
                                    status={voiceWs.status}
                                />
                            </button>

                            <div className="text-center animate-in fade-in slide-in-from-top-2 duration-500">
                                <p className="text-xs font-medium text-gray-900">
                                    {voiceWs.isRecording ? t("VoiceVisualizer.Listening") : voiceWs.isPlaying ? t("VoiceVisualizer.AISpeaking") : t("VoiceVisualizer.TapToSpeak")}
                                </p>
                            </div>
                        </div>
                    )}

                    <SampleReviewMessageList
                        messages={visibleMessages}
                        inputMode={inputMode}
                        isLoading={isLoading}
                        messagesEndRef={messagesEndRef}
                        t={t}
                    />

                    {/* Input Area */}
                    <div className="p-4 bg-white border-t border-gray-50/50">
                        <div className="max-w-2xl mx-auto w-full relative">
                            {/* Transcript Toggle for Voice Surveys */}
                            {survey?.isVoice && (
                                <div className="absolute -top-14 left-1/2 -translate-x-1/2 flex items-center gap-1 p-1 bg-white border border-gray-100 shadow-sm rounded-full">
                                    <button
                                        onClick={() => setShowTranscript(!showTranscript)}
                                        className={cn(
                                            "px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5",
                                            showTranscript
                                                ? "bg-gray-100 text-gray-900"
                                                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                                        )}
                                    >
                                        <MessageSquare className="w-3 h-3" /> Transcript
                                    </button>
                                </div>
                            )}

                            {inputMode === "voice" ? (
                                <div className="flex flex-col items-center justify-center space-y-3 pb-2 pt-2">
                                    <button
                                        onClick={() => {
                                            if (isCompleted) return;
                                            if (voiceWs.status !== "connected") {
                                        void voiceWs.connect();
                                    } else if (voiceWs.isRecording) {
                                        voiceWs.stopRecording();
                                    } else {
                                        void voiceWs.startRecording();
                                    }
                                }}
                                        className={cn(
                                            "relative w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300",
                                            voiceWs.status !== "connected" ? "bg-gray-100 text-gray-400" :
                                                voiceWs.isRecording ? "bg-red-50 text-red-600 ring-2 ring-red-100" :
                                                    "bg-black text-white hover:scale-105 shadow-md"
                                        )}
                                        disabled={isCompleted}
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

                                    {/* Live Transcription Display */}
                                    {showTranscript && (voiceWs.isRecording || voiceWs.isPlaying) && (voiceWs.transcription || voiceWs.interimTranscription) && (
                                        <div className="mt-4 bg-gray-50 border border-gray-200 rounded-2xl p-4 animate-in fade-in slide-in-from-bottom-2 duration-200 max-w-lg mx-auto">
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
                                <form onSubmit={(event) => {
                                    handleTextSubmit(event);
                                }} className="relative">
                                    <input
                                        value={textInput}
                                        onChange={(e) => setTextInput(e.target.value)}
                                        placeholder={placeholders.textInput}
                                        className="w-full pl-5 pr-12 py-3.5 bg-gray-50 border-transparent focus:border-gray-200 focus:bg-white focus:ring-4 focus:ring-gray-100 rounded-xl transition-all outline-none text-sm placeholder:text-gray-400 text-gray-900"
                                        autoFocus
                                        disabled={isSimulating || isCompleted}
                                    />
                                    <button
                                        type="submit"
                                        disabled={!textInput.trim() || isSimulating || isCompleted}
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
                            <RefinementAssistantPanel surveyId={surveyId} />
                        </>
                    )}

                </div>
            </div>
            <SamplePublishModal
                open={isPublishModalOpen}
                isConfirming={isConfirming}
                publishTitle={publishTitle}
                publishDescription={publishDescription}
                titlePlaceholder={placeholders.publishTitle}
                descriptionPlaceholder={placeholders.publishDescription}
                onClose={() => setIsPublishModalOpen(false)}
                onTitleChange={setPublishTitle}
                onDescriptionChange={setPublishDescription}
                onSubmit={(event) => {
                    void submitPublish(event);
                }}
                t={t}
            />
        </div>
    );
}

