"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, FileText, Loader2, Sparkles, UploadCloud, Users } from "lucide-react";
import toast from "react-hot-toast";

import { normalizeLearningOutcomesAction, updateLearningTopicDetailsAction } from "@/app/actions/classroom";
import { Link } from "@/i18n/routing";
import { getFriendlyActionError } from "@/lib/action-ux";
import { appLocaleLabels } from "@/lib/i18n/config";
import { getSubjectDisplayLabel } from "@/lib/learning/subject-packages";
import { queryKeys } from "@/lib/query-keys";

type TopicView = "overview" | "reports" | "students";
type TopicStatus = "draft" | "active" | "paused" | "archived";

type TopicReport = {
  id: string;
  updatedAt: string | Date;
  masteryPercent: number;
  report: {
    studentSummary: string;
    identifiedGaps?: string[] | null;
  };
  student: {
    id: string;
    fullName: string;
  };
};

type TopicMaterial = {
  id: string;
  title: string;
  materialKind: string;
  mimeType: string;
  extractionStatus: string;
  indexingStatus: string;
  analysis?: Record<string, unknown>;
};

type MaterialUploadAttempt = {
  id: string;
  fileName: string;
  status: "queued" | "processing" | "succeeded" | "failed";
  stage: "upload" | "extraction" | "review" | "indexing";
  failureMessage?: string | null;
  materialId?: string | null;
};

type TopicStudent = {
  id: string;
  fullName: string;
  email: string;
};

type OutcomeDraft = {
  id: string;
  title: string;
  description: string;
  reviewNote: string | null;
};

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatTopicStatusLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function toOutcomeDrafts(
  outcomes: Array<{
    id?: string;
    title: string;
    description: string;
  }>,
): OutcomeDraft[] {
  return outcomes.map((outcome, index) => ({
    id: outcome.id ?? `outcome-${index + 1}`,
    title: outcome.title,
    description: outcome.description,
    reviewNote: null,
  }));
}

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

function getStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function getMaterialReviewState(material: TopicMaterial) {
  const analysis = material.analysis ?? {};
  const failed =
    analysis.analysisStatus === "failed" ||
    analysis.status === "failed" ||
    typeof analysis.analysisError === "string";
  const coverage = getStringArray(analysis.coverageObservations);
  const recommendedEdits = getStringArray(analysis.recommendedOutcomeEdits);
  const groundingSummary =
    typeof analysis.groundingSummary === "string" ? analysis.groundingSummary : "";

  return { failed, coverage, recommendedEdits, groundingSummary };
}

function formatAttemptStatus(attempt: MaterialUploadAttempt) {
  if (attempt.status === "failed") return `Failed during ${attempt.stage}`;
  if (attempt.status === "succeeded") return "Processed";
  if (attempt.status === "queued") return "Queued";
  return `Processing: ${attempt.stage}`;
}

