"use client";

import { Check, ExternalLink, Loader2, RotateCcw, Sparkles, UploadCloud } from "lucide-react";

import { formatAttemptStatus } from "@/features/tutoring/ui/lesson-editor-helpers";

import type { MaterialUploadAttempt, LessonMaterial } from "./workspace-model";

function getStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function getMaterialReviewState(material: LessonMaterial) {
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

function formatLessonStatusLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

type OverviewPanelProps = {
  classroomTitle: string;
  lessonStatus: string;
  lessonSubjectLabel: string;
  lessonLocaleLabel: string;
  sessionTitle: string;
  setSessionTitle: (value: string) => void;
  selectedLessonTitle: string;
  rawOutcomeNotes: string;
  setRawOutcomeNotes: (value: string) => void;
  outcomeReviewNotes: string[];
  materials: LessonMaterial[];
  materialTitle: string;
  setMaterialTitle: (value: string) => void;
  materialDescription: string;
  setMaterialDescription: (value: string) => void;
  materialFiles: File[];
  setMaterialFiles: (files: File[]) => void;
  visibleUploadAttempts: MaterialUploadAttempt[];
  retryingAttemptId: string | null;
  handleRetryAttempt: (attemptId: string) => Promise<void>;
  handleSaveSessionTitle: () => Promise<void>;
  handleGenerateOutcomes: () => Promise<void>;
  handleSaveOutcomes: () => Promise<void>;
  uploadMaterial: () => void;
  statusHint: string;
  isActivationEligibleLesson: boolean;
  isActivationStateLoading: boolean;
  isActivationReady: boolean;
  canActivate: boolean;
  canPause: boolean;
  canArchive: boolean;
  isActivationStateError: boolean;
  updateLessonStatus: (status: "active" | "paused" | "archived") => void;
  isUpdateLessonStatusPending: boolean;
  isSavingSessionTitle: boolean;
  isGeneratingOutcomes: boolean;
  isSavingOutcomes: boolean;
  isUploadPending: boolean;
};

export function TeacherLessonOverviewPanel(props: OverviewPanelProps) {
  const {
    classroomTitle,
    lessonStatus,
    lessonSubjectLabel,
    lessonLocaleLabel,
    sessionTitle,
    setSessionTitle,
    selectedLessonTitle,
    rawOutcomeNotes,
    setRawOutcomeNotes,
    outcomeReviewNotes,
    materials,
    materialTitle,
    setMaterialTitle,
    materialDescription,
    setMaterialDescription,
    materialFiles,
    setMaterialFiles,
    visibleUploadAttempts,
    retryingAttemptId,
    handleRetryAttempt,
    handleSaveSessionTitle,
    handleGenerateOutcomes,
    handleSaveOutcomes,
    uploadMaterial,
    statusHint,
    isActivationEligibleLesson,
    isActivationStateLoading,
    isActivationReady,
    canActivate,
    canPause,
    canArchive,
    updateLessonStatus,
    isUpdateLessonStatusPending,
    isSavingSessionTitle,
    isGeneratingOutcomes,
    isSavingOutcomes,
    isUploadPending,
  } = props;

  return (
    <section className="space-y-6">
      <section className="space-y-4 border-b border-slate-200 pb-6">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span>{classroomTitle}</span>
            <span>&bull;</span>
            <span>{lessonSubjectLabel}</span>
            <span>&bull;</span>
            <span>{lessonLocaleLabel}</span>
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
                {formatLessonStatusLabel(lessonStatus)}
              </span>
              {isActivationEligibleLesson ? (
                isActivationStateLoading ? (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                    Checking readiness
                  </span>
                ) : isActivationReady ? (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                    Ready to activate
                  </span>
                ) : (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700">
                    Setup incomplete
                  </span>
                )
              ) : null}
            </div>
            <p className="text-sm leading-6 text-slate-500">{statusHint}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => updateLessonStatus("active")}
              disabled={!canActivate || isUpdateLessonStatusPending}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {lessonStatus === "active" ? <Check className="h-4 w-4" /> : null}
              {lessonStatus === "paused" ? "Resume session" : "Activate session"}
            </button>
            <button
              type="button"
              onClick={() => updateLessonStatus("paused")}
              disabled={!canPause || isUpdateLessonStatusPending}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Pause
            </button>
            <button
              type="button"
              onClick={() => updateLessonStatus("archived")}
              disabled={!canArchive || isUpdateLessonStatusPending}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Archive
            </button>
          </div>
        </div>
      </section>

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
                  onClick={() => void handleSaveSessionTitle()}
                  disabled={isSavingSessionTitle || sessionTitle.trim() === selectedLessonTitle.trim()}
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
                    onChange={(event) => setRawOutcomeNotes(event.target.value)}
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
                      onClick={() => void handleGenerateOutcomes()}
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
                  <div className="text-sm font-medium text-slate-900">Saved outcomes</div>
                  <button
                    type="button"
                    onClick={() => void handleSaveOutcomes()}
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
                      return;
                    }
                    uploadMaterial();
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
                      <div className="mt-2 text-xs text-slate-400">PDF, DOCX, TXT</div>
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
                        onChange={(event) => setMaterialFiles(Array.from(event.target.files ?? []))}
                      />
                    </label>

                    <button
                      type="submit"
                      disabled={isUploadPending || !materialFiles.length}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isUploadPending ? (
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
                          <div className="flex max-w-md items-start gap-3 text-xs leading-5 text-amber-800">
                            <div className="min-w-0">
                              {attempt.userMessage ||
                                attempt.failureMessage ||
                                "This file could not be processed."}{" "}
                              {attempt.retryable && attempt.storagePath
                                ? "Retry this file from the saved upload."
                                : "Re-upload this file to try again."}
                              {process.env.NODE_ENV !== "production" && attempt.internalError ? (
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
                                  AI analysis did not complete. The file is stored, but activation will wait until the material can be checked against the outcomes.
                                </div>
                              ) : review.groundingSummary || review.coverage[0] || review.recommendedEdits[0] ? (
                                <div className="mt-3 space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-950">
                                  {review.groundingSummary ? <p>{review.groundingSummary}</p> : null}
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
                              href={`/api/media/lessons/${material.id}`}
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
    </section>
  );
}

