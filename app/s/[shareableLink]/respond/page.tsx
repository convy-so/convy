"use client";

import { clientEnv } from "@/lib/env.client";

import { useState, useRef, useEffect } from "react";
import { useParams } from "next/navigation";
import { Mic, MicOff, CheckCircle, AlertCircle, Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVoiceWebSocket } from "@/hooks/use-voice-websocket";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, UIMessage } from "ai";
import { MediaDisplay } from "@/components/surveys/media-display";
import { useQuery } from "@tanstack/react-query";

interface Survey {
    id: string;
    title: string;
    objective?: { description?: string };
    targetAudience?: { description?: string };
    tone?: string;
    isVoice?: boolean;
    media?: any[];
}

interface InitialGreeting {
    role: "assistant";
    content: string;
    timestamp: string;
}

interface SurveyInitResponse {
    survey: Survey;
    conversationId: string;
    participantId: string;
    initialGreeting: InitialGreeting;
}

interface MessageWithTools {
    id: string;
    role: "assistant" | "user";
    parts: { type: "text"; text: string }[];
    content?: string;
    media?: any;
    toolInvocations?: Array<{
        toolCallId: string;
        toolName: string;
        state: "partial-call" | "call" | "result";
        args?: any;
        result?: any;
    }>;
}

async function initializeSurvey(shareableLink: string): Promise<SurveyInitResponse> {
    const response = await fetch(`/api/surveys/respond/${shareableLink}`);
    
    if (!response.ok) {
        if (response.status === 404) {
            throw new Error("Survey not found");
        } else if (response.status === 403) {
            const data = await response.json();
            throw new Error(data.error || "This survey is no longer accepting responses");
        } else {
            throw new Error("Failed to load survey");
        }
    }
    
    return response.json();
}

