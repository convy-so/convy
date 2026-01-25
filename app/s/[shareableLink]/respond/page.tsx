"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Send, Loader2, AlertCircle, MessageSquare, CheckCircle, Mic, MicOff, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVoiceWebSocket } from "@/hooks/use-voice-websocket";

interface Message {
    id: string;
    role: "user" | "assistant";
    content: string;
    displayedContent?: string;
    isTyping?: boolean;
}

interface Survey {
    id: string;
    title: string;
    objective?: { description?: string };
    targetAudience?: { description?: string };
    tone?: string;
    isVoice?: boolean;
}

const TYPING_DELAY_MS = 12;

export default function SurveyRespondPage() {
    const params = useParams();
    const router = useRouter();
    const shareableLink = params.shareableLink as string;

    const [survey, setSurvey] = useState<Survey | null>(null);
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isInitializing, setIsInitializing] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isCompleted, setIsCompleted] = useState(false);
    const [isVoiceMode, setIsVoiceMode] = useState(false);

    // Voice WebSocket Integration
    const voiceWs = useVoiceWebSocket({
        url: `ws://localhost:3001/voice/survey-response?surveyId=${shareableLink}`,
        onMessage: (data) => {
            if (data.type === "audio_sent" || data.type === "text_response") {
                const assistantMessage: Message = {
                    id: Date.now().toString(),
                    role: "assistant",
                    content: data.text,
                    displayedContent: data.text,
                    isTyping: false,
                };
                setMessages(prev => [...prev, assistantMessage]);
                
                if (data.text.toLowerCase().includes("thank you for completing") ||
                    data.text.toLowerCase().includes("survey is now complete")) {
                    setIsCompleted(true);
                }
            } else if (data.type === "transcription" && data.isFinal) {
                const userMessage: Message = {
                    id: Date.now().toString(),
                    role: "user",
                    content: data.text,
                    displayedContent: data.text,
                    isTyping: false,
                };
                setMessages(prev => [...prev, userMessage]);
            }
        }
    });

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
            setMessages(prev => prev.map(msg =>
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

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();

        const trimmedInput = input.trim();
        if (!trimmedInput || isLoading || !conversationId) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            role: "user",
            content: trimmedInput,
        };

        setMessages(prev => [...prev, userMessage]);
        setInput("");
        setIsLoading(true);

        try {
            const response = await fetch(`/api/surveys/respond/${shareableLink}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    conversationId,
                    messages: [...messages, userMessage].map(m => ({
                        role: m.role,
                        content: m.content,
                    })),
                }),
            });

            if (!response.ok) {
                throw new Error("Failed to get response");
            }

            // Handle streaming response
            const reader = response.body?.getReader();
            if (!reader) throw new Error("No response body");

            let fullContent = "";
            const assistantMessageId = (Date.now() + 1).toString();

            setMessages(prev => [...prev, {
                id: assistantMessageId,
                role: "assistant",
                content: "",
                displayedContent: "",
                isTyping: true,
            }]);

            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                fullContent += chunk;

                setMessages(prev => prev.map(msg =>
                    msg.id === assistantMessageId
                        ? { ...msg, content: fullContent, displayedContent: fullContent }
                        : msg
                ));
            }

            // Check if survey is complete
            if (fullContent.toLowerCase().includes("thank you for completing") ||
                fullContent.toLowerCase().includes("survey is now complete")) {
                setIsCompleted(true);
            }

            setMessages(prev => prev.map(msg =>
                msg.id === assistantMessageId
                    ? { ...msg, isTyping: false }
                    : msg
            ));

        } catch (err) {
            console.error("Error:", err);
            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                content: "I'm sorry, something went wrong. Please try again.",
            }]);
        } finally {
            setIsLoading(false);
        }
    };

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

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col">
            {/* Header */}
            <div className="bg-white border-b border-gray-100 px-4 py-3">
                <div className="max-w-3xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gray-900 rounded-xl flex items-center justify-center">
                            <MessageSquare className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="font-semibold text-gray-900">{survey?.title}</h1>
                            <p className="text-xs text-gray-500">Conversational Survey</p>
                        </div>
                    </div>
                    
                    <button 
                        onClick={toggleVoiceMode}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all",
                            isVoiceMode 
                                ? "bg-red-50 text-red-600 border border-red-100" 
                                : "bg-gray-50 text-gray-600 border border-gray-100 hover:bg-gray-100"
                        )}
                    >
                        {isVoiceMode ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                        {isVoiceMode ? "Exit Voice Mode" : "Switch to Voice"}
                    </button>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-6">
                <div className="max-w-3xl mx-auto space-y-4">
                    {messages.map((message) => (
                        <div
                            key={message.id}
                            className={cn(
                                "flex",
                                message.role === "user" ? "justify-end" : "justify-start"
                            )}
                        >
                            <div
                                className={cn(
                                    "max-w-[80%] rounded-2xl px-4 py-3",
                                    message.role === "user"
                                        ? "bg-gray-900 text-white"
                                        : "bg-white border border-gray-100 shadow-sm text-gray-900"
                                )}
                            >
                                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                                    {message.displayedContent ?? message.content}
                                    {message.isTyping && (
                                        <span className="inline-block w-1.5 h-4 bg-gray-400 ml-0.5 animate-pulse" />
                                    )}
                                </p>
                            </div>
                        </div>
                    ))}

                    {isLoading && messages[messages.length - 1]?.role === "user" && (
                        <div className="flex justify-start">
                            <div className="bg-white border border-gray-100 shadow-sm rounded-2xl px-4 py-3">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" />
                                    <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }} />
                                    <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
                                </div>
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>
            </div>

            {/* Input */}
            <div className="bg-white border-t border-gray-100 px-4 py-4">
                {isVoiceMode ? (
                    <div className="max-w-3xl mx-auto flex flex-col items-center py-4 space-y-4">
                        <button
                            onClick={() => {
                                if (voiceWs.isRecording) voiceWs.stopRecording();
                                else voiceWs.startRecording();
                            }}
                            className={cn(
                                "w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg",
                                voiceWs.isRecording ? "bg-red-600 text-white scale-110" : "bg-gray-900 text-white hover:scale-105"
                            )}
                        >
                            {voiceWs.isRecording ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
                        </button>
                        <div className="text-center">
                             <p className="text-sm font-bold text-gray-900">
                                {voiceWs.isRecording ? "Listening to you..." : "Ready to listen"}
                            </p>
                            <p className="text-xs text-gray-500">
                                {voiceWs.isRecording ? "Speak naturally" : "Click the mic to speak"}
                            </p>
                        </div>
                        {(voiceWs.transcription || voiceWs.interimTranscription) && (
                            <div className="w-full bg-gray-50 p-3 rounded-xl border border-gray-100 text-sm">
                                <p>
                                    {voiceWs.transcription}
                                    <span className="text-gray-400">{voiceWs.interimTranscription}</span>
                                </p>
                            </div>
                        )}
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
                        <div className="flex items-end gap-3">
                            <div className="flex-1 relative">
                                <textarea
                                    ref={inputRef}
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder="Type your response..."
                                    rows={1}
                                    disabled={isLoading}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 disabled:opacity-50 text-sm"
                                    style={{ minHeight: "48px", maxHeight: "120px" }}
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={!input.trim() || isLoading}
                                className="p-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isLoading ? (
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
    );
}
