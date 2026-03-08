"use client";

import { useChat } from "@ai-sdk/react";
import {
    DefaultChatTransport,
    isTextUIPart,
    isToolUIPart,
    getToolName,
    UIMessage,
} from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    RefreshCw,
    Loader2,
    MessageSquare,
    AlertCircle,
    ChevronLeft,
    ChevronRight,
    CheckCircle,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import {
    GenerativeAnalyticsRenderer,
    type RenderChartResult,
    type RenderTableResult,
} from "./GenerativeAnalytics";
import { ClientT } from "@/components/i18n/client-t";

interface GenerativeSummaryProps {
    surveyId: string;
    surveyTitle: string;
}

type MyUITools = {
    renderChart: { input: Record<string, unknown>; output: RenderChartResult };
    renderTable: { input: Record<string, unknown>; output: RenderTableResult };
};

type ChatMessage = UIMessage<unknown, Record<string, unknown>, MyUITools>;

export function GenerativeSummary({ surveyId, surveyTitle }: GenerativeSummaryProps) {
    const hasInitialized = useRef(false);
    const [currentPage, setCurrentPage] = useState(0);
    const [upToDateMsg, setUpToDateMsg] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const { messages, sendMessage, status, error, setMessages } =
        useChat<ChatMessage>({
            transport: new DefaultChatTransport({
                api: `/api/surveys/${surveyId}/analytics/generative`,
            }),
            id: `analytics-${surveyId}`,
            onError: (err) => {
                console.error("Generative Summary Error:", err);
            },
        });

    const isLoading = status === "streaming" || status === "submitted";

    // Derive carousel slides from assistant messages only
    const slides = messages.filter((m) => m.role === "assistant");

    // ── Initial trigger ────────────────────────────────────────────────────
    useEffect(() => {
        if (!hasInitialized.current && messages.length === 0) {
            hasInitialized.current = true;
            sendMessage({
                role: "user",
                parts: [
                    {
                        type: "text",
                        text: `Generate a comprehensive survey intelligence report for "${surveyTitle}". Start with response statistics (total, completed, >50%, <50%). Then explain the metrics the creator set. If some info isn't collected yet, explicitly state it. Use charts and tables where they help. Keep language plain and readable.`,
                    },
                ],
            });
        }
    }, [messages.length, sendMessage, surveyTitle]);

    // ── Move to latest slide when a new AI message arrives ────────────────
    const prevSlidesCount = useRef(0);
    useEffect(() => {
        if (slides.length > prevSlidesCount.current) {
            // Move state update to next tick to avoid synchronous cascading renders
            // and satisfy react-hooks/set-state-in-effect
            const nextSlide = slides.length - 1;
            setTimeout(() => {
                setCurrentPage(nextSlide);
            }, 0);
        }
        prevSlidesCount.current = slides.length;
    }, [slides.length]);

    // ── WebSocket: listen for new-summary-ready ────────────────────────────
    // When the background worker finishes a new generation, it publishes
    // "new-summary-ready" via Redis pub/sub → WebSocket server → client.
    useEffect(() => {
        let ws: WebSocket | null = null;

        const connect = () => {
            const protocol = window.location.protocol === "https:" ? "wss" : "ws";
            ws = new WebSocket(`${protocol}://${window.location.host}/api/ws`);

            ws.onmessage = (event) => {
                try {
                    const payload = JSON.parse(event.data);
                    if (
                        payload.event === "new-summary-ready" &&
                        payload.surveyId === surveyId
                    ) {
                        // Reload messages from the server to get the new slide
                        setMessages([]);
                        hasInitialized.current = false;
                    }
                } catch {
                    // ignore non-JSON messages
                }
            };

            ws.onclose = () => {
                // Reconnect after 3s on unexpected close
                setTimeout(connect, 3000);
            };
        };

        connect();
        return () => ws?.close();
    }, [surveyId, setMessages]);

    // ── Manual refresh with check-delta guard ────────────────────────────
    const handleRefresh = useCallback(async () => {
        if (isLoading) return;

        try {
            const res = await fetch(
                `/api/surveys/${surveyId}/analytics/check-delta`,
            );
            const { changed } = (await res.json()) as { changed: boolean };

            if (!changed) {
                setUpToDateMsg(true);
                setTimeout(() => setUpToDateMsg(false), 3000);
                return;
            }
        } catch {
            // If check-delta fails, proceed normally
        }

        sendMessage({
            role: "user",
            parts: [
                {
                    type: "text",
                    text: "Background refresh: Check for new response data and summarize what has changed since your previous summary. Be specific about trends, shifts, or milestone counts.",
                },
            ],
        });
    }, [isLoading, sendMessage, surveyId]);

    const markdownComponents = useMemo(() => ({
        p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
            <p className="mb-4 text-[14px]" {...props} />
        ),
        h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
            <h1
                className="text-xl font-bold mt-8 mb-4 text-gray-900"
                {...props}
            />
        ),
        h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
            <h2
                className="text-lg font-bold mt-6 mb-3 text-gray-900"
                {...props}
            />
        ),
        h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
            <h3
                className="text-base font-bold mt-4 mb-2 text-gray-900"
                {...props}
            />
        ),
        ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
            <ul
                className="list-disc pl-5 mb-4 space-y-2 text-[14px]"
                {...props}
            />
        ),
        li: (props: React.LiHTMLAttributes<HTMLLIElement>) => (
            <li className="marker:text-gray-400" {...props} />
        ),
    }), []);

    // ── Error state ────────────────────────────────────────────────────────
    if (error && messages.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] text-red-500">
                <AlertCircle className="w-10 h-10 mb-4" />
                <p className="font-bold text-lg"><ClientT>Analysis Interrupted</ClientT></p>
                <p className="text-sm mt-1 text-gray-500">{error.message}</p>
                <button
                    onClick={() => {
                        setMessages([]);
                        hasInitialized.current = false;
                    }}
                    className="mt-6 px-6 py-2.5 bg-white border border-gray-200 rounded-full text-sm font-bold text-gray-900 hover:bg-gray-50 transition-all shadow-sm"
                >
                    <ClientT>Retry Analysis</ClientT>
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-20 animate-in fade-in duration-700 max-w-4xl mx-auto">
            {/* ── Utility Bar ─────────────────────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-6">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-gray-50 rounded-2xl">
                        <MessageSquare className="w-5 h-5 text-gray-900" />
                    </div>
                    <div>
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">
                            {slides.length > 0
                                ? <ClientT>{`${slides.length} snapshot${slides.length > 1 ? "s" : ""} • Slide ${currentPage + 1} of ${slides.length}`}</ClientT>
                                : <ClientT>Generating...</ClientT>}
                        </div>
                        <h2 className="text-lg font-bold text-gray-900 tracking-tight leading-none">
                            <ClientT>Automated Synthesis</ClientT>
                        </h2>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {upToDateMsg ? (
                        <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium animate-in fade-in duration-300">
                            <CheckCircle className="w-4 h-4" />
                            <ClientT>Data is fully up to date</ClientT>
                        </span>
                    ) : (
                        <button
                            onClick={handleRefresh}
                            disabled={isLoading}
                            className="flex items-center gap-2 px-4 py-2 hover:bg-gray-100 rounded-full transition-colors disabled:opacity-50 text-sm font-bold text-gray-700"
                            title="Refresh Insights"
                        >
                            <RefreshCw
                                className={cn(
                                    "w-4 h-4 text-gray-500",
                                    isLoading && "animate-spin",
                                )}
                            />
                            <ClientT>Refresh</ClientT>
                        </button>
                    )}
                    <Link
                        href={`/dashboard/surveys/${surveyId}/analytics/chat`}
                        className="flex items-center gap-2.5 px-6 py-2.5 bg-gray-900 text-white rounded-full text-sm font-bold hover:bg-black transition-all shadow-xl shadow-gray-200"
                    >
                        <MessageSquare className="w-4 h-4" />
                        <ClientT>Interactive Mode</ClientT>
                    </Link>
                </div>
            </div>

            {/* ── Carousel Viewport ────────────────────────────────────────────── */}
            <div className="relative overflow-hidden" ref={containerRef}>
                <div
                    className="flex transition-transform duration-500 ease-in-out"
                    style={{ transform: `translateX(-${currentPage * 100}%)` }}
                >
                    {slides.map((message) => (
                        <div
                            key={message.id}
                            className="w-full flex-shrink-0 prose prose-sm prose-gray max-w-none text-gray-800 leading-relaxed font-sans"
                        >
                            {message.parts.filter(isTextUIPart).map((part, index) => (
                                <ReactMarkdown
                                    key={index}
                                    components={markdownComponents}
                                >
                                    {part.text}
                                </ReactMarkdown>
                            ))}

                            {message.parts.filter(isToolUIPart).map((part, index) => {
                                const toolName = getToolName(part);
                                if (toolName === "renderChart" || toolName === "renderTable") {
                                    if (part.state === "output-available") {
                                        return (
                                            <div
                                                key={index}
                                                className="my-8 opacity-100 animate-in fade-in duration-500"
                                            >
                                                <GenerativeAnalyticsRenderer
                                                    toolName={toolName}
                                                    result={(part as { output: RenderChartResult | RenderTableResult }).output}
                                                />
                                            </div>
                                        );
                                    }
                                    return (
                                        <div
                                            key={index}
                                            className="my-6 p-4 rounded-xl bg-gray-50 border border-gray-100 flex items-center gap-3 text-gray-500 text-sm"
                                        >
                                            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                                            <ClientT>Generating visualization...</ClientT>
                                        </div>
                                    );
                                }
                                return null;
                            })}
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Loading State (no slides yet) ──────────────────────────────── */}
            {isLoading && slides.length === 0 && (
                <div className="flex flex-col items-center justify-center min-h-[300px] text-gray-400">
                    <Loader2 className="w-8 h-8 animate-spin mb-4 text-gray-900" />
                    <p className="text-sm"><ClientT>Synthesizing intelligence...</ClientT></p>
                </div>
            )}

            {/* ── Dot Navigation + Prev/Next ──────────────────────────────────── */}
            {slides.length > 1 && (
                <div className="flex items-center justify-center gap-4 pt-2">
                    <button
                        onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                        disabled={currentPage === 0}
                        className="p-1.5 rounded-full hover:bg-gray-100 disabled:opacity-30 transition-colors"
                        aria-label="Previous snapshot"
                    >
                        <ChevronLeft className="w-4 h-4 text-gray-500" />
                    </button>

                    <div className="flex items-center gap-2">
                        {slides.map((_, i) => (
                            <button
                                key={i}
                                onClick={() => setCurrentPage(i)}
                                aria-label={`Go to snapshot ${i + 1}`}
                                className={cn(
                                    "rounded-full transition-all duration-300",
                                    i === currentPage
                                        ? "w-5 h-2 bg-gray-900"
                                        : "w-2 h-2 bg-gray-300 hover:bg-gray-400",
                                )}
                            />
                        ))}
                    </div>

                    <button
                        onClick={() =>
                            setCurrentPage((p) => Math.min(slides.length - 1, p + 1))
                        }
                        disabled={currentPage === slides.length - 1}
                        className="p-1.5 rounded-full hover:bg-gray-100 disabled:opacity-30 transition-colors"
                        aria-label="Next snapshot"
                    >
                        <ChevronRight className="w-4 h-4 text-gray-500" />
                    </button>
                </div>
            )}

            {/* ── Streaming indicator (new slide loading) ─────────────────────── */}
            {isLoading && slides.length > 0 && (
                <div className="flex items-center justify-center gap-2 text-gray-400 text-sm pt-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <ClientT>Generating next snapshot...</ClientT>
                </div>
            )}
        </div>
    );
}
