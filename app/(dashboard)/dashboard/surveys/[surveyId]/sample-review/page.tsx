"use client";

import { clientEnv } from "@/lib/env.client";

import { useState, useRef, useEffect, FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
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
import { useAuth } from "@/components/providers/auth-provider";
import { useVoiceWebSocket } from "@/hooks/use-voice-websocket";
import { MediaDisplay } from "@/components/surveys/media-display";
import { useQuery, useMutation } from "@tanstack/react-query";

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

    const [messages, setMessages] = useState<Message[]>([]);
    const [isConfirming, setIsConfirming] = useState(false);
    const [feedback, setFeedback] = useState("");
    // showFeedbackModal is removed as we are moving it to sidebar
    const [isRetrying, setIsRetrying] = useState(false);
    const [inputMode, setInputMode] = useState<"voice" | "text">("voice");
    const [textInput, setTextInput] = useState("");
    const [isTextLoading, setIsTextLoading] = useState(false);
    const [hasAutoGreeted, setHasAutoGreeted] = useState(false);
    const [showTranscript, setShowTranscript] = useState(true);

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

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Check for completion token - cleaned up logic since we don't have a modal to open
    useEffect(() => {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg?.role === "assistant" && lastMsg.content.includes("[[SURVEY_COMPLETED]]")) {
            const cleanedContent = lastMsg.content.replace("[[SURVEY_COMPLETED]]", "").trim();
            setMessages(prev => {
                const newMessages = [...prev];
                newMessages[newMessages.length - 1] = {
                    ...lastMsg,
                    content: cleanedContent
                };
                return newMessages;
            });
            
            toast.success("Conversation finished! You can now refine or publish.");
        }
    }, [messages]);

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

    // Auto-greeting mutation for text mode
    const greetingMutation = useMutation({
        mutationFn: async () => {
            const response = await fetch(`/api/surveys/${surveyId}/sample`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: [],
                    conversationNumber: currentSampleNumber,
                }),
            });
            if (!response.ok) throw new Error("Failed to get greeting");
            return response.body;
        },
        onSuccess: async (stream) => {
            if (!stream) return;
            const reader = stream.getReader();
            const decoder = new TextDecoder();
            let greetingContent = "";
            const greetingId = Date.now().toString();
            
            // Add placeholder message
            setMessages(prev => [...prev, {
                id: greetingId,
                role: "assistant",
                content: "",
                timestamp: new Date().toISOString()
            }]);

            // Stream the greeting
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                greetingContent += chunk;
                
                setMessages(prev => prev.map(m => 
                    m.id === greetingId 
                        ? { ...m, content: greetingContent }
                        : m
                ));
            }
        },
        onError: () => {
            toast.error("Failed to start conversation");
        }
    });

    // Auto-connect voice or trigger text greeting when survey loads
    useEffect(() => {
        if (!survey || hasAutoGreeted) return;
        
        if (inputMode === "voice" && survey.isVoice) {
            setShowTranscript(false);
            voiceWs.connect();
        } else if (inputMode === "text" && messages.length === 0) {
            greetingMutation.mutate();
        }
        
        setHasAutoGreeted(true);
    }, [survey, inputMode, hasAutoGreeted]);

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
                     setTimeout(() => greetingMutation.mutate(), 500);
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
                            <span className="text-xs text-gray-500 font-medium">Sample Conversation Review</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {inputMode === "voice" && (
                             <button
                                onClick={() => setShowTranscript(!showTranscript)}
                                className="px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                {showTranscript ? "Hide Text" : "Show Text"}
                            </button>
                        )}
                        <button 
                            onClick={handleConfirm}
                            disabled={isConfirming || messages.length < 2}
                            className="flex items-center gap-2 px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-black transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isConfirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                            Publish Survey
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
                                    {voiceWs.isRecording ? "Listening..." : voiceWs.isPlaying ? "AI Speaking..." : "Tap to speak"}
                                </p>
                                <p className="text-gray-500">
                                    {voiceWs.status === "connected" 
                                        ? "Speak continuously. The AI will respond naturally." 
                                        : "Connecting to voice service..."}
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
                                        <p className="text-sm font-medium text-gray-900">Start the conversation</p>
                                        <p className="text-xs text-gray-500">
                                            {inputMode === "voice" 
                                                ? "Tap the microphone below to start speaking."
                                                : "Type a greeting to begin the test."}
                                        </p>
                                    </div>
                                </div>
                            )}
                            
                            {messages.map((msg) => (
                                <div key={msg.id} className={cn("flex flex-col gap-2 max-w-[85%]", msg.role === "user" ? "self-end items-end" : "self-start items-start")}>
                                    <div className={cn(
                                        "px-5 py-3 rounded-2xl text-[15px] leading-relaxed shadow-sm",
                                        msg.role === "assistant" 
                                            ? "bg-gray-50 text-gray-800 rounded-tl-sm border border-gray-100" 
                                            : "bg-black text-white rounded-tr-sm"
                                    )}>
                                        {msg.content}
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
                                <Volume2 className="w-3 h-3" /> Voice
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
                                <Keyboard className="w-3 h-3" /> Text
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
                                                    Live Transcription
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
                                            {voiceWs.isRecording ? (voiceWs.transcription || "Listening...") : (voiceWs.status !== "connected" ? "Connecting..." : "Tap to speak")}
                                        </p>
                                    </>
                                )}
                            </div>
                        ) : (
                            <form onSubmit={handleTextSubmit} className="relative">
                                <input
                                    value={textInput}
                                    onChange={(e) => setTextInput(e.target.value)}
                                    placeholder="Type your message..."
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
                    <div>
                        <h3 className="text-xs font-bold text-gray-900 uppercase tracking-widest mb-1 flex items-center gap-2">
                            <MessageSquare className="w-3 h-3 text-gray-500" />
                            Refine Simulation
                        </h3>
                        <p className="text-xs text-gray-500 leading-relaxed">
                            Not satisfied with the AI's behavior? Provide instructions below to adjust the next sample.
                        </p>
                    </div>

                    <div className="space-y-3">
                        <textarea
                            value={feedback}
                            onChange={(e) => setFeedback(e.target.value)}
                            placeholder="e.g. 'Be more concise', 'Ask about budget earlier', 'Don't use emojis'..."
                            className="w-full h-40 p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-gray-900/5 focus:border-gray-300 outline-none resize-none bg-white text-sm placeholder:text-gray-400"
                        />
                        
                        <div className="flex items-center justify-between text-xs text-gray-400 px-1">
                            <span>{feedback.length} chars</span>
                            <span>{samplesRemaining} retries left</span>
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
                            {isRetrying ? "Applying..." : "Update & Restart"}
                        </button>
                    </div>

                    {!canRetry && (
                       <div className="p-3 bg-amber-50 rounded-lg border border-amber-100 text-amber-800 text-xs">
                           You have used all available sample conversations. Please publish or edit the survey directly.
                       </div>
                    )}
                </div>
            </div>
        </div>
    );
}
