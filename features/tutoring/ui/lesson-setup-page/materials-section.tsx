"use client";

import { ExternalLink, FileText, Loader2, RotateCcw, UploadCloud } from "lucide-react";

import { InputField } from "@/features/auth/public-ui";
import { formatAttemptStatus } from "@/features/tutoring/ui/lesson-editor-helpers";

import type { LessonMaterialListItem } from "./lesson-setup-page-model";

type UploadAttempt = {
  id: string;
  fileName: string;
  status: "queued" | "processing" | "succeeded" | "failed";
  stage: "upload" | "extraction" | "analysis" | "indexing" | "pack_build";
  userMessage?: string | null;
  retryable?: boolean | null;
  failureMessage?: string | null;
  internalError?: string | null;
  storagePath?: string | null;
};

export function LessonSetupMaterialsSection(props: {
  materialTitle: string;
  setMaterialTitle: (value: string) => void;
  materialDescription: string;
  setMaterialDescription: (value: string) => void;
  materialFiles: File[];
  setMaterialFiles: (files: File[]) => void;
  isUploading: boolean;
  handleUpload: () => Promise<void>;
  visibleUploadAttempts: UploadAttempt[];
  retryingAttemptId: string | null;
  handleRetryAttempt: (attemptId: string) => Promise<void>;
  materials: LessonMaterialListItem[];
}) {
  const {
    materialTitle,
    setMaterialTitle,
    materialDescription,
    setMaterialDescription,
    materialFiles,
    setMaterialFiles,
    isUploading,
    handleUpload,
    visibleUploadAttempts,
    retryingAttemptId,
    handleRetryAttempt,
    materials,
  } = props;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-6 py-4">
        <h2 className="text-lg font-semibold tracking-tight text-slate-950">
          Lesson material
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
            type="button"
            onClick={() => void handleUpload()}
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
                    href={`/api/media/lessons/${material.id}`}
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
  );
}

