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
    Bot,
    Send,

} from "lucide-react";
import { queryKeys } from "@/lib/query-keys";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { toast } from "react-hot-toast";
import { useAuth } from "@/components/providers/auth-provider";
import { useVoiceWebSocket } from "@/hooks/use-voice-websocket";
import { MediaDisplay } from "@/components/surveys/media-display";
import { MarkdownMessage } from "@/components/ui/markdown-message";
import { useQuery } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { useRealtime } from "@/hooks/use-realtime";
import { UIMessage } from "ai";
import { ChatMessagePart, SurveyMedia } from "@/lib/chat-types";
import { toUIMessages } from "@/lib/chat-ui-messages";
import { DefaultChatTransport } from "ai";
import { SurveyStartOverlay } from "@/components/surveys/survey-start-overlay";
import { addSampleConversationCommentAction } from "@/app/actions/sample-conversation";
import { RefinementAssistantPanel } from "@/components/surveys/refinement-assistant-panel";
import { getRehearsalCommentsAction } from "@/app/actions/collaboration";

const MAX_SAMPLE_CONVERSATIONS = 3;

type SampleReviewMessage = UIMessage & {
    media?: SurveyMedia;
    createdAt?: Date;
};

type StoredSampleMessage = {
    id?: string;
    role: string;
    content?: string;
    parts?: ChatMessagePart[];
    timestamp?: string;
};

