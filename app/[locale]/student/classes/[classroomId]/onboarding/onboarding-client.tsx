"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Sparkles, Brain, Send, ChevronRight, CheckCircle2 } from "lucide-react";
import { useLocale } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { fetchOnboardingState } from "@/lib/api/learning";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

type Props = {
    classroomId: string;
    membershipId: string;
    initialOnboardingState: any;
};

function toTextUIMessages(messages: any[] | undefined): UIMessage[] {
    return (messages ?? []).flatMap((message) => {
        if (message.role !== "assistant" && message.role !== "user") {
            return [];
        }
        return [
            {
                id: message.id,
                role: message.role,
                parts: [{ type: "text", text: message.content }],
                annotations: message.metadata ? [{ type: "metadata", data: message.metadata }] : [],
            } as UIMessage,
        ];
    });
}

export function StudentOnboardingClient({ classroomId, membershipId, initialOnboardingState }: Props) {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [input, setInput] = useState("");
    const chatContainerRef = useRef<HTMLDivElement>(null);

    const onboardingQuery = useQuery({
        queryKey: queryKeys.learning.onboarding,
        queryFn: fetchOnboardingState,
        initialData: initialOnboardingState,
        staleTime: 30_000,
    });

    const isCompleted = onboardingQuery.data?.completed;

    const initialMessages = useMemo(() => {
        return onboardingQuery.data && !onboardingQuery.data.completed
            ? toTextUIMessages(onboardingQuery.data.messages)
            : [];
    }, [onboardingQuery.data]);

    const onboardingTransport = useMemo(() => {
        return new DefaultChatTransport({ api: "/api/learning/onboarding" });
    }, []);

    const {
        messages: chatMessages,
        sendMessage,
        status,
    } = useChat({
        id: `learning-onboarding-${membershipId}`,
        messages: initialMessages,
        transport: onboardingTransport,
    });

    // Auto-scroll to bottom of chat
    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [chatMessages]);

    // Handle completed state
    useEffect(() => {
        if (isCompleted) {
            void Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.learning.me }),
                queryClient.invalidateQueries({ queryKey: queryKeys.learning.onboarding }),
            ]);
            
            const timer = setTimeout(() => {
                router.replace(`/student/classes/${classroomId}/sessions`);
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [isCompleted, router, classroomId, queryClient]);

    return (
        <div className="min-h-[85vh] flex items-center justify-center p-4">
            <AnimatePresence mode="wait">
                {isCompleted ? (
                    <motion.div 
                        key="success"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        className="bg-white border border-slate-100 rounded-3xl p-12 max-w-md w-full text-center shadow-xl shadow-slate-200/50 space-y-6"
                    >
                        <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto shadow-inner">
                            <CheckCircle2 className="w-12 h-12" />
                        </div>
                        <div className="space-y-2">
                            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">AI Calibration Complete!</h2>
                            <p className="text-slate-500 text-sm font-semibold leading-relaxed">
                                Your learning profile has been successfully generated. We are now preparing your classroom workspace.
                            </p>
                        </div>
                        <div className="flex justify-center pt-2">
                            <div className="flex gap-1.5 items-center text-xs font-extrabold uppercase text-slate-400 tracking-widest animate-pulse">
                                Entering Classroom <ChevronRight className="h-4 w-4" />
                            </div>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div 
                        key="chat"
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="bg-white border border-slate-100 rounded-[2.5rem] shadow-xl shadow-slate-200/30 max-w-4xl w-full grid grid-cols-1 md:grid-cols-5 overflow-hidden min-h-[600px]"
                    >
                        {/* Info rail */}
                        <div className="md:col-span-2 bg-gradient-to-br from-indigo-600 to-indigo-800 p-8 text-white flex flex-col justify-between">
                            <div className="space-y-6">
                                <div className="h-12 w-12 rounded-2xl bg-white/10 flex items-center justify-center border border-white/20">
                                    <Brain className="h-6 w-6" />
                                </div>
                                <div className="space-y-3">
                                    <h2 className="text-2xl font-extrabold tracking-tight leading-tight">
                                        Configure Your Learning Style
                                    </h2>
                                    <p className="text-indigo-100 text-sm leading-relaxed font-semibold">
                                        Chat with our calibration AI to build your customized cognitive style model. This adapts tutoring interfaces, struggle parameters, and explanations specifically for you.
                                    </p>
                                </div>
                            </div>
                            <div className="text-xs font-bold text-indigo-200/60 uppercase tracking-widest">
                                Convy Personalization Engine
                            </div>
                        </div>

                        {/* Chat workspace */}
                        <div className="md:col-span-3 flex flex-col h-[600px]">
                            {/* Chat Header */}
                            <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
                                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                                    Calibration Assistant Active
                                </span>
                            </div>

                            {/* Scrollable messages */}
                            <div 
                                ref={chatContainerRef}
                                className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-slate-50/20"
                            >
                                {chatMessages.map((msg) => (
                                    <div 
                                        key={msg.id} 
                                        className={cn(
                                            "max-w-[85%] px-5 py-4 rounded-2xl text-xs font-semibold leading-relaxed shadow-sm w-fit",
                                            msg.role === "assistant" 
                                                ? "bg-white text-slate-700 border border-slate-100 rounded-tl-none mr-auto" 
                                                : "ml-auto bg-slate-900 text-white rounded-tr-none"
                                        )}
                                    >
                                        {msg.parts?.map((part, index) => part.type === "text" && part.text).join("") || (msg as any).content}
                                    </div>
                                ))}
                            </div>

                            {/* Chat Input form */}
                            <div className="p-6 border-t border-slate-100 bg-white">
                                <form 
                                    className="flex gap-3" 
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        if (!input.trim()) return;
                                        sendMessage({ text: input.trim() });
                                        setInput("");
                                    }}
                                >
                                    <input
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        placeholder="Share how you learn best, preferred subjects, etc..."
                                        className="flex-1 bg-slate-50 border-none rounded-xl px-5 py-3.5 text-xs font-semibold focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                                    />
                                    <button 
                                        disabled={status === "streaming"}
                                        className="w-12 h-12 bg-slate-900 hover:bg-slate-800 text-white rounded-xl flex items-center justify-center transition-all disabled:opacity-50"
                                    >
                                        <Send className="w-4.5 h-4.5" />
                                    </button>
                                </form>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
