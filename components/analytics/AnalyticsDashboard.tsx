"use client";

import { useQuery } from "@tanstack/react-query";
import { SurveyAnalyticsData } from "@/lib/analytics";
import { NarrativeReport } from "./NarrativeReport";
import { Loader2, AlertCircle, MessageSquare, RefreshCw, LayoutDashboard } from "lucide-react";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface AnalyticsDashboardProps {
    surveyId: string;
}

async function fetchAnalytics(surveyId: string) {
    const res = await fetch(`/api/surveys/${surveyId}/analytics`);
    if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to fetch analytics");
    }
    return res.json();
}

export function AnalyticsDashboard({ surveyId }: AnalyticsDashboardProps) {
    const [isRegenerating, setIsRegenerating] = useState(false);

    const { data, isLoading, error, refetch } = useQuery({
        queryKey: ["survey-analytics", surveyId],
        queryFn: () => fetchAnalytics(surveyId),
        refetchInterval: (query) => {
            const status = query.state.data?.status;
            return status === "not_generated" ? 10000 : 300000;
        },
    });

    const handleRegenerate = async () => {
        setIsRegenerating(true);
        try {
            await fetch(`/api/surveys/${surveyId}/analytics`, {
                method: "POST",
                body: JSON.stringify({ force: true }),
            });
            refetch();
        } finally {
            setIsRegenerating(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] text-gray-500">
                <Loader2 className="w-8 h-8 animate-spin mb-4 text-black" />
                <p className="text-sm font-medium">Loading research intelligence...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] text-red-500">
                <AlertCircle className="w-10 h-10 mb-4" />
                <p className="font-bold text-lg">Analysis Interrupted</p>
                <p className="text-sm mt-1 text-gray-500">{(error as Error).message}</p>
                <button
                    onClick={() => refetch()}
                    className="mt-6 px-6 py-2.5 bg-white border border-gray-200 rounded-full text-sm font-bold text-gray-900 hover:bg-gray-50 transition-all shadow-sm"
                >
                    Retry Analysis
                </button>
            </div>
        );
    }

    if (data?.status === "not_generated") {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] bg-white rounded-[2.5rem] border border-dashed border-gray-200 p-12 text-center max-w-2xl mx-auto mt-8">
                <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-6">
                    <RefreshCw className="w-8 h-8 text-black animate-spin" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-3 tracking-tight">Synthesizing Results</h3>
                <p className="text-gray-500 max-w-md mx-auto mb-8 leading-relaxed italic">
                    &quot;{data.message}&quot;
                </p>
                <div className="flex gap-8 text-sm bg-gray-50 px-8 py-5 rounded-[2rem]">
                    <div className="flex flex-col items-center">
                        <span className="font-black text-2xl text-gray-900">{data.conversationStats?.total || 0}</span>
                        <span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">Responses</span>
                    </div>
                    <div className="w-px bg-gray-200" />
                    <div className="flex flex-col items-center">
                        <span className="font-black text-2xl text-gray-900">{data.conversationStats?.completed || 0}</span>
                        <span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">Completed</span>
                    </div>
                </div>
            </div>
        );
    }

    const analytics = data as SurveyAnalyticsData;

    return (
        <div className="space-y-12 pb-20 animate-in fade-in duration-700">
            {/* Utility Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-gray-100 rounded-2xl">
                        <LayoutDashboard className="w-5 h-5 text-gray-900" />
                    </div>
                    <div>
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">
                            Refreshed {new Date(analytics.lastUpdated).toLocaleDateString()}
                        </div>
                        <h2 className="text-lg font-bold text-gray-900 tracking-tight leading-none">
                            Research Narrative
                        </h2>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <Link
                        href={`/dashboard/surveys/${surveyId}/analytics/chat`}
                        className="flex items-center gap-2.5 px-6 py-2.5 bg-gray-900 text-white rounded-full text-sm font-bold hover:bg-black transition-all shadow-xl shadow-gray-200"
                    >
                        <MessageSquare className="w-4 h-4" />
                        Chat with Data
                    </Link>
                    <button
                        onClick={handleRegenerate}
                        disabled={isRegenerating}
                        className="p-2.5 hover:bg-gray-100 rounded-full transition-colors disabled:opacity-50"
                        title="Regenerate Report"
                    >
                        <RefreshCw
                            className={cn("w-5 h-5 text-gray-400", isRegenerating && "animate-spin")}
                        />
                    </button>
                </div>
            </div>

            <NarrativeReport data={analytics} surveyId={surveyId} />
        </div>
    );
}
