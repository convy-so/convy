"use client";

import { useQuery } from "@tanstack/react-query";
import { SurveyAnalyticsData } from "@/lib/analytics";
import { SentimentGauge } from "./SentimentGauge";
import { DashboardGrid } from "./DashboardGrid";
import { Loader2, AlertCircle } from "lucide-react";
import Link from "next/link";
import { RespondentLimitTracker } from "./RespondentLimitTracker";

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
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["survey-analytics", surveyId],
    queryFn: () => fetchAnalytics(surveyId),
    refetchInterval: (query) => {
        // Poll every 10s if status is 'not_generated' or in progress, otherwise 5m
        const status = query.state.data?.status;
        return status === 'not_generated' ? 10000 : 300000;
    }
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-gray-500">
        <Loader2 className="w-8 h-8 animate-spin mb-4 text-black" />
        <p>Loading analytics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-red-500">
        <AlertCircle className="w-10 h-10 mb-4" />
        <p className="font-medium">Error loading analytics</p>
        <p className="text-sm mt-1 text-gray-500">{(error as Error).message}</p>
        <button onClick={() => refetch()} className="mt-4 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
            Retry
        </button>
      </div>
    );
  }

  // Handle "Not Generated" state (worker hasn't run or no data yet)
  if (data?.status === 'not_generated') {
      return (
         <div className="flex flex-col items-center justify-center min-h-[400px] bg-white rounded-2xl border border-dashed border-gray-200 p-8 text-center max-w-2xl mx-auto mt-8">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                <Loader2 className="w-8 h-8 text-black animate-spin" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Analyzing Responses</h3>
            <p className="text-gray-500 max-w-md mx-auto mb-6">
                {data.message}
            </p>
            <div className="flex gap-4 text-sm text-gray-600 bg-gray-50 px-6 py-3 rounded-xl">
                 <div className="flex flex-col">
                    <span className="font-bold text-lg text-gray-900">{data.conversationStats?.total || 0}</span>
                    <span className="text-xs">Total</span>
                 </div>
                 <div className="w-px bg-gray-200" />
                 <div className="flex flex-col">
                    <span className="font-bold text-lg text-gray-900">{data.conversationStats?.completed || 0}</span>
                    <span className="text-xs">Completed</span>
                 </div>
            </div>
         </div>
      );
  }

  const analytics = data as SurveyAnalyticsData;
  const { coreMetrics, executiveSummary, goalAssessment, discoveredInsights } = analytics;
  // Fallback for maxLimit since it might not be in the partial type yet
  const maxLimit = 50; 

  // Combine widgets (backend provided + any frontend-injected ones like Data Gaps)
  const allWidgets = [...analytics.dashboardWidgets];

  // Inject Data Gaps if present (as it's not currently in backend widget generation)
  if (discoveredInsights.dataGaps && discoveredInsights.dataGaps.length > 0) {
      allWidgets.push({
          id: "data_gaps",
          type: "insight_list",
          title: "Missing Information",
          description: "Topics that could not be determined",
          priority: 99,
          size: "medium",
          data: {
              insights: discoveredInsights.dataGaps.map(g => ({ text: g, significance: 'medium' }))
          }
      });
  }

  return (
        <div className="space-y-8 pb-12 animate-in fade-in duration-500">
            {/* Header Actions Row */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gray-50/50 p-4 rounded-3xl border border-gray-100">
                <div className="flex items-center gap-4 text-xs font-medium text-gray-500">
                    <span>
                        Last updated: {new Date(analytics.lastUpdated).toLocaleString()}
                    </span>
                     {/* Respondent Limit Tracker */}
                     <div className="h-4 w-px bg-gray-200 hidden md:block" />
                     <div className="md:block w-64 hidden">
                         <RespondentLimitTracker currentCount={coreMetrics.totalConversations} maxLimit={maxLimit} />
                     </div>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                        onClick={() => fetch(`/api/surveys/${surveyId}/analytics`, { method: 'POST', body: JSON.stringify({ force: true }) })}
                        className="px-5 py-2.5 bg-black text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition-all"
                    >
                        Regenerate
                    </button>
                </div>
            </div>

            {/* Mobile-only Respondent Tracker */}
            <div className="md:hidden">
                 <RespondentLimitTracker currentCount={coreMetrics.totalConversations} maxLimit={maxLimit} />
            </div>

            {/* 1. Executive Summary Hero Section - Kept distinct for impact */}
            <div className="bg-white rounded-[2.5rem] p-8 md:p-10 border border-gray-100/50">
                <div className="flex flex-col lg:flex-row gap-10">
                    <div className="flex-1 space-y-8">
                        <div className="inline-flex items-center gap-2">
                             <div className="bg-black text-white text-[10px] uppercase font-bold px-3 py-1 rounded-full tracking-widest">
                                Executive Summary
                             </div>
                             <span className="text-xs font-medium text-gray-400">
                                Based on {coreMetrics.totalConversations} conversations
                             </span>
                        </div>
                        
                        <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 leading-tight tracking-tight">
                            {executiveSummary.headline}
                        </h2>

                        <div className="space-y-4">
                            {executiveSummary.keyInsights.slice(0, 3).map((insight, i) => (
                                <div key={i} className="flex gap-4 items-start group">
                                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-bold mt-0.5 group-hover:bg-black group-hover:text-white transition-colors">
                                        {i + 1}
                                    </span>
                                    <p className="text-lg text-gray-600 leading-relaxed font-medium">
                                        {insight}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Sentiment Gauge integrated into Hero */}
                    <div className="lg:w-80 flex-shrink-0 flex items-center justify-center bg-gray-50/50 rounded-[2rem] p-6">
                        <SentimentGauge
                            score={executiveSummary.overallSentiment.score}
                            confidence={executiveSummary.overallSentiment.confidence}
                            overall={executiveSummary.overallSentiment.overall}
                        />
                    </div>
                </div>
            </div>

             {/* 2. Main Dashboard Bento Grid */}
             <DashboardGrid widgets={allWidgets} />
             
        </div>
  );
}
