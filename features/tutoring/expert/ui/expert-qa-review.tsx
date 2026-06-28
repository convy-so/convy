"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

import {
  EmptyReviewWorkspace,
  ReviewQueueSidebar,
  SelectedReviewWorkspace,
  type ReviewHistoryItem,
  type ReviewQueueItem,
  type TranscriptMessage,
} from "@/features/tutoring/expert/ui/expert-qa-review-sections";

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
  const [failureSummary, setFailureSummary] = useState("");
  const [reviewRationale, setReviewRationale] = useState("");
  const [improvedExample, setImprovedExample] = useState("");
  const [supportingEvidence, setSupportingEvidence] = useState("");
  const [annotationType, setAnnotationType] = useState("reasoning_gap");
  const [relevanceScope, setRelevanceScope] = useState<
    "general" | "framework_specific"
  >("general");
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const queueQuery = useQuery({
    queryKey: ["expertLearningReviewQueue"],
    queryFn: async () =>
      (await fetchJson<{ success: true; data: ReviewQueueItem[] }>(
        "/api/expert/review-queue",
      )).data,
  });

  const selectedQueueItem = useMemo(
    () =>
      queueQuery.data?.find((item) => item.key === selectedQueueKey) ??
      queueQuery.data?.[0] ??
      null,
    [queueQuery.data, selectedQueueKey],
  );

  const transcriptQuery = useQuery({
    queryKey: ["expertSessionTranscript", selectedQueueItem?.sessionId],
    queryFn: async () => {
      if (!selectedQueueItem?.sessionId) {
        return [];
      }
      return (
        await fetchJson<{ success: true; data: TranscriptMessage[] }>(
          `/api/expert/sessions/${selectedQueueItem.sessionId}/transcript`,
        )
      ).data;
    },
    enabled: Boolean(selectedQueueItem?.sessionId),
  });

  const reviewHistoryQuery = useQuery({
    queryKey: [
      "expertReviewHistory",
      selectedQueueItem?.lessonId,
      selectedQueueItem?.sessionId,
    ],
    queryFn: async () => {
      const search = new URLSearchParams();
      if (selectedQueueItem?.lessonId) {
        search.set("lessonId", selectedQueueItem.lessonId);
      }
      if (selectedQueueItem?.sessionId) {
        search.set("sessionId", selectedQueueItem.sessionId);
      }
      return (
        await fetchJson<{ success: true; data: ReviewHistoryItem[] }>(
          `/api/expert/annotations?${search.toString()}`,
        )
      ).data;
    },
    enabled: Boolean(selectedQueueItem?.lessonId || selectedQueueItem?.sessionId),
  });

  useEffect(() => {
    if (transcriptQuery.isSuccess && transcriptQuery.data.length > 0) {
      setTimeout(() => {
        transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, [transcriptQuery.isSuccess, transcriptQuery.data, selectedQueueKey]);

  const createAnnotationMutation = useMutation({
    mutationFn: async () => {
      if (!selectedQueueItem) {
        throw new Error("Pick a queue item first.");
      }

      return await fetchJson<{ success: true }>("/api/expert/annotations", {
        method: "POST",
        body: JSON.stringify({
          lessonId: selectedQueueItem.lessonId,
          sessionId: selectedQueueItem.sessionId,
          classroomStudentId: selectedQueueItem.classroomStudentId,
          reviewType: annotationType,
          priority: selectedQueueItem.priority,
          tutorFailureSummary: failureSummary.trim(),
          expertCorrection: [
            reviewRationale.trim()
              ? `Rationale:\n${reviewRationale.trim()}`
              : "",
            improvedExample.trim()
              ? `Improved example:\n${improvedExample.trim()}`
              : "",
            supportingEvidence.trim()
              ? `Supporting evidence:\n${supportingEvidence.trim()}`
              : "",
          ]
            .filter(Boolean)
            .join("\n\n"),
          relevanceScope,
          metadata: {
            reviewQueueKey: selectedQueueItem.key,
            reasons: selectedQueueItem.reasons,
            reviewRationale: reviewRationale.trim(),
            improvedExample: improvedExample.trim(),
            supportingEvidence: supportingEvidence.trim(),
          },
        }),
      });
    },
    onSuccess: async () => {
      setFailureSummary("");
      setReviewRationale("");
      setImprovedExample("");
      setSupportingEvidence("");
      toast.success("Review saved");
      await queryClient.invalidateQueries({
        queryKey: ["expertLearningReviewQueue"],
      });
      if (queueQuery.data) {
        const currentIndex = queueQuery.data.findIndex(
          (item) => item.key === selectedQueueItem?.key,
        );
        const nextItem = queueQuery.data[currentIndex + 1];
        if (nextItem) {
          setSelectedQueueKey(nextItem.key);
        }
      }
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Failed to save annotation",
      ),
  });

  const handleQuoteMessage = (message: TranscriptMessage) => {
    const formattedQuote = `> **${message.role === "assistant" ? "AI Tutor" : "Student"}**: ${message.content}\n\n`;
    setSupportingEvidence((previousValue) =>
      previousValue ? `${previousValue}\n${formattedQuote}` : formattedQuote,
    );
    toast.success("Quoted to evidence");
  };

  return (
    <section className="grid gap-6 xl:grid-cols-[380px_1fr] h-[calc(100vh-140px)]">
      <ReviewQueueSidebar
        queue={queueQuery.data ?? []}
        isLoading={queueQuery.isLoading}
        selectedQueueKey={selectedQueueItem?.key ?? selectedQueueKey}
        onSelectQueueItem={setSelectedQueueKey}
      />

      {selectedQueueItem ? (
        <SelectedReviewWorkspace
          selectedQueueItem={selectedQueueItem}
          transcript={transcriptQuery.data ?? []}
          isTranscriptLoading={transcriptQuery.isLoading}
          transcriptEndRef={transcriptEndRef}
          onQuoteMessage={handleQuoteMessage}
          annotationType={annotationType}
          onAnnotationTypeChange={setAnnotationType}
          relevanceScope={relevanceScope}
          onRelevanceScopeChange={setRelevanceScope}
          failureSummary={failureSummary}
          onFailureSummaryChange={setFailureSummary}
          reviewRationale={reviewRationale}
          onReviewRationaleChange={setReviewRationale}
          improvedExample={improvedExample}
          onImprovedExampleChange={setImprovedExample}
          supportingEvidence={supportingEvidence}
          onSupportingEvidenceChange={setSupportingEvidence}
          onSubmitReview={() => createAnnotationMutation.mutate()}
          isSubmittingReview={createAnnotationMutation.isPending}
          reviewHistory={reviewHistoryQuery.data ?? []}
          isReviewHistoryLoading={reviewHistoryQuery.isLoading}
        />
      ) : (
        <EmptyReviewWorkspace />
      )}
    </section>
  );
}