export function TeacherTopicWorkspace({
  selectedDirectoryClassroom,
  selectedTopic,
  reports,
  materials,
  students,
  activeTopicView,
  setActiveTopicView,
  updateTopicStatusMutation,
  materialTitle,
  setMaterialTitle,
  materialDescription,
  setMaterialDescription,
  materialFiles,
  setMaterialFiles,
  materialUploadAttempts,
  uploadMaterialMutation,
  setIsInviteModalOpen,
}: {
  selectedDirectoryClassroom: { id: string; title: string };
  selectedTopic: {
    id: string;
    title: string;
    description?: string | null;
    status: string;
    subject?: string | null;
    subjectKey?: string | null;
    contentLocale?: string | null;
    learningOutcomes?: Array<{
      id?: string;
      title: string;
      description: string;
    }> | null;
  };
  reports: TopicReport[];
  materials: TopicMaterial[];
  students: TopicStudent[];
  activeTopicView: TopicView;
  setActiveTopicView: Dispatch<SetStateAction<TopicView>>;
  updateTopicStatusMutation: {
    mutate: (payload: { topicId: string; status: TopicStatus }) => void;
    isPending: boolean;
  };
  materialTitle: string;
  setMaterialTitle: Dispatch<SetStateAction<string>>;
  materialDescription: string;
  setMaterialDescription: Dispatch<SetStateAction<string>>;
  materialFiles: File[];
  setMaterialFiles: Dispatch<SetStateAction<File[]>>;
  materialUploadAttempts: MaterialUploadAttempt[];
  uploadMaterialMutation: {
    mutate: (
      payload: {
        topicId: string;
        files: File[];
        title?: string;
        description?: string;
      },
      options: { onSuccess: () => void },
    ) => void;
    isPending: boolean;
  };
  setIsInviteModalOpen: Dispatch<SetStateAction<boolean>>;
}) {
  const queryClient = useQueryClient();
  const topicSubjectLabel =
    selectedTopic.subject ??
    getSubjectDisplayLabel(selectedTopic.subjectKey ?? "mathematics");
  const topicLocaleLabel =
    appLocaleLabels[
      (selectedTopic.contentLocale ?? "en") as keyof typeof appLocaleLabels
    ];
  const [rawOutcomeNotes, setRawOutcomeNotes] = useState(
    formatOutcomesForNotes(toOutcomeDrafts(selectedTopic.learningOutcomes ?? [])),
  );
  const [sessionTitle, setSessionTitle] = useState(selectedTopic.title);
  const [isSavingSessionTitle, setIsSavingSessionTitle] = useState(false);
  const [outcomeReviewNotes, setOutcomeReviewNotes] = useState<string[]>([]);
  const [isGeneratingOutcomes, setIsGeneratingOutcomes] = useState(false);
  const [isSavingOutcomes, setIsSavingOutcomes] = useState(false);
  const learningOutcomes = parseOutcomeNotes(rawOutcomeNotes).filter(
    (outcome) => outcome.title.trim() && outcome.description.trim(),
  );
  const validMaterials = materials.filter((material) => {
    const review = getMaterialReviewState(material);
    return (
      material.extractionStatus === "completed" &&
      material.indexingStatus === "completed" &&
      !review.failed
    );
  });
  const visibleUploadAttempts = materialUploadAttempts.filter(
    (attempt) => attempt.status !== "succeeded",
  );
  const hasRequiredSetup =
    learningOutcomes.length > 0 && validMaterials.length > 0;
  const canActivate =
    (selectedTopic.status === "draft" || selectedTopic.status === "paused") &&
    hasRequiredSetup;
  const canPause = selectedTopic.status === "active";
  const canArchive = selectedTopic.status === "active";

  let statusHint =
    "To activate this session, add at least one learning outcome and one supporting material.";
  if (selectedTopic.status === "active") {
    statusHint = "This session is live for tutoring. You can pause it or archive it.";
  } else if (selectedTopic.status === "paused") {
    statusHint = hasRequiredSetup
      ? "This session is paused. Resume it when students should access it again."
      : "This session is paused, but the required setup is incomplete.";
  } else if (selectedTopic.status === "archived") {
    statusHint = "This session is archived and no longer active for students.";
  } else if (!hasRequiredSetup) {
    const missing = [
      learningOutcomes.length === 0 ? "learning outcomes" : null,
      materials.length === 0 ? "supporting material" : null,
    ]
      .filter(Boolean)
      .join(" and ");
    statusHint = `Still needed before activation: ${missing}.`;
  }

  useEffect(() => {
    setSessionTitle(selectedTopic.title);
    const nextDrafts = toOutcomeDrafts(selectedTopic.learningOutcomes ?? []);
    setRawOutcomeNotes(formatOutcomesForNotes(nextDrafts));
    setOutcomeReviewNotes([]);
  }, [selectedTopic.id, selectedTopic.title, selectedTopic.learningOutcomes]);

  const invalidateTopicData = async () => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.learning.topics(selectedDirectoryClassroom.id),
    });
  };

  const handleSaveSessionTitle = async () => {
    const nextTitle = sessionTitle.trim();

    if (nextTitle.length < 2) {
      toast.error("Session title must be at least 2 characters.");
      return;
    }

    setIsSavingSessionTitle(true);

    try {
      const result = await updateLearningTopicDetailsAction({
        topicId: selectedTopic.id,
        title: nextTitle,
      });

      if (!result.success) {
        throw new Error(getFriendlyActionError(result.error));
      }

      setSessionTitle(result.data.title);
      await invalidateTopicData();
      toast.success("Session title updated");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update session title",
      );
    } finally {
      setIsSavingSessionTitle(false);
    }
  };

  const handleGenerateOutcomes = async () => {
    const notes = rawOutcomeNotes.trim();

    if (!notes) {
      toast.error("Add the teacher's learning goal notes first.");
      return;
    }

    setIsGeneratingOutcomes(true);

    try {
      const result = await normalizeLearningOutcomesAction({
        topicId: selectedTopic.id,
        rawNotes: notes,
        title: selectedTopic.title,
        description: selectedTopic.description ?? "",
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
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to generate outcomes",
      );
    } finally {
      setIsGeneratingOutcomes(false);
    }
  };

  const handleSaveOutcomes = async () => {
    const normalizedOutcomes = toOutcomePayload(parseOutcomeNotes(rawOutcomeNotes));

    if (!normalizedOutcomes.length) {
      toast.error("Add at least one learning outcome before saving.");
      return;
    }

    setIsSavingOutcomes(true);

    try {
      const result = await updateLearningTopicDetailsAction({
        topicId: selectedTopic.id,
        learningOutcomes: normalizedOutcomes,
      });

      if (!result.success) {
        throw new Error(getFriendlyActionError(result.error));
      }

      setRawOutcomeNotes(formatOutcomesForNotes(normalizedOutcomes));
      setOutcomeReviewNotes([]);
      await invalidateTopicData();
      toast.success("Learning outcomes saved");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save outcomes",
      );
    } finally {
      setIsSavingOutcomes(false);
    }
  };

  return (
    <>
      <section className="space-y-4 border-b border-slate-200 pb-6">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span>{selectedDirectoryClassroom.title}</span>
            <span>&bull;</span>
            <span>{topicSubjectLabel}</span>
            <span>&bull;</span>
            <span>{topicLocaleLabel}</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
            {sessionTitle}
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-slate-500">
            Start by finishing the setup for this session, then activate it once the
            learning goals and supporting material are ready.
          </p>
        </div>

        <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                {formatTopicStatusLabel(selectedTopic.status)}
              </span>
              {!hasRequiredSetup ? (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700">
                  Setup incomplete
                </span>
              ) : null}
            </div>
            <p className="text-sm leading-6 text-slate-500">{statusHint}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                updateTopicStatusMutation.mutate({
                  topicId: selectedTopic.id,
                  status: "active",
                })
              }
              disabled={!canActivate || updateTopicStatusMutation.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {selectedTopic.status === "active" ? <Check className="h-4 w-4" /> : null}
              {selectedTopic.status === "paused" ? "Resume session" : "Activate session"}
            </button>
            <button
              type="button"
              onClick={() =>
                updateTopicStatusMutation.mutate({
                  topicId: selectedTopic.id,
                  status: "paused",
                })
              }
              disabled={!canPause || updateTopicStatusMutation.isPending}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Pause
            </button>
            <button
              type="button"
              onClick={() =>
                updateTopicStatusMutation.mutate({
                  topicId: selectedTopic.id,
                  status: "archived",
                })
              }
              disabled={!canArchive || updateTopicStatusMutation.isPending}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Archive
            </button>
          </div>
        </div>
      </section>

      <div className="border-b border-slate-200">
        <nav className="-mb-px flex flex-wrap items-center gap-6">
          {(
            [
              ["overview", "Overview", null],
              ["reports", "Reports", reports.length],
              ["students", "Students", students.length],
            ] as const
          ).map(([view, label, count]) => (
            <button
              key={view}
              type="button"
              onClick={() => setActiveTopicView(view)}
              className={`inline-flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                activeTopicView === view
                  ? "border-slate-950 text-slate-950"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
              }`}
            >
              {label}
              {count != null ? (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                  {count}
                </span>
              ) : null}
            </button>
          ))}
        </nav>
      </div>

      {activeTopicView === "overview" ? (
        <section className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-950">
              Session setup
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              The learning outcomes and materials for this session live together here.
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="divide-y divide-slate-100">
              <div className="grid gap-4 px-5 py-5 md:grid-cols-[220px_minmax(0,1fr)]">
                <div>
                  <div className="text-sm font-medium text-slate-900">Session title</div>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    Rename the session students and reports will reference.
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    value={sessionTitle}
                    onChange={(event) => setSessionTitle(event.target.value)}
                    placeholder="Session title"
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-300 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={handleSaveSessionTitle}
                    disabled={
                      isSavingSessionTitle ||
                      sessionTitle.trim() === selectedTopic.title.trim()
                    }
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSavingSessionTitle ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save title"
                    )}
                  </button>
                </div>
              </div>

              <div className="grid gap-4 px-5 py-5 md:grid-cols-[220px_minmax(0,1fr)]">
                <div>
                  <div className="text-sm font-medium text-slate-900">Learning outcomes</div>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    These outcomes define what students should leave this session able to do.
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
                    <label className="block text-sm font-medium text-slate-900">
                      Teacher notes
                    </label>
                    <div className="rounded-lg border border-sky-200 bg-gradient-to-br from-sky-50 via-white to-emerald-50 px-4 py-4 text-sm text-sky-950">
                      <div className="font-medium">Examples of strong learning outcomes</div>
                      <div className="mt-3 space-y-2 text-sm leading-6 text-sky-900/90">
                        <p>Explain Newton&apos;s first law using two real-world examples of objects at rest or in motion.</p>
                        <p>Solve one-step linear equations using inverse operations and verify each answer by substitution.</p>
                        <p>Apply F = ma to calculate the net force, mass, or acceleration in simple mechanics problems.</p>
                        <p>Compare linear and quadratic graphs by identifying how their shapes and intercepts differ.</p>
                      </div>
                    </div>
                    <textarea
                      value={rawOutcomeNotes}
                      onChange={(event) => {
                        setRawOutcomeNotes(event.target.value);
                        setOutcomeReviewNotes([]);
                      }}
                      rows={5}
                      placeholder="Example: Students should be able to explain Newton's first law using real-world examples, distinguish balanced from unbalanced forces, and solve simple F = ma problems."
                      className={`w-full resize-none rounded-xl border px-4 py-3 text-sm text-slate-900 outline-none transition duration-300 focus:border-slate-300 ${
                        isGeneratingOutcomes
                          ? "border-sky-200 bg-sky-50/70 shadow-[0_0_0_4px_rgba(14,165,233,0.08)]"
                          : "border-slate-200 bg-white"
                      }`}
                    />
                    {outcomeReviewNotes.length ? (
                      <div className="animate-in fade-in slide-in-from-top-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                        <span className="font-medium">Review:</span>{" "}
                        {outcomeReviewNotes.join(" ")}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs leading-5 text-slate-500">
                        Paste rough notes, bullets, or a paragraph. Generate will rewrite this same box into cleaner measurable outcomes.
                      </p>
                      <button
                        type="button"
                        onClick={handleGenerateOutcomes}
                        disabled={isGeneratingOutcomes || !rawOutcomeNotes.trim()}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
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

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm font-medium text-slate-900">
                      Saved outcomes
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSaveOutcomes}
                        disabled={isSavingOutcomes}
                        className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isSavingOutcomes ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          "Save outcomes"
                        )}
                      </button>
                    </div>
                  </div>

                  {!rawOutcomeNotes.trim() ? (
                    <div className="rounded-lg border border-dashed border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                      No learning outcomes have been added yet.
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-4 px-5 py-5 md:grid-cols-[220px_minmax(0,1fr)]">
                <div>
                  <div className="text-sm font-medium text-slate-900">Supporting material</div>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    Upload the files the tutor should stay grounded in for this session.
                  </p>
                </div>
                <div className="space-y-4">
                  <form
                    className="space-y-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!materialFiles.length) {
                        toast.error("Choose at least one file first.");
                        return;
                      }

                      uploadMaterialMutation.mutate(
                        {
                          topicId: selectedTopic.id,
                          files: materialFiles,
                          title: materialTitle || undefined,
                          description: materialDescription || undefined,
                        },
                        {
                          onSuccess: () => {
                            setMaterialTitle("");
                            setMaterialDescription("");
                            setMaterialFiles([]);
                          },
                        },
                      );
                    }}
                  >
                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                      <input
                        value={materialTitle}
                        onChange={(event) => setMaterialTitle(event.target.value)}
                        placeholder="Material title"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-300 focus:bg-white"
                      />
                      <input
                        value={materialDescription}
                        onChange={(event) => setMaterialDescription(event.target.value)}
                        placeholder="Optional note for the tutor"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-300 focus:bg-white"
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                      <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center transition hover:border-slate-300 hover:bg-white">
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
                            setMaterialFiles(
                              Array.from(event.target.files ?? []),
                            )
                          }
                        />
                      </label>

                      <button
                        type="submit"
                        disabled={uploadMaterialMutation.isPending || !materialFiles.length}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {uploadMaterialMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <UploadCloud className="h-4 w-4" />
                        )}
                        Upload materials
                      </button>
                    </div>
                  </form>

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
                            <div className="max-w-md text-xs leading-5 text-amber-800">
                              {attempt.failureMessage ||
                                "This file could not be processed."}{" "}
                              Re-upload this file to try again.
                            </div>
                          ) : (
                            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                          )}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
                    {materials.length ? (
                      materials.map((material) => {
                        const review = getMaterialReviewState(material);

                        return (
                        <div key={material.id} className="px-4 py-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-950">
                                {material.title}
                              </div>
                              <div className="mt-1 text-xs text-slate-400">
                                {material.materialKind} &bull; {material.mimeType}
                              </div>
                              <div className="mt-2 text-xs text-slate-500">
                                Extraction: {material.extractionStatus} &bull; Indexing:{" "}
                                {material.indexingStatus}
                              </div>
                              {review.failed ? (
                                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                                  AI review did not complete. The file is stored, but activation will wait until the material can be checked against the outcomes.
                                </div>
                              ) : review.groundingSummary || review.coverage[0] || review.recommendedEdits[0] ? (
                                <div className="mt-3 space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-950">
                                  {review.groundingSummary ? (
                                    <p>{review.groundingSummary}</p>
                                  ) : null}
                                  {review.coverage[0] ? (
                                    <p>
                                      <span className="font-semibold">Coverage:</span>{" "}
                                      {review.coverage[0]}
                                    </p>
                                  ) : null}
                                  {review.recommendedEdits[0] ? (
                                    <p>
                                      <span className="font-semibold">Outcome note:</span>{" "}
                                      {review.recommendedEdits[0]}
                                    </p>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>

                            <a
                              href={`/api/media/learning/${material.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-950"
                            >
                              Open
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </div>
                        </div>
                        );
                      })
                    ) : (
                      <div className="px-4 py-5 text-sm text-slate-500">
                        No material has been uploaded for this session yet.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {activeTopicView === "reports" ? (
        <section className="space-y-5">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-950">
              Reports
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Student report summaries generated from work inside this session.
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {reports.length ? (
              reports.map((report, index) => {
                const firstGap = report.report.identifiedGaps?.[0] ?? null;
                return (
                  <div
                    key={report.id}
                    className={`px-5 py-5 ${
                      index !== reports.length - 1 ? "border-b border-slate-100" : ""
                    }`}
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <Link
                          href={`/dashboard/learning/students/${report.student.id}`}
                          className="text-base font-semibold text-slate-950 transition hover:text-slate-700"
                        >
                          {report.student.fullName}
                        </Link>
                        <div className="mt-1 text-xs text-slate-400">
                          Updated {formatDate(report.updatedAt)}
                        </div>
                        <p className="mt-3 text-sm leading-6 text-slate-600">
                          {report.report.studentSummary}
                        </p>
                        {firstGap ? (
                          <div className="mt-3 text-sm text-slate-500">
                            <span className="font-medium text-slate-900">Main gap:</span>{" "}
                            {firstGap}
                          </div>
                        ) : null}
                      </div>

                      <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">
                        {report.masteryPercent}% mastery
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="px-6 py-14 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-100 bg-white">
                  <FileText className="h-6 w-6 text-slate-200" />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-slate-950">
                  No session reports yet
                </h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                  Reports will appear here once students work through this session with
                  the tutor.
                </p>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {activeTopicView === "students" ? (
        <section className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-slate-950">
                Students
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Students attached to this session through the classroom roster.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsInviteModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              <Users className="h-4 w-4" />
              Add students
            </button>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {students.length ? (
              students.map((student, index) => (
                <div
                  key={student.id}
                  className={`px-5 py-4 ${
                    index !== students.length - 1 ? "border-b border-slate-100" : ""
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-950">
                        {student.fullName}
                      </div>
                      <div className="mt-1 truncate text-sm text-slate-500">
                        {student.email}
                      </div>
                    </div>

                    <Link
                      href={`/dashboard/learning/students/${student.id}`}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-950"
                    >
                      Profile
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-5 py-10 text-sm text-slate-500">
                No students are attached to this classroom yet.
              </div>
            )}
          </div>
        </section>
      ) : null}
    </>
  );
}
