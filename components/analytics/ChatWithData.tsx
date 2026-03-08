"use client";

import { useChat } from "@ai-sdk/react";
import { UIMessage, DefaultChatTransport, isTextUIPart, isToolUIPart, getToolName } from "ai";
import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    History,
    ChevronDown,
    PlusCircle,
    Bot,
    User,
    Loader2,
    Send,
    Search,
    Table,
    BarChart2,
    Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
    GenerativeAnalyticsRenderer,
    RenderChartResult,
    RenderTableResult
} from "./GenerativeAnalytics";
import { ClientT } from "@/components/i18n/client-t";
import { getClientTranslation } from "@/app/actions/translate";

interface ChatSession {
    id: string;
    title: string;
    updatedAt: string;
    messages: ChatMessage[];
}

interface ChatWithDataProps {
    surveyId: string;
}

type MyUITools = {
    renderChart: { input: Record<string, unknown>; output: RenderChartResult };
    renderTable: { input: Record<string, unknown>; output: RenderTableResult };
};

type ChatMessage = UIMessage<unknown, Record<string, unknown>, MyUITools>;

function SuggestionPill({ icon: Icon, label }: { icon: React.ElementType, label: string }) {
    return (
        <button className="flex items-center gap-2 px-4 py-2 bg-gray-50 border border-gray-100 rounded-full text-xs font-bold text-gray-500 hover:bg-white hover:border-gray-900 hover:text-gray-900 transition-all whitespace-nowrap">
            <Icon className="w-3.5 h-3.5" />
            <ClientT>{label}</ClientT>
        </button>
    );
}

