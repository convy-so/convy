"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Mic,
  MicOff,
  Volume2,
  Loader2,
  ArrowLeft,
  CheckCircle,
  MessageSquare,
  Sparkles,
  RefreshCcw,
  Send,
  User,
  Bot,
  ChevronRight,
  TrendingUp,
  AlertCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import { useAuth } from "@/components/providers/auth-provider";
import { useVoiceWebSocket } from "@/hooks/use-voice-websocket";

type Message = {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: string;
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

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // WebSocket Hook for Sample Conversation
    const voiceWs = useVoiceWebSocket({
        url: `ws://localhost:3001/voice/sample-conversation?surveyId=${surveyId}&token=${user?.id}`,
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
                    if (data.survey?.isVoice) {
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

    const handleConfirm = async () => {
        if (!confirm("Are you satisfied with the conversation flow? This will mark the survey as reviewed and ready for publishing.")) return;
        
        setIsConfirming(true);
        try {
            const response = await fetch(`/api/surveys/${surveyId}/status`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "active" }),
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
        <div className="flex flex-col h-[calc(100vh-4rem)] max-w-5xl mx-auto py-6 space-y-6">
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
                        <h1 className="text-xl font-bold text-gray-900 tracking-tight">Rehearsal: {survey?.title}</h1>
                        <p className="text-sm text-gray-500 font-medium">Verify your survey flow before going live</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button 
                         onClick={() => {
                            voiceWs.disconnect();
                            voiceWs.connect();
                            setMessages([]);
                         }}
                         className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 font-medium transition-colors"
                    >
                        <RefreshCcw className="w-4 h-4" />
                        Restart
                    </button>
                    <button 
                        onClick={handleConfirm}
                        disabled={isConfirming || messages.length < 2}
                        className="flex items-center gap-2 px-6 py-2.5 bg-gray-900 text-white rounded-xl font-bold hover:bg-gray-800 disabled:opacity-50 transition-all shadow-md active:scale-95"
                    >
                        {isConfirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                        Confirm & Publish
                    </button>
                </div>
            </div>

            <div className="flex flex-1 gap-6 overflow-hidden min-h-0">
                {/* Chat Panel */}
                <div className="flex-1 flex flex-col bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
                        {messages.length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-60">
                                <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center">
                                    <MessageSquare className="w-8 h-8 text-gray-300" />
                                </div>
                                <div className="space-y-1">
                                    <p className="font-semibold text-gray-900">Start the conversation</p>
                                    <p className="text-sm text-gray-500 max-w-[240px]">Connect your voice and say hello to test the survey agent.</p>
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
                                </div>
                            </div>
                        ))}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Footer / Input Area */}
                    <div className="p-6 bg-gray-50/50 border-t border-gray-100">
                        <div className="flex flex-col items-center gap-6">
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
                                <p className="text-xs text-gray-600 leading-relaxed font-medium">Test different responses to see how the AI adapts its follow-ups.</p>
                             </div>
                             <div className="flex gap-3">
                                <div className="w-5 h-5 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0 text-[10px] font-bold">2</div>
                                <p className="text-xs text-gray-600 leading-relaxed font-medium">Verify the tone matches your brand and survey objectives.</p>
                             </div>
                             <div className="flex gap-3">
                                <div className="w-5 h-5 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0 text-[10px] font-bold">3</div>
                                <p className="text-xs text-gray-600 leading-relaxed font-medium">Acknowledge any media items if present in the survey logic.</p>
                             </div>
                        </div>
                    </div>

                    <div className="bg-blue-600 p-6 rounded-3xl text-white shadow-lg space-y-3 relative overflow-hidden">
                        <div className="absolute -bottom-4 -right-4 opacity-20">
                            <Sparkles className="w-24 h-24" />
                        </div>
                        <h3 className="text-sm font-bold flex items-center gap-2">
                            <AlertCircle className="w-4 h-4" />
                            Next Step
                        </h3>
                        <p className="text-xs text-blue-100 leading-relaxed font-medium">
                            Once you've verified the flow, click "Confirm & Publish" to generate your shareable link and start collecting real responses.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
