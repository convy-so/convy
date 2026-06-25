"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Loader2, Save } from "lucide-react";
import toast from "react-hot-toast";

import {
  normalizeLearningOutcomesAction,
  updateLearningTopicDetailsAction,
} from "@/app/actions/classroom";
import { Link } from "@/i18n/routing";
import {
  fetchTopicMaterialUploadAttempts,
  fetchTopicMaterials,
  retryTopicMaterialUploadAttempt,
  uploadTopicMaterial,
  type TopicMaterialUploadAttempt,
} from "@/features/tutoring/public-client";
import { getFriendlyActionError } from "@/shared/http/friendly-action-error";
import { getSubjectDisplayLabel } from "@/features/tutoring/server/subject-packages";
import {
  formatOutcomesForNotes,
  parseOutcomeNotes,
  toOutcomePayload,
} from "@/features/tutoring/ui/lesson-editor-helpers";
import { cn } from "@/shared/ui/tailwind-class-utils";

import { LessonSetupDetailsSection } from "./details-section";
import { LessonSetupMaterialsSection } from "./materials-section";
import { LessonSetupOutcomesSection } from "./outcomes-section";
import { LessonSetupScopeSection } from "./scope-section";
import type {
  LessonSetupPageProps,
  TopicMaterialListItem,
} from "./lesson-setup-page-model";

