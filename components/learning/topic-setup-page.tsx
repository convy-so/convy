"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ExternalLink,
  FileText,
  Loader2,
  RotateCcw,
  Save,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import toast from "react-hot-toast";

import {
  normalizeLearningOutcomesAction,
  updateLearningTopicDetailsAction,
} from "@/app/actions/classroom";
import { InputField } from "@/components/auth/input-field";
import { TextareaField } from "@/components/auth/textarea-field";
import { Link } from "@/i18n/routing";
import {
  fetchTopicMaterialUploadAttempts,
  fetchTopicMaterials,
  retryTopicMaterialUploadAttempt,
  uploadTopicMaterial,
  type TopicMaterialUploadAttempt,
} from "@/lib/api/learning";
import { getFriendlyActionError } from "@/lib/action-ux";
import { getSubjectDisplayLabel } from "@/lib/learning/subject-packages";
import type {
  getTopicMaterialsData,
  getTopicSetupData,
} from "@/lib/server/app-queries";
import { cn } from "@/lib/utils";

type TopicMaterialItem = Awaited<ReturnType<typeof getTopicMaterialsData>>["data"][number];
type TopicMaterialListItem = Pick<
  TopicMaterialItem,
  | "id"
  | "title"
  | "description"
  | "materialKind"
  | "extractionStatus"
  | "indexingStatus"
  | "mimeType"
  | "createdAt"
  | "analysis"
>;

type OutcomeDraft = {
  id: string;
  title: string;
  description: string;
  reviewNote: string | null;
};

function toOutcomePayload(outcomes: OutcomeDraft[]) {
  return outcomes
    .map((outcome, index) => ({
      id: outcome.id || `outcome-${index + 1}`,
      title: outcome.title.trim(),
      description: outcome.description.trim(),
    }))
    .filter((outcome) => outcome.title && outcome.description);
}

function formatOutcomesForNotes(
  outcomes: Array<{ title: string; description: string }>,
) {
  return outcomes
    .map((outcome, index) => {
      const title = outcome.title.trim();
      const description = outcome.description.trim();
      return `${index + 1}. ${title}${description && description !== title ? `: ${description}` : ""}`;
    })
    .join("\n");
}

function parseOutcomeNotes(raw: string): OutcomeDraft[] {
  return raw
    .split("\n")
    .map((line) =>
      line
        .trim()
        .replace(/^\d+[\.)]\s*/, "")
        .replace(/^[-*]\s*/, ""),
    )
    .filter(Boolean)
    .map((line, index) => {
      const [titlePart, ...descriptionParts] = line.split(":");
      const title = titlePart.trim();
      const description = descriptionParts.join(":").trim() || title;

      return {
        id: `text-outcome-${index + 1}`,
        title,
        description,
        reviewNote: null,
      };
    });
}

function formatAttemptStatus(attempt: TopicMaterialUploadAttempt) {
  const stageLabel =
    attempt.stage === "pack_build"
      ? "pack build"
      : attempt.stage === "analysis"
        ? "analysis"
        : attempt.stage;

  if (attempt.status === "failed") return `Failed during ${stageLabel}`;
  if (attempt.status === "succeeded") return "Processed";
  if (attempt.status === "queued") return `Queued for ${stageLabel}`;
  return `Processing: ${stageLabel}`;
}