export default function SurveyRespondPage() {
    const params = useParams();
    const shareableLink = params.shareableLink as string;

    const { 
        data: initData, 
        isLoading: isInitializing, 
        error: initError 
    } = useQuery({
        queryKey: ['survey-respond', shareableLink],
        queryFn: () => initializeSurvey(shareableLink),
        enabled: !!shareableLink,
        staleTime: Infinity, 
        retry: false, 
    });
    
    const survey = initData?.survey ?? null;
    const conversationId = initData?.conversationId ?? null;
    const initialGreeting = initData?.initialGreeting ?? null;
    const apiEndpoint = `/api/surveys/respond/${shareableLink}`;

    // State declarations - must be before hooks that reference them
    const [input, setInput] = useState("");
    const [isCompleted, setIsCompleted] = useState(false);
    const [isVoiceMode, setIsVoiceMode] = useState(false);
    const [showTranscript, setShowTranscript] = useState(true);

    // useChat hook - only meaningful after initialization (AI SDK v6)
    const { messages, setMessages: originalSetMessages, status, sendMessage } = useChat({
        id: conversationId ?? "pending",
        transport: new DefaultChatTransport({
            api: apiEndpoint,
            body: { conversationId },
        }),
        messages: initialGreeting ? [{
            id: "greeting-" + Date.now(),
            role: "assistant" as const,
            parts: [{ type: 'text', text: initialGreeting.content }],
        }] : [],
        onFinish: ({ message }: { message: UIMessage }) => {
            // Check for explicit tool calls (robust detection)
            const hasToolCompletion = (message as MessageWithTools).toolInvocations?.some(
                (tool) => tool.toolName === 'finishSurvey'
            );

            // Fallback to text detection
            const messageText = message.parts
                ?.filter((part: any) => part.type === 'text')
                .map((part: any) => part.text)
                .join(' ')
                .toLowerCase() || "";
            
            const hasTextCompletion = messageText.includes("thank you for completing") ||
                messageText.includes("survey is now complete");

            if (hasToolCompletion || hasTextCompletion) {
                setIsCompleted(true);
            }
        },
    });



    
    // Safety check: Watch messages for any missed completion signals
    useEffect(() => {
        if (isCompleted) return;

        const lastMessage = messages[messages.length - 1] as MessageWithTools;
        if (!lastMessage || lastMessage.role !== 'assistant') return;

        const hasToolCompletion = lastMessage.toolInvocations?.some(
            (tool) => tool.toolName === 'finishSurvey'
        );

        if (hasToolCompletion) {
            setIsCompleted(true);
        }
    }, [messages, isCompleted]);

    const setMessages = originalSetMessages;
    const isChatLoading = status === "streaming" || status === "submitted";

    // Voice WebSocket Integration
    const voiceWs = useVoiceWebSocket({
        url: `${clientEnv.NEXT_PUBLIC_WEBSOCKET_URL}/voice/survey-response?surveyId=${shareableLink}`,
        onMessage: (data) => {
            if (data.type === "audio_sent" || data.type === "text_response") {
                const assistantMessage = {
                    id: Date.now().toString(),
                    role: "assistant" as const,
                    parts: [{ type: 'text' as const, text: data.text }],
                };
                setMessages((prev) => [...prev, assistantMessage]);

                if (data.text.toLowerCase().includes("thank you for completing") ||
                    data.text.toLowerCase().includes("survey is now complete")) {
                    setIsCompleted(true);
                }
            } else if (data.type === "transcription" && data.isFinal) {
                // Don't send messages if survey is completed
                if (isCompleted) return;
                
                // In AI SDK v6, user messages should be sent via sendMessage, not added directly
                // This will properly handle the message flow through the chat system
                if (data.text && data.text.trim()) {
                    sendMessage({ text: data.text });
                }
            } else if (data.type === 'display_media' && survey?.media) {
                const fullMedia = survey.media.find((m: any) => m.id === data.media.id);
                if (fullMedia) {
                    setMessages((prev) => [...prev, {
                        id: Date.now().toString(),
                        role: "assistant" as const,
                        parts: [{ type: 'text' as const, text: "Shared media" }],
                        media: fullMedia
                    }]);
                }
            } else if (data.type === "survey_completed") {
                setIsCompleted(true);
                // Disconnect voice immediately to stop recording
                setIsVoiceMode(false);
                voiceWs.disconnect();
            }
        }
    });

    // Auto-enable voice mode if survey is voice-based
    useEffect(() => {
        if (survey?.isVoice && !isVoiceMode) {
            setIsVoiceMode(true);
            setShowTranscript(false);
            voiceWs.connect();
        }
    }, [survey?.isVoice]);

    const toggleVoiceMode = () => {
        const newMode = !isVoiceMode;
        setIsVoiceMode(newMode);
        if (newMode) {
            voiceWs.connect();
        } else {
            voiceWs.disconnect();
        }
    };

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Manual handleSubmit
    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) {
            e.preventDefault();
        }
        
        // Prevent sending messages after survey completion
        if (isCompleted) return;
        
        if (!input.trim() || isChatLoading || !conversationId) return;

        const currentInput = input;
        setInput("");

        try {
            // AI SDK v6: sendMessage expects an object with text property
            await sendMessage({ text: currentInput });
        } catch (error) {
            console.error("Failed to send message:", error);
        }
    };

    // Loading state
    if (isInitializing) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="relative">
                        <div className="w-12 h-12 rounded-full border-4 border-gray-100" />
                        <div className="absolute inset-0 rounded-full border-4 border-gray-900 border-t-transparent animate-spin" />
                    </div>
                    <p className="text-gray-500 font-medium animate-pulse">Preparing your survey...</p>
                </div>
            </div>
        );
    }

    // Error state
    if (initError) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl shadow-xl p-10 max-w-md w-full text-center border border-gray-100">
                    <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                        <AlertCircle className="w-10 h-10 text-red-500" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-3">
                        {initError instanceof Error ? initError.message : "Failed to load survey"}
                    </h1>
                    <p className="text-gray-500 text-lg">Please check the link and try again.</p>
                </div>
            </div>
        );
    }

    // Completed state
    if (isCompleted) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center p-4 relative overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-gray-50 via-white to-white" />
                <div className="relative bg-white/80 backdrop-blur-xl rounded-[2rem] shadow-2xl p-12 max-w-lg w-full text-center border border-white/20 ring-1 ring-gray-900/5">
                    <div className="w-24 h-24 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-8 shadow-lg shadow-emerald-500/20">
                        <CheckCircle className="w-12 h-12 text-white" />
                    </div>
                    <h1 className="text-4xl font-bold text-gray-900 mb-4 tracking-tight">Thank You!</h1>
                    <p className="text-xl text-gray-500 mb-10 leading-relaxed font-light">
                        Your insights are incredibly valuable. We appreciate you taking the time to share your thoughts with us.
                    </p>
                    <button
                        onClick={() => window.close()}
                        className="px-8 py-4 bg-gray-900 text-white rounded-2xl font-semibold hover:bg-gray-800 transition-all hover:shadow-xl hover:-translate-y-1 active:scale-95 w-full"
                    >
                        Close Survey
                    </button>
                </div>
            </div>
        );
    }

    // Premium UI Components
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
                size === "large" ? "w-32 h-32" : "w-20 h-20"
            )}>
                {isRecording ? (
                    <MicOff className={cn("text-white", size === "large" ? "w-12 h-12" : "w-8 h-8")} />
                ) : (
                    <Mic className={cn("text-white", size === "large" ? "w-12 h-12" : "w-8 h-8")} />
                )}
            </div>
        </div>
    );

    // Main UI Render
    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 font-sans selection:bg-gray-900 selection:text-white">
            {/* Main Card */}
            <div className="w-full max-w-5xl h-[85vh] bg-white rounded-3xl border border-gray-200 shadow-2xl flex flex-col overflow-hidden relative">
                
                {/* Header */}
                <header className="bg-white border-b border-gray-100 px-6 py-4 z-10 flex-shrink-0">
                    <div className="relative flex items-center justify-between h-14">
                        {/* Left Spacer for Balance */}
                        <div className="w-[100px]" />

                        {/* Centered Logo & Title */}
                        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-900 to-gray-700 flex items-center justify-center shadow-lg shadow-gray-900/10">
                                <img
                                    src="/logo.svg"
                                    alt="Convy Logo"
                                    width={20}
                                    height={20}
                                    className="w-5 h-5 object-contain invert"
                                />
                            </div>
                            <h1 className="font-bold text-gray-900 tracking-tight text-lg">{survey?.title}</h1>
                        </div>
                        <div className="flex items-center gap-2">
                            {isVoiceMode && (
                                <button
                                    onClick={() => setShowTranscript(!showTranscript)}
                                    className="px-4 py-2.5 rounded-full text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                                >
                                    {showTranscript ? "Hide Text" : "Show Text"}
                                </button>
                            )}
                            <button
                                onClick={toggleVoiceMode}
                                className={cn(
                                    "flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-300",
                                    isVoiceMode
                                        ? "bg-gray-900 text-white shadow-lg scale-105"
                                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                )}
                            >
                                {isVoiceMode ? (
                                    <>
                                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                                        Voice Mode
                                    </>
                                ) : (
                                    <>
                                        <Mic className="w-4 h-4" />
                                        Try Voice
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </header>

                {/* Chat Area */}
                <main className="flex-1 overflow-y-auto scroll-smooth bg-slate-50/30 relative">
                    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
                        {messages.map((message: any) => (
                            <div
                                key={message.id}
                                className={cn(
                                    "flex w-full animate-in fade-in slide-in-from-bottom-2 duration-500",
                                    message.role === "user" ? "justify-end" : "justify-start"
                                )}
                            >
                                <div
                                    className={cn(
                                        "max-w-[85%] rounded-[2rem] px-8 py-5 text-[1.05rem] leading-relaxed shadow-sm transition-all hover:shadow-md",
                                        message.role === "user"
                                            ? "bg-gray-900 text-white rounded-br-none"
                                            : "bg-white border border-gray-100 text-gray-800 rounded-bl-none shadow-sm"
                                    )}
                                >
                                    <div className="whitespace-pre-wrap">
                                        {/* AI SDK v6 recommended: use parts for rendering */}
                                        {message.parts?.map((part: any, index: number) => 
                                            part.type === 'text' ? <span key={index}>{part.text}</span> : null
                                        )}
                                        
                                        {/* Fallback for backwards compatibility */}
                                        {!message.parts && message.content}

                                        {/* Handle direct media attachment */}
                                        {message.media && <MediaDisplay media={message.media} />}

                                        {/* Handle tool invocations for media */}
                                        {(message as MessageWithTools).toolInvocations?.map((toolInvocation) => {
                                            if (toolInvocation.toolName === 'showMedia' && 'result' in toolInvocation) {
                                                const result = toolInvocation.result;
                                                if (result && result.media) {
                                                    return <MediaDisplay key={toolInvocation.toolCallId} media={result.media} />;
                                                }
                                            }
                                            return null;
                                        })}
                                    </div>
                                </div>
                            </div>
                        ))}
                        <div ref={messagesEndRef} className="h-4" />
                    </div>
                </main>

                {/* Input Area */}
                <div className="bg-white border-t border-gray-100 p-4 z-20 flex-shrink-0">
                    <div className="max-w-3xl mx-auto">
                        {isVoiceMode ? (
                            <div className="flex flex-col items-center gap-6 animate-in slide-in-from-bottom-4 duration-500">
                                {showTranscript ? (
                                    <>
                                        <button
                                            onClick={() => {
                                                if (isCompleted) return; // Prevent recording after completion
                                                if (voiceWs.isRecording) voiceWs.stopRecording();
                                                else voiceWs.startRecording();
                                            }}
                                            disabled={isCompleted}
                                            className="group focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <VisualizerRing isRecording={voiceWs.isRecording} />
                                        </button>

                                        <div className="text-center space-y-2 w-full max-w-lg">
                                            <p className="text-gray-900 font-semibold text-lg tracking-tight">
                                                {voiceWs.isRecording ? "Listening..." : 
                                                voiceWs.isPlaying ? "AI Speaking..." : "Tap to speak"}
                                            </p>
                                            <p className="text-xs text-gray-400 font-medium uppercase tracking-widest">
                                                {voiceWs.status === "connected" ? "AI Ready" : "Connecting..."}
                                            </p>

                                            {/* Live Transcription Display */}
                                            {voiceWs.isRecording && (voiceWs.transcription || voiceWs.interimTranscription) && (
                                                <div className="mt-4 bg-gray-50 border border-gray-200 rounded-2xl p-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
                                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                                                        Live Transcription
                                                    </p>
                                                    <p className="text-sm text-gray-900 leading-relaxed text-left">
                                                        {voiceWs.transcription}
                                                        <span className="text-gray-400 italic">{voiceWs.interimTranscription}</span>
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </>
                                ) : (
                                    // Minimal Footer for Focused Mode
                                     <div className="w-full">
                                         {voiceWs.isRecording && (voiceWs.transcription || voiceWs.interimTranscription) && (
                                            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 animate-in fade-in slide-in-from-bottom-2 duration-200 max-w-lg mx-auto">
                                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 text-center">
                                                    Live Transcription
                                                </p>
                                                <p className="text-sm text-gray-900 leading-relaxed text-center">
                                                    {voiceWs.transcription}
                                                    <span className="text-gray-400 italic">{voiceWs.interimTranscription}</span>
                                                </p>
                                            </div>
                                        )}
                                     </div>
                                )}
                            </div>
                        ) : (
                            !isCompleted && (
                            <form onSubmit={handleSubmit} className="relative group">
                                <div className="relative flex items-end gap-2 bg-white rounded-[2rem] border border-gray-200 p-2 shadow-sm focus-within:shadow-md focus-within:border-gray-300 transition-all">
                                    <textarea
                                        ref={inputRef}
                                        value={input}
                                        onChange={e => setInput(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === "Enter" && !e.shiftKey) {
                                                e.preventDefault();
                                                handleSubmit(e);
                                            }
                                        }}
                                        placeholder="Type your answer..."
                                        rows={1}
                                        disabled={isChatLoading || isCompleted}
                                        className="w-full pl-6 pr-4 py-4 bg-transparent border-none resize-none focus:outline-none focus:ring-0 text-gray-900 placeholder:text-gray-400 text-lg max-h-32 min-h-[3.5rem]"
                                        style={{ height: '3.5rem' }}
                                    />
                                    <button
                                        type="submit"
                                        disabled={!input.trim() || isChatLoading || isCompleted}
                                        className="mb-1 mr-1 p-3 bg-gray-900 text-white rounded-full hover:bg-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 active:scale-95 flex-shrink-0"
                                    >
                                        {isChatLoading ? (
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                        ) : (
                                            <Send className="w-5 h-5" />
                                        )}
                                    </button>
                                </div>
                            </form>
                            )
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