export function LessonSetupPage({
  initialData,
  initialMaterials,
}: LessonSetupPageProps) {
  const { topic, classroom } = initialData.data;
  const sourceBoundary = topic.sourceBoundary ?? {
    teacherSummary: "",
    scopeNotes: [],
    notationNotes: [],
    rigorNotes: [],
  };
  const initialMaterialList: TopicMaterialListItem[] = (initialMaterials.data ?? []).map(
    (material) => ({
      id: material.id,
      title: material.title,
      description: material.description ?? null,
      materialKind: material.materialKind,
      extractionStatus: material.extractionStatus,
      indexingStatus: material.indexingStatus,
      mimeType: material.mimeType,
      createdAt:
        material.createdAt instanceof Date
          ? material.createdAt
          : new Date(material.createdAt),
      analysis: material.analysis,
    }),
  );

  const [title, setTitle] = useState(topic.title);
  const [description, setDescription] = useState(topic.description);
  const [rawOutcomeNotes, setRawOutcomeNotes] = useState(
    formatOutcomesForNotes(topic.learningOutcomes ?? []),
  );
  const [outcomeReviewNotes, setOutcomeReviewNotes] = useState<string[]>([]);
  const [scopeNotes, setScopeNotes] = useState(
    (sourceBoundary.scopeNotes ?? []).join("\n"),
  );
  const [materials, setMaterials] = useState<TopicMaterialListItem[]>(initialMaterialList);
  const [materialTitle, setMaterialTitle] = useState("");
  const [materialDescription, setMaterialDescription] = useState("");
  const [materialFiles, setMaterialFiles] = useState<File[]>([]);
  const [uploadAttempts, setUploadAttempts] = useState<TopicMaterialUploadAttempt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [retryingAttemptId, setRetryingAttemptId] = useState<string | null>(null);
  const [isGeneratingOutcomes, setIsGeneratingOutcomes] = useState(false);

  const subjectName = useMemo(
    () => topic.courseTitle ?? getSubjectDisplayLabel(null),
    [topic.courseTitle],
  );
  const visibleUploadAttempts = uploadAttempts.filter(
    (attempt) => attempt.status !== "succeeded",
  );

  useEffect(() => {
    let cancelled = false;

    void fetchTopicMaterialUploadAttempts(topic.id)
      .then((result) => {
        if (!cancelled) {
          setUploadAttempts(result.data);
        }
      })
      .catch((err) => {
        console.warn("[topic-setup] failed to load material upload attempts", err);
      });

    return () => {
      cancelled = true;
    };
  }, [topic.id]);

  useEffect(() => {
    if (
      !uploadAttempts.some(
        (attempt) => attempt.status === "queued" || attempt.status === "processing",
      )
    ) {
      return;
    }

    const refreshUploads = async () => {
      try {
        const [attemptResult, materialResult] = await Promise.all([
          fetchTopicMaterialUploadAttempts(topic.id),
          fetchTopicMaterials(topic.id),
        ]);

        setUploadAttempts(attemptResult.data);
        setMaterials(
          materialResult.data.map((material) => ({
            id: material.id,
            title: material.title,
            description: material.description ?? null,
            materialKind: material.materialKind,
            extractionStatus: material.extractionStatus,
            indexingStatus: material.indexingStatus,
            mimeType: material.mimeType,
            createdAt:
              material.createdAt instanceof Date
                ? material.createdAt
                : new Date(material.createdAt),
            analysis: material.analysis,
          })),
        );
      } catch (err) {
        console.warn("[topic-setup] failed to refresh material upload state", err);
      }
    };

    const interval = window.setInterval(() => {
      void refreshUploads();
    }, 2500);

    return () => window.clearInterval(interval);
  }, [topic.id, uploadAttempts]);

  const handleRetryAttempt = async (attemptId: string) => {
    setRetryingAttemptId(attemptId);

    try {
      const result = await retryTopicMaterialUploadAttempt({
        topicId: topic.id,
        attemptId,
      });

      const [attemptResult, materialResult] = await Promise.all([
        fetchTopicMaterialUploadAttempts(topic.id),
        fetchTopicMaterials(topic.id),
      ]);

      setUploadAttempts(attemptResult.data);
      setMaterials(
        materialResult.data.map((material) => ({
          id: material.id,
          title: material.title,
          description: material.description ?? null,
          materialKind: material.materialKind,
          extractionStatus: material.extractionStatus,
          indexingStatus: material.indexingStatus,
          mimeType: material.mimeType,
          createdAt:
            material.createdAt instanceof Date
              ? material.createdAt
              : new Date(material.createdAt),
          analysis: material.analysis,
        })),
      );

      if (result.data.attempt.status === "queued") {
        toast.success("Material retry queued");
      } else {
        toast.error(
          result.data.attempt.userMessage ??
            result.data.attempt.failureMessage ??
            "This file could not be re-queued.",
        );
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to retry this upload",
      );
    } finally {
      setRetryingAttemptId(null);
    }
  };

  const handleGenerateOutcomes = async () => {
    const notes = rawOutcomeNotes.trim();

    if (!notes) {
      setError("Add the teacher's learning goal notes before generating outcomes.");
      return;
    }

    setError(null);
    setIsGeneratingOutcomes(true);

    try {
      const result = await normalizeLearningOutcomesAction({
        topicId: topic.id,
        rawNotes: notes,
        title: title.trim() || topic.title,
        description: description.trim() || "",
      });

      if (!result.success) {
        throw new Error(getFriendlyActionError(result.error));
      }

      setRawOutcomeNotes(formatOutcomesForNotes(result.data.outcomes));
      setOutcomeReviewNotes(
        result.data.outcomes
          .map((outcome) => outcome.reviewNote)
          .filter((note): note is string => Boolean(note)),
      );
      toast.success("Learning outcomes rewritten");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to generate learning outcomes",
      );
    } finally {
      setIsGeneratingOutcomes(false);
    }
  };

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const normalizedOutcomes = toOutcomePayload(parseOutcomeNotes(rawOutcomeNotes));

      if (!normalizedOutcomes.length) {
        throw new Error(
          "Add at least one reviewed learning outcome before saving this session.",
        );
      }

      const result = await updateLearningTopicDetailsAction({
        topicId: topic.id,
        title: title.trim(),
        description: description.trim() || "",
        learningOutcomes: normalizedOutcomes,
        sourceBoundary: {
          teacherSummary: description.trim() || "",
          scopeNotes: scopeNotes
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
          notationNotes: [],
          rigorNotes: [],
        },
      });

      if (!result.success) {
        throw new Error(getFriendlyActionError(result.error));
      }

      toast.success("Session saved");
      setRawOutcomeNotes(formatOutcomesForNotes(normalizedOutcomes));
      setOutcomeReviewNotes([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save session");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpload = async () => {
    if (!materialFiles.length) {
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const result = await uploadTopicMaterial({
        topicId: topic.id,
        files: materialFiles,
        title: materialTitle.trim() || undefined,
        description: materialDescription.trim() || undefined,
      });

      setUploadAttempts((current) => [...result.data.attempts, ...current]);
      setMaterialTitle("");
      setMaterialDescription("");
      setMaterialFiles([]);
      const queuedCount = result.data.attempts.filter(
        (attempt) => attempt.status !== "failed",
      ).length;
      const failedCount = result.data.attempts.length - queuedCount;
      if (queuedCount > 0) {
        toast.success(
          queuedCount === 1
            ? "Material queued for processing"
            : `${queuedCount} materials queued for processing`,
        );
      }
      if (failedCount > 0) {
        setError("Some files could not be queued. Review the upload list below.");
        toast.error(
          failedCount === 1
            ? "One file could not be queued"
            : `${failedCount} files could not be queued`,
        );
      } else {
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload material");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="mx-auto max-w-[980px] space-y-8 px-2 pb-12">
      <Link
        href="/dashboard/learning"
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-950"
      >
        <div className="rounded-lg border border-slate-200 bg-white p-1.5">
          <ChevronLeft className="h-4 w-4" />
        </div>
        Back to classrooms
      </Link>

      <section className="border-b border-slate-200 pb-6">
        <div className="space-y-3">
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
            Session setup
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span>{classroom.title}</span>
            <span>&bull;</span>
            <span>{subjectName}</span>
            <span>&bull;</span>
            <span className="capitalize">{topic.status}</span>
          </div>
          <p className="max-w-3xl text-sm leading-6 text-slate-500">
            Define what this session should cover, upload the supporting learning material,
            and add any scope boundaries the tutor should respect.
          </p>
        </div>
      </section>

      <form
        onSubmit={(event) => {
          void handleSave(event);
        }}
        className="space-y-6"
      >
        <LessonSetupDetailsSection
          subjectName={subjectName}
          title={title}
          description={description}
          setTitle={setTitle}
          setDescription={setDescription}
        />

        <LessonSetupOutcomesSection
          rawOutcomeNotes={rawOutcomeNotes}
          setRawOutcomeNotes={(value) => {
            setRawOutcomeNotes(value);
            setOutcomeReviewNotes([]);
          }}
          outcomeReviewNotes={outcomeReviewNotes}
          isGeneratingOutcomes={isGeneratingOutcomes}
          handleGenerateOutcomes={handleGenerateOutcomes}
        />

        <LessonSetupMaterialsSection
          materialTitle={materialTitle}
          setMaterialTitle={setMaterialTitle}
          materialDescription={materialDescription}
          setMaterialDescription={setMaterialDescription}
          materialFiles={materialFiles}
          setMaterialFiles={setMaterialFiles}
          isUploading={isUploading}
          handleUpload={handleUpload}
          visibleUploadAttempts={visibleUploadAttempts}
          retryingAttemptId={retryingAttemptId}
          handleRetryAttempt={handleRetryAttempt}
          materials={materials}
        />

        <LessonSetupScopeSection
          scopeNotes={scopeNotes}
          setScopeNotes={setScopeNotes}
        />

        {error ? (
          <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">
            {error}
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-3">
          <Link
            href="/dashboard/learning"
            className="px-3 py-2 text-sm font-medium text-slate-500 transition hover:text-slate-900"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting || !title.trim()}
            className={cn(
              "inline-flex min-w-[160px] items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save session
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
