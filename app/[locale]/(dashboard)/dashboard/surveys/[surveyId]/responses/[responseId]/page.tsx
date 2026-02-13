"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Link } from "@/i18n/routing";
import {
    ArrowLeft,
    User,
    ThumbsUp,
    ThumbsDown,
    Minus,
    Bot,
    Download,
    Loader2,
    Calendar,
    Clock
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface ResponseData {
    id: string;
    surveyId: string;
    surveyTitle: string;
    participantId: string;
    startedAt: string;
    completedAt: string | null;
    duration: string;
    status: "completed" | "in_progress";
    sentiment: "positive" | "negative" | "neutral" | null;
    sentimentScore: number;
    keyInsights: string[];
    summary: string;
    conversation: Array<{
        role: "user" | "assistant";
        content: string;
        timestamp: string;
        sentiment?: "positive" | "negative" | "neutral";
    }>;
}

export default function ResponseDetailPage() {
    const params = useParams();
    const surveyId = params.surveyId as string;
    const responseId = params.responseId as string;
    
    const [response, setResponse] = useState<ResponseData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchResponse() {
            try {
                const res = await fetch(`/api/surveys/${surveyId}/responses/${responseId}`);
                if (!res.ok) {
                    if (res.status === 404) throw new Error("Response not found");
                    throw new Error("Failed to load response data");
                }
                const data = await res.json();
                setResponse(data);
            } catch (err) {
                setError(err instanceof Error ? err.message : "An error occurred");
            } finally {
                setIsLoading(false);
            }
        }

        if (surveyId && responseId) {
            fetchResponse();
        }
    }, [surveyId, responseId]);

    const getSentimentIcon = (sentiment: string | null) => {
        switch (sentiment) {
            case "positive":
                return <ThumbsUp className="w-3.5 h-3.5 text-emerald-500" />;
            case "negative":
                return <ThumbsDown className="w-3.5 h-3.5 text-red-500" />;
            case "neutral":
                return <Minus className="w-3.5 h-3.5 text-amber-500" />;
            default:
                return null;
        }
    };

    const handleExport = async () => {
        if (!response) return;

        // Dynamically import xlsx to keep bundle size small
        const XLSX = await import("xlsx");

        // Prepare data for sheets
        const overviewData = [
            ["Participant ID", response.participantId],
            ["Survey Title", response.surveyTitle],
            ["Status", response.status],
            ["Duration", response.duration],
            ["Started At", format(new Date(response.startedAt), "yyyy-MM-dd HH:mm:ss")],
            ["Completed At", response.completedAt ? format(new Date(response.completedAt), "yyyy-MM-dd HH:mm:ss") : "N/A"],
            ["Sentiment", response.sentiment],
            ["Sentiment Score", `${(response.sentimentScore * 100).toFixed(1)}%`],
            ["Summary", response.summary],
        ];

        // Add Key Insights to Overview
        overviewData.push(["", ""]);
        overviewData.push(["Key Insights", ""]);
        response.keyInsights.forEach((insight, index) => {
            overviewData.push([`${index + 1}.`, insight]);
        });

        const transcriptData = response.conversation.map(msg => ({
            Role: msg.role === 'assistant' ? 'AI' : 'Participant',
            Content: msg.content,
            Timestamp: msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : '',
            Sentiment: msg.role === 'user' && msg.sentiment ? msg.sentiment : ''
        }));

        // Create workbook
        const wb = XLSX.utils.book_new();

        // Create sheets
        const wsOverview = XLSX.utils.aoa_to_sheet(overviewData);
        const wsTranscript = XLSX.utils.json_to_sheet(transcriptData);

        // Adjust column widths for better readability
        wsOverview['!cols'] = [{ wch: 20 }, { wch: 80 }];
        wsTranscript['!cols'] = [{ wch: 10 }, { wch: 100 }, { wch: 15 }, { wch: 10 }];

        // Add sheets to workbook
        XLSX.utils.book_append_sheet(wb, wsOverview, "Overview");
        XLSX.utils.book_append_sheet(wb, wsTranscript, "Transcript");

        // Generate filename
        const filename = `Response_${response.participantId}_${format(new Date(), "yyyyMMdd")}.xlsx`;

        // Write file
        XLSX.writeFile(wb, filename);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
        );
    }

    if (error || !response) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
                <p className="text-gray-500">{error || "Response not found"}</p>
                <Link 
                    href={`/dashboard/surveys/${surveyId}`}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Survey
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-10">
            {/* Header */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-6 mb-2">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                        <Link
                            href={`/dashboard/surveys/${surveyId}`}
                            className="self-start sm:self-auto p-2 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5 text-gray-600" />
                        </Link>
                        <div>
                            <div className="flex flex-wrap items-center gap-3">
                                <h1 className="text-xl font-bold text-gray-900">
                                    {response.participantId === 'Anonymous' ? `Participant ${response.id.slice(0, 4)}` : response.participantId}
                                </h1>
                                <span className={cn(
                                    "px-2.5 py-1 rounded-full text-xs font-medium capitalize",
                                    response.status === "completed" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-amber-50 text-amber-700 border border-amber-200"
                                )}>
                                    {response.status === "completed" ? "Completed" : "In Progress"}
                                </span>
                            </div>
                            <p className="text-sm text-gray-500 mt-1">
                                Response for <span className="font-medium text-gray-700">{response.surveyTitle}</span>
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button 
                            onClick={handleExport}
                            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                            <Download className="w-4 h-4" />
                            <span className="hidden sm:inline">Export Excel</span>
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Conversation - ChatGPT Style */}
                <div className="lg:col-span-2 space-y-4 order-2 lg:order-1">
                    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                            <h2 className="font-semibold text-gray-900">Conversation Transcript</h2>
                            <span className="text-xs font-medium text-gray-500 bg-white px-2 py-1 rounded border border-gray-200 shadow-sm">{response.conversation.length} messages</span>
                        </div>
                        <div className="max-h-[800px] overflow-y-auto">
                            {response.conversation.length === 0 ? (
                                <div className="p-8 text-center text-gray-400 italic">
                                    No transcript available.
                                </div>
                            ) : (
                                response.conversation.map((message, index) => (
                                    <div
                                        key={index}
                                        className={cn(
                                            "px-6 py-5 border-b border-gray-50 last:border-0",
                                            message.role === "assistant" ? "bg-white" : "bg-gray-50/50"
                                        )}
                                    >
                                        <div className="max-w-3xl mx-auto flex gap-4">
                                            {/* Avatar */}
                                            <div className={cn(
                                                "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm",
                                                message.role === "assistant"
                                                    ? "bg-gradient-to-br from-indigo-500 to-purple-600"
                                                    : "bg-gray-900"
                                            )}>
                                                {message.role === "assistant" ? (
                                                    <Bot className="w-4 h-4 text-white" />
                                                ) : (
                                                    <User className="w-4 h-4 text-white" />
                                                )}
                                            </div>

                                            {/* Message Content */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1.5">
                                                    <span className="font-semibold text-sm text-gray-900">
                                                        {message.role === "assistant" ? "Convy AI" : "Participant"}
                                                    </span>
                                                    <span className="text-xs text-gray-400">
                                                        {message.timestamp ? new Date(message.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}
                                                    </span>
                                                    {message.role === "user" && message.sentiment && (
                                                        <span className="flex items-center gap-1 ml-auto">
                                                            {getSentimentIcon(message.sentiment)}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">
                                                    {message.content}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Sidebar */}
                <div className="space-y-4 order-1 lg:order-2">
                    {/* Response Info */}
                    <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
                        <h3 className="font-semibold text-gray-900 mb-4">Response Details</h3>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-500 flex items-center gap-2">Status</span>
                                <span className={cn(
                                    "px-2.5 py-1 rounded-full text-xs font-semibold capitalize",
                                    response.status === "completed" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-amber-50 text-amber-700 border border-amber-100"
                                )}>
                                    {response.status === "completed" ? "Completed" : "In Progress"}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-500 flex items-center gap-2">
                                    <Clock className="w-3.5 h-3.5" /> Duration
                                </span>
                                <span className="text-sm font-medium text-gray-900 bg-gray-50 px-2 py-1 rounded">{response.duration}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-500 flex items-center gap-2">
                                    <Calendar className="w-3.5 h-3.5" /> Started
                                </span>
                                <div className="text-right">
                                    <span className="text-sm text-gray-900 block">{format(new Date(response.startedAt), "MMM d, yyyy")}</span>
                                    <span className="text-xs text-gray-500 block">{format(new Date(response.startedAt), "h:mm a")}</span>
                                </div>
                            </div>
                            {response.completedAt && (
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-gray-500">Completed</span>
                                    <div className="text-right">
                                        <span className="text-sm text-gray-900 block">{format(new Date(response.completedAt), "MMM d, yyyy")}</span>
                                        <span className="text-xs text-gray-500 block">{format(new Date(response.completedAt), "h:mm a")}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Sentiment Analysis */}
                    {response.sentiment && (
                        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
                            <h3 className="font-semibold text-gray-900 mb-4">Sentiment Analysis</h3>
                            <div className="text-center mb-4">
                                <div className={cn(
                                    "inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold capitalize shadow-sm",
                                    response.sentiment === "positive" && "bg-emerald-50 text-emerald-700 border border-emerald-100",
                                    response.sentiment === "neutral" && "bg-amber-50 text-amber-700 border border-amber-100",
                                    response.sentiment === "negative" && "bg-red-50 text-red-700 border border-red-100"
                                )}>
                                    {getSentimentIcon(response.sentiment)}
                                    {response.sentiment}
                                </div>
                                <p className="text-xs font-medium text-gray-400 mt-2 uppercase tracking-wide">Confidence Score: {(response.sentimentScore * 100).toFixed(0)}%</p>
                            </div>
                            <div className="h-2.5 bg-gray-100 rounded-full relative overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-r from-red-400 via-amber-400 to-emerald-400 opacity-20" />
                                <div
                                    className="absolute top-0 bottom-0 w-1 bg-gray-900 rounded-full transition-all duration-1000"
                                    style={{ left: `${Math.max(5, Math.min(95, response.sentimentScore * 100))}%` }}
                                />
                            </div>
                            <div className="flex justify-between mt-1 text-[10px] text-gray-400 uppercase font-bold">
                                <span>Neg</span>
                                <span>Pos</span>
                            </div>
                        </div>
                    )}

                    {/* Key Insights */}
                    {response.keyInsights.length > 0 && (
                        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
                            <h3 className="font-semibold text-gray-900 mb-4">Key Insights</h3>
                            <ul className="space-y-3">
                                {response.keyInsights.map((insight, index) => (
                                    <li key={index} className="flex items-start gap-3 text-sm group">
                                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 flex-shrink-0 group-hover:bg-indigo-600 transition-colors" />
                                        <span className="text-gray-600 leading-relaxed">{insight}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* AI Summary */}
                    {response.summary && (
                        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl border border-indigo-100 p-5 shadow-sm">
                            <h3 className="font-semibold text-indigo-900 mb-2 flex items-center gap-2">
                                <Bot className="w-4 h-4" /> AI Summary
                            </h3>
                            <p className="text-sm text-indigo-800 leading-relaxed">{response.summary}</p>
                        </div>
                    )}

                    {/* Empty State for Incomplete */}
                    {response.status !== "completed" && (
                         <div className="bg-amber-50 rounded-xl border border-amber-100 p-5">
                            <h3 className="font-semibold text-amber-900 mb-2">Analysis Pending</h3>
                            <p className="text-sm text-amber-800">
                                This conversation is still in progress. Detailed analysis and insights will be generated once it is completed.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
