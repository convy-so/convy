"use client";

import { clientEnv } from "@/lib/env.client";

import { useState, useRef, useEffect, useCallback, FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Mic,
  MicOff,
  Loader2,
  ArrowLeft,
  CheckCircle,
  MessageSquare,
  Sparkles,
  RefreshCcw,
  User,
  Bot,
  TrendingUp,
  AlertCircle,
  Send,
  Keyboard,
  Volume2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import { useAuth } from "@/components/providers/auth-provider";
import { useVoiceWebSocket } from "@/hooks/use-voice-websocket";
import { MediaDisplay } from "@/components/surveys/media-display";
import { useChat } from "@ai-sdk/react";

const MAX_SAMPLE_CONVERSATIONS = 3;

type Message = {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: string;
    media?: any;
};

export default function SampleReviewPage() {
    const params = useParams();
    const router = useRouter();
    const { user } = useAuth();
    const surveyId = params.surveyId as string;

    const [survey, setSurvey] = useState<any>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isConfirming, setIsConfirming] = useState(false);
    const [feedback, setFeedback] = useState("");
    const [showFeedbackModal, setShowFeedbackModal] = useState(false);
    const [isRetrying, setIsRetrying] = useState(false);
    const [inputMode, setInputMode] = useState<"voice" | "text">("voice");
    const [textInput, setTextInput] = useState("");
    const [isTextLoading, setIsTextLoading] = useState(false);

    // Computed values
    const currentSampleNumber = (survey?.sampleConversationCount || 0) + 1;
    const samplesRemaining = MAX_SAMPLE_CONVERSATIONS - (survey?.sampleConversationCount || 0);
    const canRetry = samplesRemaining > 0;

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Check for completion token
    useEffect(() => {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg?.role === "assistant" && lastMsg.content.includes("[[SURVEY_COMPLETED]]")) {
            const cleanedContent = lastMsg.content.replace("[[SURVEY_COMPLETED]]", "").trim();
            // Update message to remove token and open modal
            setMessages(prev => {
                const newMessages = [...prev];
                newMessages[newMessages.length - 1] = {
                    ...lastMsg,
                    content: cleanedContent
                };
                return newMessages;
            });
            
            // Only open if we haven't already (to prevent double open if multiple updates happen quickly)
            if (!showFeedbackModal) {
                 setShowFeedbackModal(true);
            }
        }
    }, [messages, showFeedbackModal]);

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
                    content: data.text,
                    timestamp: new Date().toISOString()
                 }]);
            } else if (data.type === "transcription" && data.isFinal) {
                 setMessages(prev => [...prev, {
                    id: Date.now().toString(),
                    role: "user",
                    content: data.text,
                    timestamp: new Date().toISOString()
                 }]);
            } else if (data.type === 'display_media') {
                 if (survey?.media) {
                     const fullMedia = survey.media.find((m: any) => m.id === data.media.id);
                     if (fullMedia) {
                         setMessages(prev => [...prev, {
                             id: Date.now().toString(),
                             role: "assistant",
                             content: "Shared media",
                             timestamp: new Date().toISOString(),
                             media: fullMedia
                         }]);
                     }
                 }
            }
        }
    });

    useEffect(() => {
        const fetchSurvey = async () => {
            try {
                const response = await fetch(`/api/surveys/${surveyId}/details`);
                if (response.ok) {
                    const data = await response.json();
                    setSurvey(data.survey);
                    // Auto-connect voice if it's a voice survey
                    if (data.survey?.isVoice && inputMode === "voice") {
                        voiceWs.connect();
                    }
                }
            } catch (error) {
                toast.error("Failed to load survey details");
            } finally {
                setIsLoading(false);
            }
        };

        if (surveyId) fetchSurvey();
    }, [surveyId]);

    // Handle text message submission
    const handleTextSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!textInput.trim() || isTextLoading) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            role: "user",
            content: textInput.trim(),
            timestamp: new Date().toISOString(),
        };

        setMessages(prev => [...prev, userMessage]);
        setTextInput("");
        setIsTextLoading(true);

        try {
            const response = await fetch(`/api/surveys/${surveyId}/sample`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: [...messages, { role: "user", content: textInput.trim() }].map(m => ({
                        role: m.role,
                        content: m.content
                    })),
                    conversationNumber: currentSampleNumber,
                }),
            });

            if (!response.ok) throw new Error("Failed to get response");

            // Read the streamed response
            const reader = response.body?.getReader();
            if (!reader) throw new Error("No reader");

            let assistantContent = "";
            const decoder = new TextDecoder();

            // Add placeholder message
            const assistantId = (Date.now() + 1).toString();
            setMessages(prev => [...prev, {
                id: assistantId,
                role: "assistant",
                content: "",
                timestamp: new Date().toISOString()
            }]);

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value, { stream: true });
                assistantContent += chunk;
                
                // Update the assistant message in place
                setMessages(prev => prev.map(m => 
                    m.id === assistantId 
                        ? { ...m, content: assistantContent }
                        : m
                ));
            }
        } catch (error) {
            toast.error("Failed to get AI response");
            // Remove the last user message on error
            setMessages(prev => prev.slice(0, -1));
        } finally {
            setIsTextLoading(false);
        }
    };

    const handleRetry = async () => {
        if (!canRetry) {
            toast.error("You've used all 3 sample conversations");
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
                toast.success("Feedback applied! Starting new conversation...");
                setShowFeedbackModal(false);
                setFeedback("");
                setMessages([]);
                
                // Refresh survey data to get new conversation count
                const data = await response.json();
                setSurvey(data.survey);
                
                // Reconnect WS with new number if in voice mode
                if (inputMode === "voice") {
                    voiceWs.disconnect();
                    setTimeout(() => voiceWs.connect(), 500);
                }
            } else {
                toast.error("Failed to apply feedback");
            }
        } catch (error) {
            toast.error("Error applying feedback");
        } finally {
            setIsRetrying(false);
        }
    };

    const handleConfirm = async () => {
        if (!confirm("Are you satisfied with the conversation flow? This will mark the survey as reviewed and ready for publishing.")) return;
        
        setIsConfirming(true);
        try {
            const response = await fetch(`/api/surveys/${surveyId}/publish`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });

            if (response.ok) {
                toast.success("Survey confirmed and published!");
                router.push(`/dashboard/surveys/${surveyId}`);
            } else {
                toast.error("Failed to confirm survey");
            }
        } catch (error) {
            toast.error("An error occurred");
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

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)] max-w-6xl mx-auto py-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between px-4">
                <div className="flex items-center gap-4">
                    <Link 
                        href={`/dashboard/surveys/${surveyId}`}
                        className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5 text-gray-600" />
                    </Link>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900 tracking-tight">Sample Conversation: {survey?.title}</h1>
                        <p className="text-sm text-gray-500 font-medium">Test and refine your survey before going live</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {/* Sample Counter Badge */}
                    <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-xl">
                        <span className="text-sm font-bold text-gray-700">
                            Sample {Math.min(currentSampleNumber, MAX_SAMPLE_CONVERSATIONS)} of {MAX_SAMPLE_CONVERSATIONS}
                        </span>
                        <div className="flex gap-1">
                            {[1, 2, 3].map((num) => (
                                <div
                                    key={num}
                                    className={cn(
                                        "w-2 h-2 rounded-full transition-colors",
                                        num <= (survey?.sampleConversationCount || 0)
                                            ? "bg-emerald-500"
                                            : num === currentSampleNumber
                                            ? "bg-blue-500"
                                            : "bg-gray-300"
                                    )}
                                />
                            ))}
                        </div>
                    </div>

                    <button 
                         onClick={() => {
                            if (inputMode === "voice") {
                                voiceWs.disconnect();
                                voiceWs.connect();
                            }
                            setMessages([]);
                         }}
                         className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 font-medium transition-colors"
                    >
                        <RefreshCcw className="w-4 h-4" />
                        Restart
                    </button>
                    
                    {/* Feedback / Retry Button */}
                     <button 
                        onClick={() => setShowFeedbackModal(true)}
                        disabled={!canRetry}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl font-medium transition-colors shadow-sm",
                            canRetry 
                                ? "text-gray-700 hover:bg-gray-50" 
                                : "text-gray-400 cursor-not-allowed opacity-60"
                        )}
                        title={canRetry ? "Apply improvements and try again" : "No more retries available"}
                    >
                        <MessageSquare className="w-4 h-4" />
                        Feedback & Retry
                        {!canRetry && <span className="text-xs">(0 left)</span>}
                    </button>

                    <button 
                        onClick={handleConfirm}
                        disabled={isConfirming || messages.length < 2}
                        className="flex items-center gap-2 px-6 py-2.5 bg-gray-900 text-white rounded-xl font-bold hover:bg-gray-800 disabled:opacity-50 transition-all shadow-md active:scale-95"
                    >
                        {isConfirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                        Publish Survey
                    </button>
                </div>
            </div>

            {/* Feedback Modal */}
            {showFeedbackModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-6">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xl font-bold text-gray-900">Improve the AI's Behavior</h3>
                                <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-lg">
                                    {samplesRemaining - 1} {samplesRemaining - 1 === 1 ? "retry" : "retries"} left after this
                                </span>
                            </div>
                            <p className="text-sm text-gray-500">
                                Tell the AI how to improve (e.g., "Don't ask about price," "Be more formal," "Speak slower"). 
                                This feedback will be applied to the <strong>next sample</strong> and the <strong>live survey</strong>.
                            </p>
                        </div>
                        
                        <textarea
                            value={feedback}
                            onChange={(e) => setFeedback(e.target.value)}
                            placeholder="e.g., Please ask about the specific product features earlier..."
                            className="w-full h-32 p-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none bg-gray-50"
                        />
                        
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowFeedbackModal(false)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleRetry}
                                disabled={!feedback.trim() || isRetrying}
                                className="px-6 py-2 bg-gray-900 text-white rounded-lg font-bold hover:bg-gray-800 disabled:opacity-50 flex items-center gap-2"
                            >
                                {isRetrying ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
                                Apply & Start Sample {currentSampleNumber + 1}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-1 gap-6 overflow-hidden min-h-0 px-4">
                {/* Chat Panel */}
                <div className="flex-1 flex flex-col bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                    {/* Input Mode Toggle */}
                    <div className="flex items-center justify-center gap-4 p-4 border-b border-gray-100 bg-gray-50/50">
                        <button
                            onClick={() => {
                                setInputMode("voice");
                                if (survey?.isVoice) voiceWs.connect();
                            }}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all",
                                inputMode === "voice"
                                    ? "bg-gray-900 text-white shadow-md"
                                    : "text-gray-500 hover:bg-gray-100"
                            )}
                        >
                            <Volume2 className="w-4 h-4" />
                            Voice
                        </button>
                        <button
                            onClick={() => {
                                setInputMode("text");
                                voiceWs.disconnect();
                            }}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all",
                                inputMode === "text"
                                    ? "bg-gray-900 text-white shadow-md"
                                    : "text-gray-500 hover:bg-gray-100"
                            )}
                        >
                            <Keyboard className="w-4 h-4" />
                            Text
                        </button>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
                        {messages.length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-60">
                                <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center">
                                    <MessageSquare className="w-8 h-8 text-gray-300" />
                                </div>
                                <div className="space-y-1">
                                    <p className="font-semibold text-gray-900">Start the conversation</p>
                                    <p className="text-sm text-gray-500 max-w-[280px]">
                                        {inputMode === "voice" 
                                            ? "Click the mic and say hello to test the survey agent."
                                            : "Type a message to simulate how a respondent would interact."}
                                    </p>
                                </div>
                            </div>
                        )}
                        {messages.map((msg) => (
                            <div key={msg.id} className={cn("flex gap-3", msg.role === "user" ? "flex-row-reverse" : "")}>
                                <div className={cn(
                                    "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                                    msg.role === "assistant" ? "bg-gray-900" : "bg-gray-100"
                                )}>
                                    {msg.role === "assistant" ? <Bot className="w-4 h-4 text-white" /> : <User className="w-4 h-4 text-gray-600" />}
                                </div>
                                <div className={cn(
                                    "max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed",
                                    msg.role === "assistant" ? "bg-gray-50 text-gray-800" : "bg-gray-900 text-white"
                                )}>
                                    {msg.content}
                                    {msg.media && <MediaDisplay media={msg.media} />}
                                </div>
                            </div>
                        ))}
                        {isTextLoading && (
                            <div className="flex gap-3">
                                <div className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center">
                                    <Bot className="w-4 h-4 text-white" />
                                </div>
                                <div className="bg-gray-50 rounded-2xl px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Footer / Input Area */}
                    <div className="p-6 bg-gray-50/50 border-t border-gray-100">
                        {inputMode === "voice" ? (
                            <div className="flex flex-col items-center gap-4">
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
                                        "w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg",
                                        voiceWs.status !== "connected" ? "bg-gray-200 text-gray-400" :
                                        voiceWs.isRecording ? "bg-red-600 text-white scale-110" : "bg-gray-900 text-white hover:scale-105"
                                    )}
                                >
                                    {voiceWs.status !== "connected" ? <Loader2 className="w-8 h-8 animate-spin" /> : 
                                     voiceWs.isRecording ? <MicOff className="w-7 h-7" /> : <Mic className="w-7 h-7" />}
                                </button>
                                
                                <div className="text-center space-y-1">
                                    <p className="text-sm font-bold text-gray-900">
                                        {voiceWs.status !== "connected" ? "Connecting to AI..." : 
                                         voiceWs.isRecording ? "Listening to you..." : "AI ready to listen"}
                                    </p>
                                    <p className="text-xs text-gray-500 font-medium">
                                        {voiceWs.isRecording ? "Speak naturally to experience the flow" : "Click the mic to speak"}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <form onSubmit={handleTextSubmit} className="relative">
                                <textarea
                                    value={textInput}
                                    onChange={(e) => setTextInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && !e.shiftKey) {
                                            e.preventDefault();
                                            handleTextSubmit(e as any);
                                        }
                                    }}
                                    placeholder="Type a message as a survey respondent would..."
                                    rows={1}
                                    className="w-full px-4 py-3 pr-12 bg-white border border-gray-200 rounded-xl resize-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 outline-none text-sm min-h-[48px] max-h-32"
                                />
                                <button
                                    type="submit"
                                    disabled={!textInput.trim() || isTextLoading}
                                    className="absolute right-2 bottom-2 p-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isTextLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                </button>
                            </form>
                        )}
                    </div>
                </div>

                {/* Right Panel: Context & Instructions */}
                <div className="w-80 space-y-6 flex flex-col">
                    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                             <TrendingUp className="w-3 h-3" />
                             Review Guidelines
                        </h3>
                        <div className="space-y-4">
                             <div className="flex gap-3">
                                <div className="w-5 h-5 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0 text-[10px] font-bold">1</div>
                                <p className="text-xs text-gray-600 leading-relaxed font-medium">Test different responses to see how the AI adapts.</p>
                             </div>
                             <div className="flex gap-3">
                                <div className="w-5 h-5 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0 text-[10px] font-bold">2</div>
                                <p className="text-xs text-gray-600 leading-relaxed font-medium">Verify the tone matches your brand.</p>
                             </div>
                             <div className="flex gap-3">
                                <div className="w-5 h-5 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0 text-[10px] font-bold">3</div>
                                <p className="text-xs text-gray-600 leading-relaxed font-medium">Use "Feedback & Retry" to make improvements.</p>
                             </div>
                        </div>
                    </div>

                    {/* Sample Progress Card */}
                    <div className="bg-gradient-to-br from-gray-900 to-gray-800 p-6 rounded-3xl text-white shadow-lg space-y-4">
                        <h3 className="text-sm font-bold flex items-center gap-2">
                            <Sparkles className="w-4 h-4" />
                            Sample Progress
                        </h3>
                        <div className="space-y-3">
                            {[1, 2, 3].map((num) => {
                                const isCompleted = num <= (survey?.sampleConversationCount || 0);
                                const isCurrent = num === currentSampleNumber;
                                return (
                                    <div key={num} className="flex items-center gap-3">
                                        <div className={cn(
                                            "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                                            isCompleted ? "bg-emerald-500" : isCurrent ? "bg-blue-500" : "bg-white/20"
                                        )}>
                                            {isCompleted ? <CheckCircle className="w-4 h-4" /> : num}
                                        </div>
                                        <span className={cn(
                                            "text-sm",
                                            isCompleted ? "text-emerald-300" : isCurrent ? "text-white font-medium" : "text-white/50"
                                        )}>
                                            {isCompleted ? "Completed" : isCurrent ? "In Progress" : "Not started"}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="bg-emerald-600 p-6 rounded-3xl text-white shadow-lg space-y-3 relative overflow-hidden">
                        <div className="absolute -bottom-4 -right-4 opacity-20">
                            <CheckCircle className="w-24 h-24" />
                        </div>
                        <h3 className="text-sm font-bold flex items-center gap-2">
                            <AlertCircle className="w-4 h-4" />
                            Ready to Launch?
                        </h3>
                        <p className="text-xs text-emerald-100 leading-relaxed font-medium">
                            Once satisfied with the conversation flow, click "Publish Survey" to generate your shareable link.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
