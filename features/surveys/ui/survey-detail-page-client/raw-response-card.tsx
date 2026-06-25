"use client";

import { Clock, MessageSquare } from "lucide-react";

import { Link } from "@/i18n/routing";

export function RawResponseCard({
  id,
  surveyId,
  summary,
  durationMinutes,
  messageCount,
  isCompleted,
  createdAt,
}: {
  id: string;
  surveyId: string;
  summary: string;
  durationMinutes: number;
  messageCount: number;
  isCompleted: boolean;
  createdAt: string;
}) {
  const statusTone = isCompleted
    ? "bg-emerald-50 text-emerald-700 border-emerald-100"
    : "bg-amber-50 text-amber-700 border-amber-100";

  return (
    <Link
      href={`/dashboard/surveys/${surveyId}/responses/${id}`}
      className="group block rounded-2xl border border-gray-200 bg-white p-5 transition-all duration-200 hover:border-gray-300"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div
            className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${statusTone}`}
          >
            {isCompleted ? "Completed" : "In Progress"}
          </div>
          <span className="font-mono text-xs text-gray-400">#{id.slice(-4)}</span>
        </div>
        <span className="text-xs text-gray-400">
          {new Date(createdAt).toLocaleDateString()}
        </span>
      </div>
      <p className="mb-3 line-clamp-3 text-sm font-medium leading-relaxed text-gray-700">
        {summary}
      </p>
      <div className="mt-auto border-t border-gray-50 pt-4">
        <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-gray-400" />
            {durationMinutes} min
          </div>
          <div className="flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5 text-gray-400" />
            {messageCount} msgs
          </div>
        </div>
      </div>
    </Link>
  );
}