export function ChatWithData({ surveyId }: ChatWithDataProps) {
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [isSessionsOpen, setIsSessionsOpen] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [input, setInput] = useState("");
    const [chatPlaceholder, setChatPlaceholder] = useState("Ask anything about your data...");

    useEffect(() => {
        getClientTranslation("Ask anything about your data...").then(setChatPlaceholder);
    }, []);

    // 1. Fetch past sessions
    const { data: sessionsData, refetch: refetchSessions } = useQuery({
        queryKey: ["chat-sessions", surveyId],
        queryFn: async () => {
            const res = await fetch(`/api/surveys/${surveyId}/analytics/chat-sessions`);
            if (!res.ok) throw new Error("Failed to fetch sessions");
            return res.json() as Promise<{ sessions: ChatSession[] }>;
        },
    });

    // 2. Initialize Chat
    const { messages, setMessages, sendMessage, status } = useChat<ChatMessage>({
        transport: new DefaultChatTransport({
            api: `/api/surveys/${surveyId}/analytics/chat`,
        }),
        onFinish: async ({ message, messages }) => {
            // Save session on finish
            saveSession([...messages, message]);
        },
    });

    const isLoading = status === "streaming" || status === "submitted";

    // 3. Save session to DB
    const saveSession = async (currentMessages: ChatMessage[]) => {
        try {
            const res = await fetch(`/api/surveys/${surveyId}/analytics/chat-sessions`, {
                method: "POST",
                body: JSON.stringify({
                    sessionId: currentSessionId,
                    messages: currentMessages,
                }),
            });
            if (res.ok) {
                const { session } = await res.json();
                if (!currentSessionId) {
                    setCurrentSessionId(session.id);
                    refetchSessions();
                }
            }
        } catch (error) {
            console.error("Failed to save session:", error);
        }
    };

    // 4. Load a session
    const loadSession = async (sessionId: string) => {
        try {
            const res = await fetch(`/api/surveys/${surveyId}/analytics/chat-sessions/${sessionId}`);
            if (res.ok) {
                const { session } = await res.json();
                setMessages(session.messages || []);
                setCurrentSessionId(session.id);
            }
        } catch (e) {
            console.error("Failed to load session:", e);
        }
    };

    const handleNewChat = () => {
        setMessages([]);
        setCurrentSessionId(null);
        setInput("");
    };

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!input.trim() || isLoading) return;

        const text = input;
        setInput("");
        sendMessage({ role: "user", parts: [{ type: "text", text }] });
    };

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const [welcomeMessage, setWelcomeMessage] = useState<ChatMessage | null>(null);

    useEffect(() => {
        getClientTranslation("Hi! I'm your research assistant. I can help you analyze your data, find patterns, or visualize specific metrics. What would you like to explore today?")
            .then(text => setWelcomeMessage({
                id: "welcome",
                role: "assistant",
                parts: [{ type: "text", text }],
            }));
    }, []);

    const allMessages = messages.length === 0 ? (welcomeMessage ? [welcomeMessage] : []) : messages;

    const getTextContent = (m: ChatMessage) => {
        return m.parts
            .filter(isTextUIPart)
            .map(p => p.text)
            .join("\n");
    };

    return (
        <div className="flex flex-col h-full bg-white">
            {/* Session Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
                <div className="relative">
                    <button
                        onClick={() => setIsSessionsOpen(!isSessionsOpen)}
                        className="flex items-center gap-2 px-4 py-2 hover:bg-gray-50 rounded-full transition-all text-sm font-bold text-gray-900"
                    >
                        <History className="w-4 h-4 text-gray-400" />
                        {currentSessionId
                            ? sessionsData?.sessions.find(s => s.id === currentSessionId)?.title || <ClientT>Current Chat</ClientT>
                            : <ClientT>New Exploration</ClientT>}
                        <ChevronDown className={cn("w-4 h-4 text-gray-400 transition-transform", isSessionsOpen && "rotate-180")} />
                    </button>

                    {isSessionsOpen && (
                        <div className="absolute top-full left-0 mt-2 w-72 bg-white border border-gray-100 rounded-3xl shadow-2xl z-50 p-2 overflow-hidden">
                            <div className="max-h-64 overflow-y-auto custom-scrollbar">
                                {sessionsData?.sessions.length === 0 ? (
                                    <div className="p-4 text-xs text-gray-400 text-center italic"><ClientT>No past sessions</ClientT></div>
                                ) : (
                                    sessionsData?.sessions.map((s) => (
                                        <button
                                            key={s.id}
                                            onClick={() => {
                                                loadSession(s.id);
                                                setIsSessionsOpen(false);
                                            }}
                                            className="w-full text-left px-4 py-3 hover:bg-gray-50 rounded-2xl transition-all group"
                                        >
                                            <div className="text-xs font-bold text-gray-900 truncate">{s.title}</div>
                                            <div className="text-[10px] text-gray-400 mt-0.5">{new Date(s.updatedAt).toLocaleDateString()}</div>
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <button
                    onClick={handleNewChat}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-900 transition-colors"
                >
                    <PlusCircle className="w-4 h-4" />
                    <ClientT>New Chat</ClientT>
                </button>
            </div>

            {/* Messages Area */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8"
            >
                {allMessages.map((m: ChatMessage) => (
                    <div
                        key={m.id}
                        className={cn(
                            "flex gap-4 max-w-4xl mx-auto",
                            m.role === "user" ? "justify-end" : "justify-start"
                        )}
                    >
                        {m.role === "assistant" && (
                            <div className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center flex-shrink-0 mt-1">
                                <Bot className="w-4 h-4 text-white" />
                            </div>
                        )}

                        <div className={cn(
                            "space-y-4",
                            m.role === "user" ? "max-w-[80%]" : "max-w-full flex-1"
                        )}>
                            {getTextContent(m) && (
                                <div className={cn(
                                    "p-5 rounded-[2rem] text-sm leading-relaxed",
                                    m.role === "user"
                                        ? "bg-gray-900 text-white font-medium"
                                        : "text-gray-900 bg-transparent p-0"
                                )}>
                                    {getTextContent(m)}
                                </div>
                            )}

                            {/* Handle Tool Invocations from parts */}
                            {m.parts.filter(isToolUIPart).map((part) => (
                                <div
                                    key={part.toolCallId}
                                    className="mt-4 rounded-[2.5rem] bg-[#F2F5F8] overflow-hidden p-8 border border-[#E5E9EE]"
                                >
                                    {part.state === "output-available" ? (
                                        <GenerativeAnalyticsRenderer
                                            toolName={getToolName(part)}
                                            result={(part as { output: RenderChartResult | RenderTableResult }).output}
                                        />
                                    ) : (
                                        <div className="flex items-center gap-3 text-sm text-gray-400 font-bold italic animate-pulse">
                                            <Sparkles className="w-4 h-4" />
                                            <ClientT>Synthesizing</ClientT> {getToolName(part).replace("render", "").toLowerCase()}...
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {m.role === "user" && (
                            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-1">
                                <User className="w-4 h-4 text-gray-500" />
                            </div>
                        )}
                    </div>
                ))}
                {isLoading && !allMessages[allMessages.length - 1]?.parts.some(isToolUIPart) && (
                    <div className="flex gap-4 max-w-4xl mx-auto">
                        <div className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center flex-shrink-0 animate-pulse">
                            <Bot className="w-4 h-4 text-white" />
                        </div>
                        <div className="p-2">
                            <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
                        </div>
                    </div>
                )}
            </div>

            {/* Input Area */}
            <div className="p-6 border-t border-gray-100 flex-shrink-0">
                <form
                    onSubmit={handleSubmit}
                    className="max-w-4xl mx-auto relative group"
                >
                    <input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={chatPlaceholder}
                        disabled={isLoading}
                        className="w-full pl-6 pr-16 py-5 bg-[#F2F5F8] focus:bg-white border-2 border-transparent focus:border-gray-900 rounded-[2rem] text-sm font-medium transition-all outline-none"
                    />
                    <button
                        type="submit"
                        disabled={!input.trim() || isLoading}
                        className="absolute right-3 top-2.5 p-3 h-12 w-12 bg-gray-900 text-white rounded-full flex items-center justify-center hover:bg-black transition-all disabled:opacity-50 disabled:bg-gray-200"
                    >
                        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                    </button>
                </form>
                <div className="max-w-4xl mx-auto flex gap-4 mt-6 overflow-x-auto pb-2 px-2 no-scrollbar">
                    <SuggestionPill icon={Search} label="Finding trends" />
                    <SuggestionPill icon={Table} label="Pivot data" />
                    <SuggestionPill icon={BarChart2} label="Visualize metrics" />
                    <SuggestionPill icon={Sparkles} label="AI Insights" />
                </div>
            </div>
        </div>
    );
}