type RehearsalComment = {
    id: string;
    body: string;
    createdAt: Date;
    author: {
        id: string;
        name: string | null;
        email: string;
    };
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isConversationRole(role: string): role is "user" | "assistant" {
    return role === "user" || role === "assistant";
}

function normalizeSampleMessage(
    message: StoredSampleMessage,
    index: number,
): SampleReviewMessage | null {
    if (!isConversationRole(message.role)) {
        return null;
    }

    const [uiMessage] = toUIMessages([{
        id: message.id || `hist-${index}-${Date.now()}`,
        role: message.role,
        content: message.content || "",
        parts: message.parts,
        timestamp: message.timestamp ?? new Date().toISOString(),
    }]);

    if (!uiMessage) {
        return null;
    }

    return {
        ...uiMessage,
        createdAt: message.timestamp ? new Date(message.timestamp) : new Date(),
    };
}

function getMessageText(message: UIMessage): string {
    return message.parts
        ?.filter((part): part is { type: "text"; text: string } => part.type === "text")
        .map((part) => part.text)
        .join("") || "";
}

function isFinishSurveyPart(part: UIMessage["parts"][number]): boolean {
    return (
        (part.type === "tool-invocation" || part.type === "tool-call") &&
        "toolName" in part &&
        part.toolName === "finishSurvey"
    );
}

function parseToolResult(value: unknown): Record<string, unknown> | null {
    if (isRecord(value)) {
        return value;
    }

    if (typeof value !== "string") {
        return null;
    }

    try {
        const parsed = JSON.parse(value);
        return isRecord(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function normalizeSurveyMedia(value: unknown): SurveyMedia[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.flatMap((item) => {
        if (!isRecord(item) || typeof item.type !== "string" || typeof item.url !== "string") {
            return [];
        }

        if (item.type !== "image" && item.type !== "audio" && item.type !== "video") {
            return [];
        }

        return [{
            type: item.type,
            url: item.url,
            id: typeof item.id === "string" ? item.id : `media-${Math.random().toString(36).substring(2, 9)}`,
            description: typeof item.description === "string" ? item.description : undefined,
            mimeType: typeof item.mimeType === "string" ? item.mimeType : undefined,
        }];
    });
}

function getMediaFromMessagePart(part: UIMessage["parts"][number]): SurveyMedia | null {
    if ((part.type === "tool-invocation" || part.type === "tool-call") && "toolName" in part && part.toolName === "showMedia") {
        const result = parseToolResult("result" in part ? part.result : undefined);
        const media = result?.media;
        return normalizeSurveyMedia(media ? [media] : [])[0] ?? null;
    }

    return null;
}

const VisualizerRing = ({ isRecording, isAgentSpeaking, size = "normal", status }: { isRecording: boolean; isAgentSpeaking: boolean; size?: "normal" | "large"; status: string }) => (
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
            status === "error"
                ? "bg-red-500 shadow-red-500/50"
                : isAgentSpeaking
                    ? "bg-gradient-to-br from-emerald-500 to-teal-600 scale-110 shadow-emerald-500/30"
                    : isRecording
                        ? "bg-gradient-to-br from-indigo-600 to-violet-600 scale-110 shadow-indigo-500/50"
                        : "bg-gray-900 shadow-xl hover:scale-105",
            size === "large" ? "w-32 h-32" : "w-14 h-14"
        )}>
            {status === "error" ? (
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

export default function SampleReviewPage() {
    const params = useParams();
    const router = useRouter();
    const queryClient = useQueryClient();
    const { session } = useAuth();
    const surveyId =
        typeof params.surveyId === "string" ? params.surveyId : "";
    const t = useTranslations("Survey.SampleReview");

    const [isConfirming, setIsConfirming] = useState(false);
    const [inputMode, setInputMode] = useState<"voice" | "text">("text");
    const [textInput, setTextInput] = useState("");
    const [hasAutoGreeted, setHasAutoGreeted] = useState(false);
    const [hasStarted, setHasStarted] = useState(false);
    const [commentText, setCommentText] = useState("");
    const [isCommenting, setIsCommenting] = useState(false);
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
        const translatePlaceholders = async () => {
            try {
                const [textInput, pTitle, pDesc] = await Promise.all([
                    Promise.resolve(t("Input.Placeholder")),
                    Promise.resolve("e.g. Q3 Customer Satisfaction"),
                    Promise.resolve("Briefly describe the purpose of this survey...")
                ]);
                setPlaceholders({
                    textInput,
                    publishTitle: pTitle,
                    publishDescription: pDesc
                });
            } catch (error) {
                console.error("[translatePlaceholders] Failed:", error);
            }
        };
        translatePlaceholders();
    }, [t]);


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
    const activeSampleNumber = selectedSampleNumber || currentSampleNumber;
    const samplesRemaining = MAX_SAMPLE_CONVERSATIONS - (survey?.sampleConversationCount || 0);
    const canRetry = samplesRemaining > 0;

    const isOwnerOrEditor = Boolean(survey?.permission?.canEdit);

    // A workspace context exists if the current session is in a workspace
    // OR the survey itself belongs to an organization.
    const isWorkspaceContext =
        Boolean(survey?.organizationId) &&
        (session?.activeOrganizationId || null) === (survey?.organizationId || null);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    const { data: historyData, isLoading: isHistoryLoading } = useQuery({
        queryKey: ['sample-history', surveyId, activeSampleNumber],
        queryFn: async () => {
            const response = await fetch(`/api/surveys/${surveyId}/sample?conversationNumber=${activeSampleNumber}`);
            if (!response.ok) return { messages: [] };
            return response.json();
        },
        enabled: !!surveyId,
    });

    const { data: rehearsalComments = [], refetch: refetchComments } = useQuery<RehearsalComment[]>({
        queryKey: ['sample-comments', surveyId, activeSampleNumber],
        queryFn: async () => {
            const result = await getRehearsalCommentsAction(surveyId, activeSampleNumber);
            if (!result.success) return [];
            return result.data;
        },
        enabled: !!surveyId && isWorkspaceContext,
    });

    useRealtime({
        channels: surveyId && isWorkspaceContext ? [`survey:${surveyId}`] : [],
        onEvent: async (baseEvent) => {
            const event = baseEvent;
            if (event.eventType === "survey.comment_added") {
                refetchComments();
            }
            if (event.eventType === "survey.rehearsal_turn_added") {
                const payload = event.payload as Record<string, unknown> | undefined;
                if (payload?.conversationNumber === activeSampleNumber) {
                    const response = await fetch(`/api/surveys/${surveyId}/sample?conversationNumber=${activeSampleNumber}`, {
                        cache: "no-store",
                    });
                    if (response.ok) {
                        const data = await response.json();
                        setMessages(
                            (Array.isArray(data.messages) ? data.messages : []).flatMap(
                                (message: StoredSampleMessage, index: number) => {
                                    const normalizedMessage = normalizeSampleMessage(message, index);
                                    return normalizedMessage ? [normalizedMessage] : [];
                                },
                            ),
                        );
                    }
                }
                queryClient.invalidateQueries({ queryKey: ['sample-history', surveyId, activeSampleNumber] });
            }
            if (event.eventType === "survey.published") {
                refetchSurvey();
            }
        },
    });

    const { messages, setMessages, sendMessage, status } = useChat({
        id: `sample-${activeSampleNumber}`,
        messages: historyData?.messages || [],
        transport: new DefaultChatTransport({
            api: `/api/surveys/${surveyId}/sample`,
            body: { conversationNumber: activeSampleNumber },
        }),
        onFinish: ({ message, finishReason }) => {
            const messageText = getMessageText(message);
            const hasFinishTool = message.parts?.some((part) => isFinishSurveyPart(part));
            if (messageText.includes("[[SURVEY_COMPLETED]]") || finishReason === 'tool-calls' || hasFinishTool) {
                toast.success(t("Toasts.Finished"));
            }
        }
    });

    // Sync historyData with useChat messages when it finishes loading
    useEffect(() => {
        if (!isHistoryLoading && historyData?.messages) {
            if (messages.length === 0 && historyData.messages.length > 0) {
                setMessages(
                    historyData.messages.flatMap((message: StoredSampleMessage, index: number) => {
                        const normalizedMessage = normalizeSampleMessage(message, index);
                        return normalizedMessage ? [normalizedMessage] : [];
                    }),
                );
            }
        }
    }, [isHistoryLoading, historyData, setMessages, messages.length]);

    useEffect(() => {
    }, [status, messages.length]);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Clean up SURVEY_COMPLETED tags and track completion
    const isCompleted = messages.some(msg =>
        msg.role === "assistant" && (
            msg.parts?.some(p => p.type === 'text' && p.text.includes("[[SURVEY_COMPLETED]]")) ||
            msg.parts?.some(isFinishSurveyPart)
        )
    );

    const isSimulating = status === "streaming" || status === "submitted";

    const visibleMessages = messages.map(msg => {
        const textPart = msg.parts?.find(p => p.type === 'text');
        const hasCompletionTag = msg.role === "assistant" && textPart && textPart.text.includes("[[SURVEY_COMPLETED]]");
        const hasCompletionTool =
            msg.role === "assistant" && msg.parts?.some(isFinishSurveyPart);

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
    }).filter(m => {
        const text = m.parts?.find(p => p.type === 'text')?.text || "";
        const isInternalPing = text.includes("Start the conversation now") || text.includes("The user has returned to this sample");
        const hasVisibleContent = m.parts?.some(p => 
            (p.type === 'text' && p.text.trim()) || 
            p.type === 'tool-invocation' || 
            p.type === 'tool-call'
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

                // Filter out internal thinking/directives
                if (content && (content.includes("<thinking>") || content.includes("Internal instructions:"))) {
                    return;
                }

                setMessages(prev => {
                    // Avoid duplicate messages if the same text was already transcribed or sent
                    const lastMsg = prev[prev.length - 1];
                    const lastText = lastMsg?.parts?.find(p => p.type === 'text' && "text" in p)?.text;
                    if (lastText === content && lastMsg?.role === role) return prev;

                    if (!isConversationRole(role || "")) {
                        return prev;
                    }

                    const nextMessage: SampleReviewMessage = {
                        id: `voice-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                        role: role as "user" | "assistant",
                        parts: [{ type: 'text', text: typeof content === 'string' ? content : "" }],
                        createdAt: new Date()
                    };

                    return [...prev, nextMessage];
                });
            } else if (data.type === "audio_sent" || data.type === "text_response") {
                if (!data.text) return;
                const nextMessage: SampleReviewMessage = {
                    id: `legacy-${Date.now()}`,
                    role: "assistant",
                    parts: [{ type: 'text', text: data.text }],
                    createdAt: new Date()
                };
                setMessages(prev => [...prev, nextMessage]);
            } else if (data.type === "transcription" && data.isFinal) {
                // DUAL-AGENT BUG FIX: No longer calling sendMessage() here
            } else if (data.type === 'display_media') {
                const surveyMedia = normalizeSurveyMedia(survey?.media);
                if (surveyMedia.length > 0) {
                    const fullMedia = surveyMedia.find((media) => media.id === data.media?.id);
                    if (fullMedia) {
                        const mediaMessage: SampleReviewMessage = {
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
                        };
                        setMessages(prev => [...prev, mediaMessage]);
                    }
                }
            }
        }
    });

    // Auto-greeting mutation is replaced by useChat use effect

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
            voiceWs.connect();
            setHasAutoGreeted(true);
            isHandlingGreetingRef.current = true;
        } else if (status === "ready") {
            const hasExistingHistory = historyData?.messages && historyData.messages.length > 0;
            const lastMessage = messages[messages.length - 1] || (hasExistingHistory ? historyData.messages[historyData.messages.length - 1] : null);
            const isNew = !hasExistingHistory && messages.length === 0;
            const userSpokeLast = lastMessage?.role === "user";

            if (isNew || userSpokeLast) {
                isHandlingGreetingRef.current = true;
                
                sendMessage({
                    text: isNew
                        ? "Start the conversation now. Greet the participant according to the system prompt instructions."
                        : "The user has returned to this sample survey review. Respond to their last input and continue the interview naturally."
                }).then(() => {
                    setHasAutoGreeted(true);
                }).catch(() => {
                    isHandlingGreetingRef.current = false;
                });
            }
        }
    }, [survey, hasAutoGreeted, isHistoryLoading, hasStarted, status, sendMessage, voiceWs, messages, historyData, surveyId]);

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

    const handleTextSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!textInput.trim() || isSimulating || isCompleted) return;

        const currentInput = textInput.trim();
        setTextInput('');

        try {
            sendMessage({
                text: currentInput
            });
        } catch (error) {
            console.error("[handleTextSubmit] Failed:", error);
            toast.error(t("Toasts.ResponseFailed"));
        }
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
            const response = await fetch(`/api/surveys/${surveyId}/publish`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: finalTitle,
                    description: finalDesc
                }),
            });

            if (response.ok) {
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
                queryClient.invalidateQueries({ queryKey: queryKeys.surveys.detail(surveyId) });

                router.push(`/dashboard/surveys/${surveyId}`);
            } else {
                toast.error(t("Toasts.ConfirmFailed"));
            }
        } catch (error) {
            console.error("[submitPublish] Failed:", error);
            toast.error(t("Toasts.ConfirmFailed"));
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
                activeSampleNumber,
                commentText
            );

            if (result.success) {
                toast.success("Comment added");
                setCommentText("");
                refetchSurvey();
                refetchComments();
            } else {
                toast.error(result.error);
            }
        } catch (error) {
            console.error("[handleAddComment] Failed:", error);
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
                                    {survey?.sampleConversationCount > 0 && (
                                        <div className="flex items-center gap-1 ml-1 border-l border-gray-200 pl-2">
                                            {[...Array(survey.sampleConversationCount + (canRetry ? 1 : 0))].map((_, i) => (
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

                    {/* Messages Scroll Area */}
                    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-6 scrollbar-thumb-gray-200 scrollbar-track-transparent">
                        {messages.length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center text-center space-y-6 opacity-40 py-20">
                                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center">
                                    <Bot className="w-8 h-8 text-gray-400" />
                                </div>
                                <div className="space-y-2 max-w-xs">
                                    <p className="text-sm font-medium text-gray-900">Experience your survey</p>
                                    <p className="text-xs text-gray-500">
                                        {inputMode === "voice"
                                            ? "Speak naturally to the AI researcher to test the conversation flow."
                                            : "Type your responses below to see how the AI handles different scenarios."}
                                    </p>
                                </div>
                            </div>
                        )}

                        {visibleMessages.map((msg) => (
                            <div key={msg.id} className={cn("flex flex-col gap-2 max-w-[85%]", msg.role === "user" ? "self-end items-end" : "self-start items-start")}>
                                <div className={cn(
                                    "px-5 py-3 rounded-2xl text-[15px] leading-relaxed shadow-sm",
                                    msg.role === "assistant"
                                        ? "bg-gray-50 text-gray-800 rounded-tl-sm border border-gray-100"
                                        : "bg-black text-white rounded-tr-sm"
                                )}>
                                    {msg.parts?.map((part, index: number) => {
                                        if (part.type === 'text') {
                                            return <MarkdownMessage key={index} content={part.text} />;
                                        }
                                        if ((part.type === 'tool-invocation' || part.type === 'tool-call') && 'toolName' in part) {
                                            if (part.toolName === 'showMedia') {
                                                const media = getMediaFromMessagePart(part);
                                                return media ? <MediaDisplay key={part.toolCallId || index} media={media} /> : null;
                                            }
                                            if (part.toolName === 'finishSurvey') {
                                                return (
                                                    <div key={part.toolCallId || index} className="flex flex-col gap-2 mt-2">
                                                        <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100">
                                                            <CheckCircle className="w-3.5 h-3.5" />
                                                            {t("Toasts.Finished")}
                                                        </div>
                                                        <p className="text-[11px] text-gray-500 italic pl-1">
                                                            You can now provide feedback in the sidebar to refine future simulations.
                                                        </p>
                                                    </div>
                                                );
                                            }
                                        }
                                        return null;
                                    })}
                                </div>
                            </div>
                        ))}

                        {isLoading && (
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
                                {rehearsalComments.length === 0 ? (
                                    <div className="text-sm text-gray-500 italic p-4 bg-white rounded-xl border border-gray-100 shadow-sm text-center">
                                        Comments are saved for your team to review.
                                    </div>
                                ) : (
                                    rehearsalComments.map((comment) => (
                                        <div key={comment.id} className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
                                            <div className="mb-1 flex items-center justify-between gap-3">
                                                <span className="text-xs font-semibold text-gray-900">
                                                    {comment.author?.name || comment.author?.email || "Workspace member"}
                                                </span>
                                                <span className="text-[11px] text-gray-400">
                                                    {new Date(comment.createdAt).toLocaleString()}
                                                </span>
                                            </div>
                                            <p className="text-sm text-gray-700 whitespace-pre-wrap">{comment.body}</p>
                                        </div>
                                    ))
                                )}
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
                                    Post Comment
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
                                <h2 className="text-xl font-semibold text-gray-900">{t("Actions.Publish")}</h2>
                                <p className="text-sm text-gray-500 mt-1">
                                    Review your survey&apos;s details before making it live and shareable.
                                </p>
                            </div>

                            <form onSubmit={submitPublish} className="p-6 space-y-5">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700">
                                        Survey Title
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
                                        Description <span className="text-gray-400 font-normal">(Optional)</span>
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
                                        {t("ConfirmDialog.Cancel")}
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={!publishTitle.trim() || isConfirming}
                                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 text-white font-medium text-sm rounded-xl hover:bg-black transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isConfirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                        {t("ConfirmDialog.Confirm")}
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

