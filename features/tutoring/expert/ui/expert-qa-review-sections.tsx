"use client";

import type { RefObject } from "react";
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Quote,
  Save,
  ShieldCheck,
} from "lucide-react";

import { MarkdownMessage } from "@/shared/ui/markdown-message";
import { cn } from "@/shared/ui/tailwind-class-utils";

export type ReviewQueueItem = {
  key: string;
  sessionId: string | null;
  lessonId: string | null;
  classroomStudentId: string | null;
  studentName: string | null;
  lessonTitle: string | null;
  subjectKey: string | null;
  subjectLabel: string | null;
  priority: "low" | "medium" | "high";
  reasons: string[];
  createdAt: string;
};

export type TranscriptMessage = {
  id: string;
  role: string;
  content: string;
  createdAt: string;
};

export type ReviewHistoryItem = {
  id: string;
  reviewType: string;
  priority: "low" | "medium" | "high";
  relevanceScope: "general" | "framework_specific";
  tutorFailureSummary: string;
  expertCorrection: string;
  status: string;
  createdAt: string;
};

const priorityStyles = {
  low: "bg-slate-100 text-slate-600 ring-slate-200",
  medium: "bg-amber-50 text-amber-700 ring-amber-200",
  high: "bg-rose-50 text-rose-700 ring-rose-200",
} as const;

type ReviewQueueSidebarProps = {
  queue: ReviewQueueItem[];
  isLoading: boolean;
  selectedQueueKey: string | null;
  onSelectQueueItem: (queueKey: string) => void;
};

export function ReviewQueueSidebar({
  queue,
  isLoading,
  selectedQueueKey,
  onSelectQueueItem,
}: ReviewQueueSidebarProps) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.02)] flex flex-col overflow-hidden">
      <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-white z-10">
        <div>
          <h2 className="text-sm font-bold tracking-tight text-slate-950 uppercase">
            Review Queue
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {queue.length} pending reviews
          </p>
        </div>
        <ShieldCheck className="h-4 w-4 text-slate-400" />
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#FAFAFA]">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading queue...
          </div>
        ) : queue.length ? (
          queue.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onSelectQueueItem(item.key)}
              className={cn(
                "w-full rounded-xl border p-4 text-left transition-all",
                selectedQueueKey === item.key
                  ? "border-slate-900 bg-slate-900 shadow-md ring-1 ring-slate-900"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div
                  className={cn(
                    "font-semibold text-sm",
                    selectedQueueKey === item.key ? "text-white" : "text-slate-950",
                  )}
                >
                  {item.studentName ?? "Unknown student"}
                </div>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-bold uppercase ring-1 ring-inset",
                    priorityStyles[item.priority],
                    selectedQueueKey === item.key &&
                      "bg-white/10 ring-white/20 text-white",
                  )}
                >
                  {item.priority}
                </span>
              </div>
              <div
                className={cn(
                  "mt-1 text-xs font-medium",
                  selectedQueueKey === item.key ? "text-slate-300" : "text-slate-600",
                )}
              >
                {item.lessonTitle ?? "Unknown lesson"}
              </div>
              <div className="flex items-center gap-1.5 mt-2">
                {item.reasons.map((reason) => (
                  <span
                    key={reason}
                    className={cn(
                      "text-xs px-2 py-1 rounded-md",
                      selectedQueueKey === item.key
                        ? "bg-slate-800 text-slate-300"
                        : "bg-slate-100 text-slate-600",
                    )}
                  >
                    {reason}
                  </span>
                ))}
              </div>
            </button>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 flex flex-col items-center justify-center text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-400 mb-3" />
            <div className="text-sm font-semibold text-slate-950">Inbox Zero</div>
            <div className="text-xs text-slate-500 mt-1">
              No pending review items.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

type SelectedReviewWorkspaceProps = {
  selectedQueueItem: ReviewQueueItem;
  transcript: TranscriptMessage[];
  isTranscriptLoading: boolean;
  transcriptEndRef: RefObject<HTMLDivElement | null>;
  onQuoteMessage: (message: TranscriptMessage) => void;
  annotationType: string;
  onAnnotationTypeChange: (value: string) => void;
  relevanceScope: "general" | "framework_specific";
  onRelevanceScopeChange: (value: "general" | "framework_specific") => void;
  failureSummary: string;
  onFailureSummaryChange: (value: string) => void;
  reviewRationale: string;
  onReviewRationaleChange: (value: string) => void;
  improvedExample: string;
  onImprovedExampleChange: (value: string) => void;
  supportingEvidence: string;
  onSupportingEvidenceChange: (value: string) => void;
  onSubmitReview: () => void;
  isSubmittingReview: boolean;
  reviewHistory: ReviewHistoryItem[];
  isReviewHistoryLoading: boolean;
};

