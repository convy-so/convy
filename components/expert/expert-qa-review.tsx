"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Brain,
  Loader2,
  Save,
  MessageSquare,
  Quote,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import toast from "react-hot-toast";

import { MarkdownMessage } from "@/components/ui/markdown-message";
import { cn } from "@/lib/utils";

type ReviewQueueItem = {
  key: string;
  sessionId: string | null;
  topicId: string | null;
  classroomStudentId: string | null;
  studentName: string | null;
  topicTitle: string | null;
  subjectKey: string | null;
  subjectLabel: string | null;
  priority: "low" | "medium" | "high";
  reasons: string[];
  createdAt: string;
};

type TranscriptMessage = {
  id: string;
  role: string;
  content: string;
  createdAt: string;
};

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await response.json()) as { error?: string } & T;
  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed");
  }
  return payload;
}

export function ExpertQaReview() {
  const queryClient = useQueryClient();
  const [selectedQueueKey, setSelectedQueueKey] = useState<string | null>(null);
  
  const [annotationSummary, setAnnotationSummary] = useState("");
  const [annotationEvidence, setAnnotationEvidence] = useState("");
  const [annotationType, setAnnotationType] = useState("reasoning_gap");
  const [relevanceScope, setRelevanceScope] = useState<"general" | "framework_specific">("general");
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Queries
  const queueQuery = useQuery({
    queryKey: ["expertLearningReviewQueue"],
    queryFn: async () =>
      (await fetchJson<{ success: true; data: ReviewQueueItem[] }>(
        "/api/learning/expert/review-queue",
      )).data,
  });

  const selectedQueueItem = useMemo(() => 
    queueQuery.data?.find((item) => item.key === selectedQueueKey) ?? queueQuery.data?.[0] ?? null
  , [queueQuery.data, selectedQueueKey]);

  const transcriptQuery = useQuery({
    queryKey: ["expertSessionTranscript", selectedQueueItem?.sessionId],
    queryFn: async () => {
      if (!selectedQueueItem?.sessionId) return [];
      return (
        await fetchJson<{ success: true; data: TranscriptMessage[] }>(
          `/api/learning/expert/sessions/${selectedQueueItem.sessionId}/transcript`,
        )
      ).data;
    },
    enabled: Boolean(selectedQueueItem?.sessionId),
  });

  // Auto-scroll transcript to bottom when loaded
  useEffect(() => {
    if (transcriptQuery.isSuccess && transcriptQuery.data.length > 0) {
      setTimeout(() => {
        transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, [transcriptQuery.isSuccess, transcriptQuery.data, selectedQueueKey]);

  // Mutations
  const createAnnotationMutation = useMutation({
    mutationFn: async () => {
      if (!selectedQueueItem) {
        throw new Error("Pick a queue item first.");
      }
      return await fetchJson<{ success: true }>("/api/learning/expert/annotations", {
        method: "POST",
        body: JSON.stringify({
          topicId: selectedQueueItem.topicId,
          sessionId: selectedQueueItem.sessionId,
          classroomStudentId: selectedQueueItem.classroomStudentId,
          reviewType: annotationType,
          priority: selectedQueueItem.priority,
          tutorFailureSummary: annotationSummary.trim(),
          expertCorrection: annotationEvidence.trim(),
          relevanceScope,
          metadata: {
            reviewQueueKey: selectedQueueItem.key,
            reasons: selectedQueueItem.reasons,
          },
        }),
      });
    },
    onSuccess: async () => {
      setAnnotationSummary("");
      setAnnotationEvidence("");
      toast.success("Annotation saved successfully");
      await queryClient.invalidateQueries({ queryKey: ["expertLearningReviewQueue"] });
      // Move to next item automatically
      if (queueQuery.data) {
        const currentIndex = queueQuery.data.findIndex((i) => i.key === selectedQueueItem?.key);
        const nextItem = queueQuery.data[currentIndex + 1];
        if (nextItem) setSelectedQueueKey(nextItem.key);
      }
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Failed to save annotation"),
  });

  const handleQuoteMessage = (message: TranscriptMessage) => {
    const formattedQuote = `> **${message.role === 'assistant' ? 'AI Tutor' : 'Student'}**: ${message.content}\n\n`;
    setAnnotationEvidence((prev) => prev ? `${prev}\n${formattedQuote}` : formattedQuote);
    toast.success("Quoted to evidence");
  };

  const priorityStyles = useMemo(
    () => ({
      low: "bg-slate-100 text-slate-600 ring-slate-200",
      medium: "bg-amber-50 text-amber-700 ring-amber-200",
      high: "bg-rose-50 text-rose-700 ring-rose-200",
    }),
    [],
  );

  return (
    <section className="grid gap-6 xl:grid-cols-[380px_1fr] h-[calc(100vh-140px)]">
      {/* Left Sidebar: Queue List */}
      <div className="rounded-2xl border border-slate-100 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.02)] flex flex-col overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-white z-10">
          <div>
            <h2 className="text-sm font-bold tracking-tight text-slate-950 uppercase">
              Review Queue
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {queueQuery.data?.length ?? 0} pending reviews
            </p>
          </div>
          <ShieldCheck className="h-4 w-4 text-slate-400" />
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#FAFAFA]">
          {queueQuery.isLoading ? (
            <div className="flex items-center justify-center h-32 gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading queue...
            </div>
          ) : queueQuery.data?.length ? (
            queueQuery.data.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setSelectedQueueKey(item.key)}
                className={cn(
                  "w-full rounded-xl border p-4 text-left transition-all",
                  selectedQueueItem?.key === item.key
                    ? "border-slate-900 bg-slate-900 shadow-md ring-1 ring-slate-900"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className={cn("font-semibold text-sm", selectedQueueItem?.key === item.key ? "text-white" : "text-slate-950")}>
                    {item.studentName ?? "Unknown student"}
                  </div>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ring-inset", priorityStyles[item.priority], selectedQueueItem?.key === item.key && "bg-white/10 ring-white/20 text-white")}>
                    {item.priority}
                  </span>
                </div>
                <div className={cn("mt-1 text-xs font-medium", selectedQueueItem?.key === item.key ? "text-slate-300" : "text-slate-600")}>
                  {item.topicTitle ?? "Unknown topic"}
                </div>
                <div className={cn("mt-3 flex flex-wrap gap-1.5")}>
                  {item.reasons.slice(0, 2).map(r => (
                    <span key={r} className={cn("text-[10px] px-2 py-1 rounded-md", selectedQueueItem?.key === item.key ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-600")}>
                      {r}
                    </span>
                  ))}
                </div>
              </button>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 flex flex-col items-center justify-center text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-400 mb-3" />
              <div className="text-sm font-semibold text-slate-950">Inbox Zero</div>
              <div className="text-xs text-slate-500 mt-1">No pending review items.</div>
            </div>
          )}
        </div>
      </div>

      {/* Right Panel: Transcript & Annotation */}
      <div className="rounded-2xl border border-slate-100 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.02)] flex flex-col overflow-hidden">
        {selectedQueueItem ? (
          <>
            {/* Header */}
            <div className="p-5 border-b border-slate-100 bg-white z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  {selectedQueueItem.studentName}
                </h2>
                <div className="flex items-center gap-2 mt-1 text-sm text-slate-500">
                  <span className="font-medium">{selectedQueueItem.topicTitle}</span>
                  <span>&bull;</span>
                  <span>{selectedQueueItem.subjectLabel}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedQueueItem.reasons.map((reason) => (
                  <span key={reason} className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/20">
                    <AlertTriangle className="h-3 w-3" />
                    {reason}
                  </span>
                ))}
              </div>
            </div>

            {/* Transcript Viewer */}
            <div className="flex-1 overflow-y-auto bg-slate-50 p-6 space-y-6">
              {transcriptQuery.isLoading ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                  <span className="text-sm font-medium">Loading session transcript...</span>
                </div>
              ) : transcriptQuery.data?.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3">
                  <MessageSquare className="h-8 w-8 text-slate-300" />
                  <span className="text-sm">No transcript data available for this session.</span>
                </div>
              ) : (
                <div className="max-w-3xl mx-auto space-y-6">
                  <div className="text-center">
                    <span className="inline-block bg-white px-3 py-1 rounded-full text-xs font-medium text-slate-400 border border-slate-200 shadow-sm">
                      Session Started
                    </span>
                  </div>
                  {transcriptQuery.data?.map((msg) => {
                    const isAssistant = msg.role === "assistant";
                    const isSystem = msg.role === "system";
                    if (isSystem) return null; // Hide system prompts from transcript view

                    return (
                      <div key={msg.id} className={cn("flex w-full group", isAssistant ? "justify-start" : "justify-end")}>
                        <div className={cn(
                          "relative max-w-[85%] rounded-2xl px-5 py-4 shadow-sm",
                          isAssistant ? "bg-white border border-slate-200" : "bg-slate-900 text-white"
                        )}>
                          {/* Quote Action Button */}
                          <button 
                            onClick={() => handleQuoteMessage(msg)}
                            className={cn(
                              "absolute top-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-slate-100",
                              isAssistant ? "-right-10" : "-left-10 hover:bg-slate-200"
                            )}
                            title="Quote as evidence"
                          >
                            <Quote className="h-4 w-4 text-slate-400 hover:text-slate-900" />
                          </button>
                          
                          <div className={cn("text-xs font-bold uppercase mb-2", isAssistant ? "text-slate-400" : "text-slate-400")}>
                            {isAssistant ? "AI Tutor" : selectedQueueItem.studentName}
                          </div>
                          <div className={cn("prose prose-sm max-w-none break-words", isAssistant ? "prose-slate" : "prose-invert")}>
                            <MarkdownMessage content={msg.content} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={transcriptEndRef} className="h-4" />
                </div>
              )}
            </div>

            {/* Annotation Form */}
            <div className="border-t border-slate-200 bg-white p-5">
              <h3 className="text-sm font-bold text-slate-950 mb-4 uppercase tracking-wider">Expert Annotation</h3>
              <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      Error Type
                    </label>
                    <select
                      value={annotationType}
                      onChange={(event) => setAnnotationType(event.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 shadow-sm focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                    >
                      <option value="reasoning_gap">Reasoning Gap</option>
                      <option value="misconception">Misconception</option>
                      <option value="question_quality">Question Quality</option>
                      <option value="rubric_improvement">Rubric Improvement</option>
                      <option value="hint_ladder">Hint Ladder</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      Relevance Scope
                    </label>
                    <div className="space-y-2">
                      <label className={cn(
                        "flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all",
                        relevanceScope === "general" ? "border-slate-900 bg-slate-50" : "border-slate-200"
                      )}>
                        <input 
                          type="radio" 
                          name="scope" 
                          className="w-3 h-3 text-slate-900" 
                          checked={relevanceScope === "general"} 
                          onChange={() => setRelevanceScope("general")} 
                        />
                        <span className="text-xs font-medium">General Pedagogy</span>
                      </label>
                      <label className={cn(
                        "flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all",
                        relevanceScope === "framework_specific" ? "border-slate-900 bg-slate-50" : "border-slate-200"
                      )}>
                        <input 
                          type="radio" 
                          name="scope" 
                          className="w-3 h-3 text-slate-900" 
                          checked={relevanceScope === "framework_specific"} 
                          onChange={() => setRelevanceScope("framework_specific")} 
                        />
                        <span className="text-xs font-medium">Framework Specific</span>
                      </label>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => createAnnotationMutation.mutate()}
                    disabled={createAnnotationMutation.isPending || !annotationSummary.trim()}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {createAnnotationMutation.isPending ? (
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
                      Correction Summary
                    </label>
                    <textarea
                      value={annotationSummary}
                      onChange={(event) => setAnnotationSummary(event.target.value)}
                      rows={4}
                      placeholder="Explain exactly what the AI tutor should have done..."
                      className="w-full rounded-xl border border-slate-200 bg-[#FAFAFA] px-4 py-3 text-sm text-slate-900 shadow-sm focus:bg-white focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center justify-between">
                      <span>Evidence</span>
                      <span className="text-[10px] font-medium normal-case text-slate-400 flex items-center gap-1">
                        <Quote className="h-3 w-3" /> Hover transcript to quote
                      </span>
                    </label>
                    <textarea
                      value={annotationEvidence}
                      onChange={(event) => setAnnotationEvidence(event.target.value)}
                      rows={4}
                      placeholder="Paste or quote evidence from the transcript..."
                      className="w-full rounded-xl border border-slate-200 bg-[#FAFAFA] px-4 py-3 text-sm text-slate-900 shadow-sm focus:bg-white focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none transition-colors"
                    />
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 bg-[#FAFAFA]">
            <Brain className="h-12 w-12 text-slate-200 mb-4" />
            <h3 className="text-lg font-semibold text-slate-900">No Review Selected</h3>
            <p className="text-sm mt-1">Select an item from the queue to review the chat transcript.</p>
          </div>
        )}
      </div>
    </section>
  );
}
