"use client";

import { MessageSquare, Clock, ArrowRight } from "lucide-react";
import { Link } from "@/i18n/routing";
import { ClientT } from "@/components/i18n/client-t";

interface ConversationCardProps {
  id: string;
  surveyId: string;
  summary: string;
  sentimentScore: number;
  durationMinutes: number;
  messageCount: number;
  isCompleted: boolean;
  createdAt: string;
}

export function ConversationCard({
  id,
  surveyId,
  summary,
  sentimentScore,
  durationMinutes,
  messageCount,
  isCompleted,
  createdAt,
}: ConversationCardProps) {
  const getSentimentColor = (score: number) => {
    if (score >= 0.5) return "text-emerald-600 bg-emerald-50 border-emerald-100";
    if (score <= -0.5) return "text-red-600 bg-red-50 border-red-100";
    return "text-gray-600 bg-gray-50 border-gray-100";
  };

  const getSentimentLabel = (score: number) => {
    if (score >= 0.5) return <ClientT>Positive</ClientT>;
    if (score <= -0.5) return <ClientT>Negative</ClientT>;
    return <ClientT>Neutral</ClientT>;
  };

  return (
    <Link
      href={`/dashboard/surveys/${surveyId}/responses/${id}`}
      className="group block bg-white rounded-xl border border-gray-200 p-5 hover:border-gray-300 transition-all duration-200"
    >
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2">
          <div className={`px-2 py-1 rounded text-[10px] uppercase font-bold tracking-wider border ${getSentimentColor(sentimentScore)}`}>
            {getSentimentLabel(sentimentScore)}
          </div>
          <span className="text-xs text-gray-400 font-mono">#{id.slice(-4)}</span>
        </div>
        <span className="text-xs text-gray-400">
          {new Date(createdAt).toLocaleDateString()}
        </span>
      </div>

      <p className="text-sm text-gray-700 font-medium mb-4 line-clamp-2 leading-relaxed">
        {summary || <ClientT>No summary available for this conversation.</ClientT>}
      </p>

      <div className="flex items-center justify-between pt-4 border-t border-gray-50">
        <div className="flex gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-gray-400" />
            {durationMinutes}m
          </div>
          <div className="flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5 text-gray-400" />
            {messageCount} <ClientT>msgs</ClientT>
          </div>
          {!isCompleted && (
            <span className="text-amber-600 bg-amber-50 px-1.5 rounded"><ClientT>Incomplete</ClientT></span>
          )}
        </div>

        <div className="text-black opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-[-10px] group-hover:translate-x-0 duration-200">
          <ArrowRight className="w-4 h-4" />
        </div>
      </div>
    </Link>
  );
}
