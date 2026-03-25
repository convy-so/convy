"use client";

import { ArrowRight, Clock, Quote, ShieldCheck, TriangleAlert } from "lucide-react";

import type { AnalyticsConversationListItem } from "@/lib/analytics";
import { Link } from "@/i18n/routing";

interface ConversationCardProps {
  surveyId: string;
  conversation: AnalyticsConversationListItem;
}

export function ConversationCard({
  surveyId,
  conversation,
}: ConversationCardProps) {
  const statusTone =
    conversation.reliabilityPercent >= 70
      ? "bg-emerald-50 text-emerald-700 border-emerald-100"
      : conversation.reliabilityPercent >= 55
        ? "bg-amber-50 text-amber-700 border-amber-100"
        : "bg-red-50 text-red-700 border-red-100";

  return (
    <Link
      href={`/dashboard/surveys/${surveyId}/responses/${conversation.sessionId}`}
      className="group block rounded-2xl border border-gray-200 bg-white p-5 transition-all duration-200 hover:border-gray-300"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div
            className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${statusTone}`}
          >
            {conversation.reliabilityPercent}% reliable
          </div>
          <span className="font-mono text-xs text-gray-400">
            #{conversation.sessionId.slice(-4)}
          </span>
        </div>
        <span className="text-xs text-gray-400">
          {new Date(conversation.createdAt).toLocaleDateString()}
        </span>
      </div>

      <p className="mb-3 line-clamp-3 text-sm font-medium leading-relaxed text-gray-700">
        {conversation.summary}
      </p>

      {conversation.keyFindings.length > 0 && (
        <div className="mb-4 space-y-2 rounded-xl bg-gray-50/70 p-3">
          {conversation.keyFindings.slice(0, 2).map((finding, index) => (
            <div key={index} className="flex gap-2 text-xs leading-relaxed text-gray-600">
              <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-gray-300" />
              <span>{finding}</span>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-gray-50 pt-4">
        <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-gray-400" />
            {conversation.completenessPercent}% complete
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-gray-400" />
            {conversation.fatiguePercent}% fatigue
          </div>
          <div className="flex items-center gap-1.5">
            <Quote className="h-3.5 w-3.5 text-gray-400" />
            {conversation.notableQuotes.length} quotes
          </div>
          {conversation.risks.length > 0 && (
            <div className="flex items-center gap-1.5 text-amber-700">
              <TriangleAlert className="h-3.5 w-3.5" />
              {conversation.risks.length} risks
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
            {conversation.sessionType} session
          </span>
          <div className="translate-x-[-10px] text-black opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100">
            <ArrowRight className="h-4 w-4" />
          </div>
        </div>
      </div>
    </Link>
  );
}