export function TopicSetupPage({
  initialData,
  initialMaterials,
}: {
  initialData: Awaited<ReturnType<typeof getTopicSetupData>>;
  initialMaterials: Awaited<ReturnType<typeof getTopicMaterialsData>>;
}) {
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
        (attempt) =>
          attempt.status === "queued" || attempt.status === "processing",
      )
    ) {
      return;
    }

    const interval = window.setInterval(async () => {
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

      <form onSubmit={handleSave} className="space-y-6">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="text-lg font-semibold tracking-tight text-slate-950">
              Session details
            </h2>
          </div>
          <div className="grid gap-5 px-6 py-5">
            <InputField
              label="Session title"
              id="setup-session-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />

            <div className="grid gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
              <div>
                <label className="mb-2 block text-sm font-medium text-[#292929]">
                  Subject
                </label>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  {subjectName}
                </div>
              </div>

              <TextareaField
                label="Session overview"
                id="setup-session-overview"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
                placeholder="Briefly describe what this session will cover."
                className="resize-none"
              />
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-6 py-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold tracking-tight text-slate-950">
                Learning outcomes
              </h2>
              <p className="text-sm leading-6 text-slate-500">
                Start with rough teaching notes, then review the clearer outcomes before
                saving the session.
              </p>
            </div>
          </div>
          <div className="space-y-6 px-6 py-5">
            <div className="space-y-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Step 1
                </p>
                <h3 className="text-base font-semibold text-slate-950">
                  Describe what students should learn
                </h3>
                <p className="text-sm leading-6 text-slate-500">
                  Write in the way that feels natural to you. Bullets, rough notes, and
                  longer paragraphs all work.
                </p>
              </div>
              <TextareaField
                label="Teacher notes"
                id="setup-session-outcome-notes"
                value={rawOutcomeNotes}
                onChange={(event) => {
                  setRawOutcomeNotes(event.target.value);
                  setOutcomeReviewNotes([]);
                }}
                rows={8}
                placeholder={
                  "Students should explain Newton's first law with everyday examples, distinguish balanced from unbalanced forces, and solve simple F = ma questions. I want them to stay within one-dimensional motion and use SI units."
                }
                helperText="You do not need to format this perfectly. Generate will rewrite this same box into stronger outcomes."
                className={`resize-none transition duration-300 ${
                  isGeneratingOutcomes
                    ? "border-sky-200 bg-sky-50/70 shadow-[0_0_0_4px_rgba(14,165,233,0.08)]"
                    : ""
                }`}
              />
              {outcomeReviewNotes.length ? (
                <div className="animate-in fade-in slide-in-from-top-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                  <span className="font-medium">Review:</span>{" "}
                  {outcomeReviewNotes.join(" ")}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-sky-100 bg-gradient-to-r from-sky-50 via-white to-emerald-50 px-4 py-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Step 2
                </p>
                <p className="text-sm leading-6 text-slate-600">
                  Rewrite the notes in place, then edit the same box until the outcomes
                  are sharp enough to save.
                </p>
              </div>
              <button
                type="button"
                onClick={handleGenerateOutcomes}
                disabled={isGeneratingOutcomes || !rawOutcomeNotes.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isGeneratingOutcomes ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Rewriting...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Rewrite outcomes
                  </>
                )}
              </button>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="text-lg font-semibold tracking-tight text-slate-950">
              Learning material
            </h2>
          </div>
          <div className="space-y-5 px-6 py-5">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <InputField
                label="Material title"
                id="setup-material-title"
                value={materialTitle}
                onChange={(event) => setMaterialTitle(event.target.value)}
                placeholder="Optional title"
              />
              <InputField
                label="How it should be used"
                id="setup-material-description"
                value={materialDescription}
                onChange={(event) => setMaterialDescription(event.target.value)}
                placeholder="Optional note for the tutor"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center transition hover:border-slate-300 hover:bg-white">
                <UploadCloud className="h-7 w-7 text-slate-300" />
                <div className="mt-4 text-sm font-semibold text-slate-700">
                  {materialFiles.length
                    ? `${materialFiles.length} file${materialFiles.length === 1 ? "" : "s"} selected`
                    : "Select files to ground this session"}
                </div>
                <div className="mt-2 text-xs text-slate-400">
                  PDF, DOCX, TXT
                </div>
                {materialFiles.length ? (
                  <div className="mt-3 max-w-full space-y-1 text-xs text-slate-500">
                    {materialFiles.slice(0, 4).map((file) => (
                      <div key={`${file.name}-${file.size}`} className="truncate">
                        {file.name}
                      </div>
                    ))}
                    {materialFiles.length > 4 ? (
                      <div>+{materialFiles.length - 4} more</div>
                    ) : null}
                  </div>
                ) : null}
                <input
                  type="file"
                  accept=".pdf,.docx,.txt"
                  multiple
                  className="hidden"
                  onChange={(event) =>
                    setMaterialFiles(Array.from(event.target.files ?? []))
                  }
                />
              </label>

              <button
                type="button"
                onClick={handleUpload}
                disabled={isUploading || !materialFiles.length}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <UploadCloud className="h-4 w-4" />
                    Upload materials
                  </>
                )}
              </button>
            </div>

            {visibleUploadAttempts.length ? (
              <div className="space-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3">
                {visibleUploadAttempts.map((attempt) => (
                  <div
                    key={attempt.id}
                    className="flex flex-col gap-1 border-b border-slate-100 py-2 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-900">
                        {attempt.fileName}
                      </div>
                      <div className="text-xs text-slate-500">
                        {formatAttemptStatus(attempt)}
                      </div>
                    </div>
                    {attempt.status === "failed" ? (
                      <div className="flex max-w-md items-start gap-3 text-xs leading-5 text-amber-800">
                        <div className="min-w-0">
                          {attempt.userMessage ||
                            attempt.failureMessage ||
                            "This file could not be processed."}{" "}
                          {attempt.retryable && attempt.storagePath
                            ? "Retry this file from the saved upload."
                            : "Re-upload this file to try again."}
                          {process.env.NODE_ENV !== "production" &&
                          attempt.internalError ? (
                            <div className="mt-2 rounded-md border border-amber-200 bg-amber-50/70 px-2 py-1 font-mono text-[11px] leading-4 text-amber-950">
                              {attempt.internalError}
                            </div>
                          ) : null}
                        </div>
                        {attempt.retryable && attempt.storagePath ? (
                          <button
                            type="button"
                            onClick={() => void handleRetryAttempt(attempt.id)}
                            disabled={retryingAttemptId === attempt.id}
                            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 font-medium text-amber-900 transition hover:border-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {retryingAttemptId === attempt.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3.5 w-3.5" />
                            )}
                            Retry
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                    )}
                  </div>
                ))}
              </div>
            ) : null}

            <div className="space-y-3">
              {materials.length ? (
                materials.map((material) => (
                  <div
                    key={material.id}
                    className="flex flex-col gap-3 rounded-xl border border-slate-200 px-4 py-4 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                        <FileText className="h-4 w-4 text-slate-400" />
                        <span className="truncate">{material.title}</span>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {material.materialKind} &bull; {material.mimeType}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right text-[11px] text-slate-500">
                        <div>{material.extractionStatus}</div>
                        <div className="mt-1">{material.indexingStatus}</div>
                      </div>
                      <a
                        href={`/api/media/learning/${material.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-950"
                      >
                        Open <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">
                  No learning material uploaded yet.
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="text-lg font-semibold tracking-tight text-slate-950">
              Session scope
            </h2>
          </div>
          <div className="px-6 py-5">
            <TextareaField
              label="Scope guidance"
              id="setup-scope-notes"
              value={scopeNotes}
              onChange={(event) => setScopeNotes(event.target.value)}
              rows={5}
              placeholder={
                "Stay within Newtonian mechanics\nDo not introduce relativity\nFocus on forces in one dimension"
              }
              helperText="Optional. Add boundaries or exclusions, one point per line."
              className="resize-none"
            />
          </div>
        </section>

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
