"use client";

import { clientEnv } from "@/lib/env.client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Send, Loader2, AlertCircle,CheckCircle, Mic, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVoiceWebSocket } from "@/hooks/use-voice-websocket";
import { useChat } from "@ai-sdk/react";
import { type UIMessage } from "@ai-sdk/react";
import { MediaDisplay } from "@/components/surveys/media-display";

interface ExtendedMessage extends Omit<Partial<UIMessage>, "role"> {
    id: string;
    role: "user" | "assistant" | "system" | "data";
    content: string;
    displayedContent?: string;
    isTyping?: boolean;
    media?: any;
    toolInvocations?: any[];
}

interface Survey {
    id: string;
    title: string;
    objective?: { description?: string };
    targetAudience?: { description?: string };
    tone?: string;
    isVoice?: boolean;
    media?: any[];
}

const TYPING_DELAY_MS = 12;

export default function SurveyRespondPage() {
    const params = useParams();
    const router = useRouter();
    const shareableLink = params.shareableLink as string;

    const [survey, setSurvey] = useState<Survey | null>(null);
    const [conversationId, setConversationId] = useState<string | null>(null);

    // AI SDK useChat
    const chatHelpers = useChat<any>({
        api: `/api/surveys/respond/${shareableLink}`,
        body: { conversationId },
        onFinish: (message: any) => {
             // Optional: Handle finish
        }
    } as any);
    
    const { messages, setMessages, status, sendMessage } = chatHelpers;
    const streamData = (chatHelpers as any).data;

    const [input, setInput] = useState("");
    const isChatLoading = status === "streaming" || status === "submitted"; // Derived loading state
    
    // Manual handleSubmit
    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) {
            e.preventDefault();
        }
        if (!input.trim() || isChatLoading) return;

        const currentInput = input;
        setInput(""); // Clear input early

        try {
           await sendMessage({ role: "user", content: currentInput });
        } catch (error) {
           console.error("Failed to send message:", error);
           // Optionally restore input or show error
        }
    };
    const [isInitializing, setIsInitializing] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isCompleted, setIsCompleted] = useState(false);
    const [isVoiceMode, setIsVoiceMode] = useState(false);

    // Voice WebSocket Integration
    const voiceWs = useVoiceWebSocket({
        url: `${clientEnv.NEXT_PUBLIC_WEBSOCKET_URL}/voice/survey-response?surveyId=${shareableLink}`,
        onMessage: (data) => {
            if (data.type === "audio_sent" || data.type === "text_response") {
                const assistantMessage: ExtendedMessage = {
                    id: Date.now().toString(),
                    role: "assistant",
                    content: data.text,
                    displayedContent: data.text,
                    isTyping: false,
                };
                setMessages((prev: UIMessage[]) => [...prev, assistantMessage as UIMessage]);
                
                if (data.text.toLowerCase().includes("thank you for completing") ||
                    data.text.toLowerCase().includes("survey is now complete")) {
                    setIsCompleted(true);
                }
            } else if (data.type === "transcription" && data.isFinal) {
                const userMessage: ExtendedMessage = {
                    id: Date.now().toString(),
                    role: "user",
                    content: data.text,
                    displayedContent: data.text,
                    isTyping: false,
                };
                setMessages((prev: UIMessage[]) => [...prev, userMessage as UIMessage]);
            } else if (data.type === 'display_media') {
                 // Voice mode media
                 if (survey?.media) { // Assuming media is fetched or we try to find it?
                     // Wait, for Public Survey, initially we might not have media unless we fetch detail.
                     // But the voice websocket logic sends { id, type } usually?
                     // Actually Sample page logic used survey.media lookup.
                     // Does public survey fetch media? YES, I updated GET route to return media.
                     const fullMedia = (survey as any).media?.find((m: any) => m.id === data.media.id);
                     if (fullMedia) {
                         setMessages((prev: UIMessage[]) => [...prev, {
                             id: Date.now().toString(),
                             role: "assistant",
                             content: "Shared media",
                             media: fullMedia
                         } as any]);
                     }
                 }
            }
        }
    });

    // Handle StreamData from Text Mode (useChat)
    useEffect(() => {
        if (!streamData) return;
        // streamData is array of JSON objects. checking last one or iterating?
        // useChat 'data' accumulates.
        const lastData = streamData[streamData.length - 1] as any;
        if (lastData && lastData.type === 'display_media') {
             // Check if we already added this media?
             // Since streamData persists, we might re-process.
             // We can check if the last message has this media?
             // Or just ignore duplicates based on ID in messages?
             
             // A better way: attach media to the assistant message that triggered it?
             // But 'data' comes separately in stream.
             
             // Let's just append a "system" or "assistant" message with media if not present.
             // Or simpler: We just render media if we see it.
             
             // Actually, with useChat, we can't easily inject a message from 'data' effect loop without causing loops.
             // But we can update the LAST message to include media?
             
             // Simpler: Just rely on voice logic for now or implement clean handling later.
             // For now, let's just log it or try to append a message if it's new.
             const mediaId = lastData.media.id;
             // Check if any message has this media?
             
             const hasMedia = messages.some((m: any) => m.media && m.media.id === mediaId);
             if (!hasMedia && (survey as any)?.media) {
                 const fullMedia = (survey as any).media.find((m: any) => m.id === mediaId);
                 if (fullMedia) {
                      setMessages((prev: UIMessage[]) => [...prev, {
                         id: Date.now().toString(),
                         role: "assistant",
                         content: "", // Empty or descriptive
                         media: fullMedia
                      } as any]);
                 }
             }
        }
    }, [streamData, messages, survey]);

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

    // Typing animation
    const animateTyping = useCallback((messageId: string, fullContent: string) => {
        let currentIndex = 0;
        const intervalId = setInterval(() => {
            currentIndex++;
            setMessages((prev: UIMessage[]) => prev.map(msg =>
                msg.id === messageId
                    ? {
                        ...msg,
                        displayedContent: fullContent.slice(0, currentIndex),
                        isTyping: currentIndex < fullContent.length
                    }
                    : msg
            ));

            if (currentIndex >= fullContent.length) {
                clearInterval(intervalId);
            }
        }, TYPING_DELAY_MS);

        return intervalId;
    }, []);

    // Initialize conversation
    useEffect(() => {
        const initConversation = async () => {
            try {
                const response = await fetch(`/api/surveys/respond/${shareableLink}`, {
                    method: "GET",
                });

                if (!response.ok) {
                    if (response.status === 404) {
                        setError("Survey not found");
                    } else if (response.status === 403) {
                        setError("This survey is no longer accepting responses");
                    } else {
                        setError("Failed to load survey");
                    }
                    return;
                }

                const data = await response.json();
                setSurvey(data.survey);
                setConversationId(data.conversationId);

                if (data.survey.isVoice) {
                    setIsVoiceMode(true);
                    voiceWs.connect();
                }

                // Add initial AI greeting
                const greetingId = Date.now().toString();
                const greeting = `Hi! 👋 Welcome to this survey about "${data.survey.title}". I'm here to have a conversation with you to gather your thoughts and feedback. Your responses are anonymous and will help improve our services.\n\nLet's get started! ${data.survey.objective?.description ? `The goal of this survey is: ${data.survey.objective.description}` : ""}\n\nFirst, could you tell me a bit about yourself and your experience with us?`;

                setMessages([{
                    id: greetingId,
                    role: "assistant",
                    content: greeting,
                    displayedContent: "",
                    isTyping: true,
                }]);

                setTimeout(() => animateTyping(greetingId, greeting), 500);
            } catch (err) {
                setError("Failed to load survey");
            } finally {
                setIsInitializing(false);
            }
        };

        if (shareableLink) {
            initConversation();
        }
    }, [shareableLink, animateTyping]);


    // Replaced by useChat's handleSubmit and input management
    // We bind useChat's handleSubmit to the form

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    if (isInitializing) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">Loading survey...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertCircle className="w-8 h-8 text-red-500" />
                    </div>
                    <h1 className="text-xl font-bold text-gray-900 mb-2">{error}</h1>
                    <p className="text-gray-500">Please check the link and try again.</p>
                </div>
            </div>
        );
    }

    if (isCompleted) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
                    <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle className="w-8 h-8 text-emerald-500" />
                    </div>
                    <h1 className="text-xl font-bold text-gray-900 mb-2">Thank You!</h1>
                    <p className="text-gray-500 mb-6">Your responses have been recorded. We appreciate your time and feedback!</p>
                    <button
                        onClick={() => window.close()}
                        className="px-6 py-3 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        );
    }


    // ... imports ...

    // Premium UI Components
    const VisualizerRing = ({ isRecording }: { isRecording: boolean }) => (
        <div className="relative flex items-center justify-center">
            {isRecording && (
                <>
                    <div className="absolute inset-0 rounded-full border-4 border-indigo-500/20 animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]" />
                    <div className="absolute inset-0 rounded-full border-4 border-indigo-500/10 animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite]" />
                </>
            )}
            <div className={cn(
                "relative z-10 w-20 h-20 rounded-full flex items-center justify-center transition-all duration-500 shadow-2xl backdrop-blur-sm border border-white/10",
                isRecording 
                    ? "bg-gradient-to-br from-indigo-600 to-violet-600 scale-110 shadow-indigo-500/50" 
                    : "bg-gray-900 shadow-xl hover:scale-105"
            )}>
                {isRecording ? <MicOff className="w-8 h-8 text-white" /> : <Mic className="w-8 h-8 text-white" />}
            </div>
        </div>
    );

    if (isInitializing) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="relative">
                         <div className="w-12 h-12 rounded-full border-4 border-gray-100" />
                         <div className="absolute inset-0 rounded-full border-4 border-gray-900 border-t-transparent animate-spin" />
                    </div>
                    <p className="text-gray-500 font-medium animate-pulse">Initializing experience...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl shadow-xl p-10 max-w-md w-full text-center border border-gray-100">
                    <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                        <AlertCircle className="w-10 h-10 text-red-500" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-3">{error}</h1>
                    <p className="text-gray-500 text-lg">Please check the link and try again.</p>
                </div>
            </div>
        );
    }

    if (isCompleted) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center p-4 relative overflow-hidden">
                {/* Background Decoration */}
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

    return (
        <div className="min-h-screen bg-[#FDFDFD] flex flex-col font-sans selection:bg-gray-900 selection:text-white">
            {/* Minimal Header */}
            <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-100 px-6 py-4 transition-all">
                <div className="max-w-4xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center border border-gray-200">
                             <span className="text-lg">💬</span>
                        </div>
                        <div>
                            <h1 className="font-bold text-gray-900 tracking-tight">{survey?.title}</h1>
                            <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Conversational Survey</p>
                        </div>
                    </div>
                    
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
            </header>

            {/* Chat Area */}
            <main className="flex-1 overflow-y-auto scroll-smooth">
                <div className="max-w-3xl mx-auto px-4 py-8 space-y-8 pb-32">
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
                                    {message.content}
                                    
                                    {/* Handle direct media attachment (legacy) */}
                                    {message.media && <MediaDisplay media={message.media} />}
                                    
                                    {/* Handle tool invocations for media */}
                                    {message.toolInvocations?.map((toolInvocation: any) => {
                                        if (toolInvocation.toolName === 'showMedia' && 'result' in toolInvocation) {
                                            const result = toolInvocation.result;
                                            if (result && result.media) {
                                                return <MediaDisplay key={toolInvocation.toolCallId} media={result.media} />;
                                            }
                                        }
                                        return null;
                                    })}
                                    
                                    {message.isTyping && (
                                        <span className="inline-block w-1.5 h-5 bg-current ml-1 animate-pulse align-middle opacity-50" />
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                    <div ref={messagesEndRef} className="h-4" />
                </div>
            </main>

            {/* Input Area */}
            <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-white via-white/95 to-transparent pb-8 pt-12 px-4 z-20">
                <div className="max-w-3xl mx-auto">
                    {isVoiceMode ? (
                        <div className="flex flex-col items-center gap-6 animate-in slide-in-from-bottom-4 duration-500">
                           <button
                                onClick={() => {
                                    if (voiceWs.isRecording) voiceWs.stopRecording();
                                    else voiceWs.startRecording();
                                }}
                                className="group focus:outline-none"
                            >
                                <VisualizerRing isRecording={voiceWs.isRecording} />
                            </button>
                            
                            <div className="text-center space-y-1">
                                <p className="text-gray-900 font-semibold text-lg tracking-tight">
                                    {voiceWs.isRecording ? "Listening..." : "Tap to speak"}
                                </p>
                                {/* Live Transcription Preview */}
                                <div className="h-6 flex items-center justify-center">
                                     {(voiceWs.transcription || voiceWs.interimTranscription) ? (
                                        <p className="text-sm text-gray-500 max-w-md truncate px-4">
                                            {voiceWs.transcription}
                                            <span className="text-gray-400 italic">{voiceWs.interimTranscription}</span>
                                        </p>
                                     ) : (
                                        <p className="text-xs text-gray-400 font-medium uppercase tracking-widest">
                                            {voiceWs.status === "connected" ? "AI Ready" : "Connecting..."}
                                        </p>
                                     )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="relative group">
                            <div className="absolute inset-0 bg-gray-200 rounded-[2rem] blur opacity-20 group-hover:opacity-30 transition-opacity" />
                            <div className="relative flex items-end gap-2 bg-white rounded-[2rem] border border-gray-200 p-2 shadow-2xl shadow-gray-200/50">
                                <textarea
                                    ref={inputRef}
                                    value={input}
                                    onChange={e => setInput(e.target.value)} // useChat handles this
                                    onKeyDown={e => {
                                        if (e.key === "Enter" && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSubmit(e);
                                        }
                                    }}
                                    placeholder="Type your answer..."
                                    rows={1}
                                    disabled={isChatLoading}
                                    className="w-full pl-6 pr-4 py-4 bg-transparent border-none resize-none focus:ring-0 text-gray-900 placeholder:text-gray-400 text-lg max-h-32 min-h-[3.5rem]"
                                    style={{ height: '3.5rem' }} 
                                />
                                <button
                                    type="submit"
                                    disabled={!input.trim() || isChatLoading}
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
                    )}
                </div>
            </div>
        </div>
    );
}