export function SelectedReviewWorkspace({
  selectedQueueItem,
  transcript,
  isTranscriptLoading,
  transcriptEndRef,
  onQuoteMessage,
  annotationType,
  onAnnotationTypeChange,
  relevanceScope,
  onRelevanceScopeChange,
  failureSummary,
  onFailureSummaryChange,
  reviewRationale,
  onReviewRationaleChange,
  improvedExample,
  onImprovedExampleChange,
  supportingEvidence,
  onSupportingEvidenceChange,
  onSubmitReview,
  isSubmittingReview,
  reviewHistory,
  isReviewHistoryLoading,
}: SelectedReviewWorkspaceProps) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.02)] flex flex-col overflow-hidden">
      <div className="p-5 border-b border-slate-100 bg-white z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-950">
            {selectedQueueItem.studentName}
          </h2>
          <div className="flex items-center gap-2 mt-1 text-sm text-slate-500">
            <span className="font-medium">{selectedQueueItem.lessonTitle}</span>
            <span>&bull;</span>
            <span>{selectedQueueItem.subjectLabel}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {selectedQueueItem.reasons.map((reason) => (
            <span
              key={reason}
              className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/20"
            >
              <AlertTriangle className="h-3 w-3" />
              {reason}
            </span>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-slate-50 p-6 space-y-6">
        {isTranscriptLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            <span className="text-sm font-medium">
              Loading session transcript...
            </span>
          </div>
        ) : transcript.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3">
            <MessageSquare className="h-8 w-8 text-slate-300" />
            <span className="text-sm">
              No transcript data available for this session.
            </span>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="text-center">
              <span className="inline-block bg-white px-3 py-1 rounded-full text-xs font-medium text-slate-400 border border-slate-200 shadow-sm">
                Session Started
              </span>
            </div>
            {transcript.map((message) => {
              const isAssistant = message.role === "assistant";
              const isSystem = message.role === "system";
              if (isSystem) {
                return null;
              }

              return (
                <div
                  key={message.id}
                  className={cn(
                    "flex w-full group",
                    isAssistant ? "justify-start" : "justify-end",
                  )}
                >
                  <div
                    className={cn(
                      "relative max-w-[85%] rounded-2xl px-5 py-4 shadow-sm",
                      isAssistant
                        ? "bg-white border border-slate-200"
                        : "bg-slate-900 text-white",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onQuoteMessage(message)}
                      className={cn(
                        "absolute top-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-slate-100",
                        isAssistant ? "-right-10" : "-left-10 hover:bg-slate-200",
                      )}
                      title="Quote as evidence"
                    >
                      <Quote className="h-4 w-4 text-slate-400 hover:text-slate-900" />
                    </button>

                    <div className="text-xs font-bold uppercase mb-2 text-slate-400">
                      {isAssistant ? "AI Tutor" : selectedQueueItem.studentName}
                    </div>
                    <div
                      className={cn(
                        "prose prose-sm max-w-none break-words",
                        isAssistant ? "prose-slate" : "prose-invert",
                      )}
                    >
                      <MarkdownMessage content={message.content} />
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={transcriptEndRef} className="h-4" />
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 bg-white p-5">
        <h3 className="text-sm font-bold text-slate-950 mb-4 uppercase tracking-wider">
          Expert Review
        </h3>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Review Type
                </label>
                <select
                  value={annotationType}
                  onChange={(event) => onAnnotationTypeChange(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 shadow-sm focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                >
                  <option value="reasoning_gap">Reasoning Gap</option>
                  <option value="misconception">Misconception</option>
                  <option value="question_quality">Questioning Quality</option>
                  <option value="scaffolding">Scaffolding</option>
                  <option value="feedback_quality">Feedback Quality</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Relevance Scope
                </label>
                <div className="space-y-2">
                  <label
                    className={cn(
                      "flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all",
                      relevanceScope === "general"
                        ? "border-slate-900 bg-slate-50"
                        : "border-slate-200",
                    )}
                  >
                    <input
                      type="radio"
                      name="scope"
                      className="w-3 h-3 text-slate-900"
                      checked={relevanceScope === "general"}
                      onChange={() => onRelevanceScopeChange("general")}
                    />
                    <span className="text-xs font-medium">General Pedagogy</span>
                  </label>
                  <label
                    className={cn(
                      "flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all",
                      relevanceScope === "framework_specific"
                        ? "border-slate-900 bg-slate-50"
                        : "border-slate-200",
                    )}
                  >
                    <input
                      type="radio"
                      name="scope"
                      className="w-3 h-3 text-slate-900"
                      checked={relevanceScope === "framework_specific"}
                      onChange={() =>
                        onRelevanceScopeChange("framework_specific")
                      }
                    />
                    <span className="text-xs font-medium">
                      Framework Specific
                    </span>
                  </label>
                </div>
              </div>
              <button
                type="button"
                onClick={onSubmitReview}
                disabled={
                  isSubmittingReview ||
                  !failureSummary.trim() ||
                  !reviewRationale.trim() ||
                  !improvedExample.trim()
                }
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isSubmittingReview ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Submit Review
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  What Went Wrong
                </label>
                <textarea
                  value={failureSummary}
                  onChange={(event) => onFailureSummaryChange(event.target.value)}
                  rows={4}
                  placeholder="Describe the specific tutor mistake in this exchange."
                  className="w-full rounded-xl border border-slate-200 bg-[#FAFAFA] px-4 py-3 text-sm text-slate-900 shadow-sm focus:bg-white focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Why It Was Wrong
                </label>
                <textarea
                  value={reviewRationale}
                  onChange={(event) => onReviewRationaleChange(event.target.value)}
                  rows={4}
                  placeholder="Explain the pedagogical rationale for the correction."
                  className="w-full rounded-xl border border-slate-200 bg-[#FAFAFA] px-4 py-3 text-sm text-slate-900 shadow-sm focus:bg-white focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Better Example
                </label>
                <textarea
                  value={improvedExample}
                  onChange={(event) => onImprovedExampleChange(event.target.value)}
                  rows={5}
                  placeholder="Write what a stronger tutor response would have looked like."
                  className="w-full rounded-xl border border-slate-200 bg-[#FAFAFA] px-4 py-3 text-sm text-slate-900 shadow-sm focus:bg-white focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center justify-between">
                  <span>Supporting Evidence</span>
                  <span className="text-xs font-medium normal-case text-slate-400 flex items-center gap-1">
                    <Quote className="h-3 w-3" /> Hover transcript to quote
                  </span>
                </label>
                <textarea
                  value={supportingEvidence}
                  onChange={(event) =>
                    onSupportingEvidenceChange(event.target.value)
                  }
                  rows={5}
                  placeholder="Paste or quote the transcript evidence that supports this review."
                  className="w-full rounded-xl border border-slate-200 bg-[#FAFAFA] px-4 py-3 text-sm text-slate-900 shadow-sm focus:bg-white focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none transition-colors"
                />
              </div>
            </div>
          </div>
          <ReviewHistoryPanel
            reviewHistory={reviewHistory}
            isLoading={isReviewHistoryLoading}
          />
        </div>
      </div>
    </div>
  );
}

type ReviewHistoryPanelProps = {
  reviewHistory: ReviewHistoryItem[];
  isLoading: boolean;
};

function ReviewHistoryPanel({
  reviewHistory,
  isLoading,
}: ReviewHistoryPanelProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Review History
        </h4>
        <span className="text-xs font-semibold uppercase text-slate-400">
          session/lesson
        </span>
      </div>
      <div className="mt-4 space-y-3">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading history...
          </div>
        ) : reviewHistory.length ? (
          reviewHistory.slice(0, 6).map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-slate-200 bg-white p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="text-xs font-semibold uppercase text-slate-500">
                  {item.reviewType}
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold uppercase text-slate-600">
                  {item.status}
                </span>
              </div>
              <p className="mt-2 text-sm font-medium text-slate-900 line-clamp-2">
                {item.tutorFailureSummary}
              </p>
              <p className="mt-1 text-xs text-slate-500 line-clamp-3">
                {item.expertCorrection}
              </p>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-400">
            No existing review history for this context.
          </div>
        )}
      </div>
    </div>
  );
}

export function EmptyReviewWorkspace() {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.02)] flex flex-col overflow-hidden">
      <div className="flex flex-col items-center justify-center h-full text-slate-400 bg-[#FAFAFA]">
        <Brain className="h-12 w-12 text-slate-200 mb-4" />
        <h3 className="text-lg font-semibold text-slate-900">
          No Review Selected
        </h3>
        <p className="text-sm mt-1">
          Select an item from the queue to review the chat transcript.
        </p>
      </div>
    </div>
  );
}
