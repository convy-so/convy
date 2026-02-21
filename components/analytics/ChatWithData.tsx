"use client";

import { useChat } from "@ai-sdk/react";
import { UIMessage as SDKMessage, DefaultChatTransport } from "ai";
import { useState, useRef, useEffect } from "react";
import { X, Send, Bot, User, Loader2, Sparkles, Search } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { GenerativeAnalyticsRenderer } from "./GenerativeAnalytics";

// Define local UIMessage type to match SDK v6 usage in the project
type UIMessage = SDKMessage & {
    content?: string;
    parts?: any[];
    timestamp?: number;
};

interface ChatWithDataProps {
    surveyId: string;
}

export function ChatWithData({ surveyId }: ChatWithDataProps) {
    const [isOpen, setIsOpen] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    const { messages, input, handleInputChange, handleSubmit, status } = useChat({
        id: `analytics-chat-${surveyId}`,
        transport: new DefaultChatTransport({
            api: `/api/surveys/${surveyId}/analytics/chat`,
        }),
        messages: [
            {
                id: "welcome",
                role: "assistant",
                content: "Hi! I'm your data assistant. Ask me anything about your survey results, patterns, or respondent feedback!",
                parts: [{ type: 'text', text: "Hi! I'm your data assistant. Ask me anything about your survey results, patterns, or respondent feedback!" }]
            } as any,
        ],
    }) as any;

    const isLoading = status === "streaming" || status === "submitted";

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isLoading]);

    return (
        <>
            {/* Floating Toggle Button */}
            <div className="fixed bottom-8 right-8 z-50">
                {!isOpen && (
                    <div className="absolute -top-12 right-0 bg-black text-white text-[10px] font-bold px-3 py-1.5 rounded-full whitespace-nowrap animate-bounce shadow-xl uppercase tracking-wider">
                        Chat with data
                    </div>
                )}
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className={cn(
                        "w-16 h-16 rounded-full shadow-[0_20px_50px_rgba(0,0,0,0.3)] flex items-center justify-center transition-all duration-300",
                        isOpen ? "bg-black text-white rotate-90 scale-90" : "bg-black text-white hover:scale-110 active:scale-95"
                    )}
                >
                    {isOpen ? <X className="w-8 h-8" /> : <Sparkles className="w-8 h-8" />}
                </button>
            </div>

            {/* Chat Window */}
            {isOpen && (
                <div className="fixed bottom-28 right-8 w-[450px] max-w-[calc(100vw-4rem)] max-h-[calc(100vh-10rem)] h-[700px] bg-white rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.2)] border border-gray-100 flex flex-col overflow-hidden z-50 animate-in slide-in-from-bottom-8 fade-in duration-500">
                    {/* Header */}
                    <div className="p-6 border-b border-gray-100 bg-white/50 backdrop-blur-md flex items-center justify-between sticky top-0 z-10">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-black flex items-center justify-center shadow-lg">
                                <Bot className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-900 leading-none">Data Assistant</h3>
                                <div className="flex items-center gap-1.5 mt-1">
                                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Online & Analyzing</p>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="w-10 h-10 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-900 transition-all"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Messages */}
                    <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth">
                        {messages.map((m: UIMessage) => (
                            <div key={m.id} className={cn("flex gap-3", m.role === "user" ? "flex-row-reverse" : "flex-row")}>
                                <div className={cn(
                                    "w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-1",
                                    m.role === "user" ? "bg-gray-100" : "bg-black"
                                )}>
                                    {m.role === "user" ? <User className="w-4 h-4 text-gray-500" /> : <Bot className="w-4 h-4 text-white" />}
                                </div>
                                <div className="flex flex-col gap-2 max-w-[85%]">
                                    <div className={cn(
                                        "p-4 rounded-3xl text-sm leading-relaxed",
                                        m.role === "user"
                                            ? "bg-black text-white rounded-tr-none shadow-xl"
                                            : "bg-gray-50 text-gray-800 rounded-tl-none border border-gray-100"
                                    )}>
                                        <div className="prose prose-sm prose-gray max-w-none break-words">
                                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                {m.content || ""}
                                            </ReactMarkdown>
                                        </div>

                                        {/* Tool Invocations Display */}
                                        {m.parts?.filter(p => p.type === 'tool-call').map((toolInvocation: any) => {
                                            const { toolCallId, state, toolName } = toolInvocation;

                                            if (state === 'call') {
                                                const isSearch = toolName === 'searchSurveyData';
                                                return (
                                                    <div key={toolCallId} className="flex items-center gap-2 mt-3 p-2 bg-black/5 rounded-xl text-xs font-medium border border-black/5 animate-pulse">
                                                        {isSearch ? <Search className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
                                                        <span>{isSearch ? "Searching survey data..." : "Visualizing patterns..."}</span>
                                                    </div>
                                                );
                                            }

                                            return null;
                                        })}

                                        {/* Tool Results Display */}
                                        {m.parts?.filter(p => p.type === 'tool-result').map((toolResult: any) => (
                                            <GenerativeAnalyticsRenderer
                                                key={toolResult.toolCallId}
                                                toolName={toolResult.toolName}
                                                result={toolResult.result}
                                            />
                                        ))}
                                    </div>
                                    <span className="text-[9px] font-bold text-gray-300 uppercase tracking-widest px-2">
                                        {m.role === 'user' ? 'You' : 'Assistant'}
                                    </span>
                                </div>
                            </div>
                        ))}
                        {isLoading && !messages[messages.length - 1]?.content && (
                            <div className="flex gap-3">
                                <div className="w-8 h-8 rounded-xl bg-black flex items-center justify-center animate-pulse">
                                    <Bot className="w-4 h-4 text-white" />
                                </div>
                                <div className="flex flex-col gap-2 flex-1">
                                    <div className="h-4 w-3/4 bg-gray-100 rounded-full animate-pulse" />
                                    <div className="h-4 w-1/2 bg-gray-100 rounded-full animate-pulse" />
                                    <div className="h-4 w-5/6 bg-gray-100 rounded-full animate-pulse" />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Input */}
                    <div className="p-6 bg-gradient-to-t from-white via-white to-transparent pt-10">
                        <form onSubmit={handleSubmit} className="relative group">
                            <input
                                value={input}
                                onChange={handleInputChange}
                                placeholder="Ask about patterns, sentiment, or feedback..."
                                className="w-full bg-gray-50 border border-gray-100 rounded-[2rem] pl-6 pr-14 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-black/2 focus:bg-white focus:border-gray-200 transition-all group-hover:border-gray-200 shadow-inner"
                            />
                            <button
                                type="submit"
                                disabled={isLoading || !input.trim()}
                                className="absolute right-2 top-2 w-10 h-10 bg-black text-white rounded-full flex items-center justify-center hover:scale-105 active:scale-95 disabled:bg-gray-100 disabled:text-gray-400 disabled:hover:scale-100 transition-all shadow-lg"
                            >
                                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                            </button>
                        </form>
                        <div className="flex items-center justify-center gap-4 mt-4">
                            <div className="h-px bg-gray-100 flex-1" />
                            <p className="text-[9px] font-bold text-gray-300 uppercase tracking-widest whitespace-nowrap">
                                Convy RAG Integrated
                            </p>
                            <div className="h-px bg-gray-100 flex-1" />
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
