"use client";

import { useQuery } from "@tanstack/react-query";
import { SurveyAnalyticsData } from "@/lib/analytics";
import { StatCard } from "./StatCard";
import { SentimentGauge } from "./SentimentGauge";
import { InsightList } from "./InsightList";
import { GoalAssessmentCard } from "./GoalAssessmentCard";
import { Loader2, AlertCircle } from "lucide-react";

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
        <Loader2 className="w-8 h-8 animate-spin mb-4 text-blue-500" />
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
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
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

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header is handled by the Page component usually, but we can add last updated here */}
      <div className="flex justify-between items-center">
         <p className="text-sm text-gray-400">
            Last updated: {new Date(analytics.lastUpdated).toLocaleString()}
         </p>
         <button 
           onClick={() => fetch(`/api/surveys/${surveyId}/analytics`, { method: 'POST', body: JSON.stringify({ force: true }) })}
           className="text-xs text-blue-600 hover:underline"
         >
            Regenerate Analysis
         </button>
      </div>

      {/* 2. Stat Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
            title="Total Responses" 
            value={coreMetrics.totalConversations} 
            icon="Users"
            color="bg-blue-500"
        />
        <StatCard 
            title="Completion Rate" 
            value={`${coreMetrics.completionRate}%`} 
            trend={coreMetrics.completionRate >= 80 ? "up" : "stable"}
            icon="CheckCircle2"
            color="bg-emerald-500"
        />
        <StatCard 
            title="Insight Quality" 
            value={`${coreMetrics.insightQualityScore}/10`} 
            icon="Sparkles"
            color="bg-purple-500"
        />
         <StatCard 
            title="Avg Duration" 
            value={`${coreMetrics.medianDurationMinutes}m`} 
            icon="Clock"
            color="bg-amber-500"
        />
      </div>

      {/* 3. Executive Summary & Sentiment */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">{executiveSummary.headline}</h3>
            <ul className="space-y-3 mb-6">
                {executiveSummary.keyInsights.slice(0, 3).map((insight, i) => (
                    <li key={i} className="flex gap-3 text-gray-600 leading-relaxed">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xs font-bold mt-0.5">
                            {i+1}
                        </span>
                        {insight}
                    </li>
                ))}
            </ul>
        </div>
        
        <div className="grid grid-cols-1 gap-4">
             <SentimentGauge 
                score={executiveSummary.overallSentiment.score} 
                confidence={executiveSummary.overallSentiment.confidence}
                overall={executiveSummary.overallSentiment.overall}
             />
             <GoalAssessmentCard 
                score={goalAssessment.achievementScore}
                level={goalAssessment.achievementLevel}
                objective={goalAssessment.surveyObjective}
             />
        </div>
      </div>

      {/* 4. Detailed Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
         <InsightList 
            title="Key Trends" 
            insights={discoveredInsights.trends.map(t => ({
                text: t.description,
                significance: t.significance,
                sentiment: t.sentiment
            }))}
            type="trends"
         />
         <InsightList 
            title="Actionable Recommendations" 
            insights={discoveredInsights.recommendations.map(r => ({
                text: r.description,
                significance: r.priority,
            }))}
            type="key_insights"
         />
      </div>
      
    </div>
  );
}
