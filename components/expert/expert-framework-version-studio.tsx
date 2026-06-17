"use client";

import { useState } from "react";
import {
  ArrowUpCircle,
  Archive,
  ChevronLeft,
  Loader2,
  Trash2,
} from "lucide-react";
import toast from "react-hot-toast";

import { FrameworkEditorWizard } from "@/components/expert/framework-editor-wizard";
import { Link, useRouter } from "@/i18n/routing";
import {
  expertFrameworkSchema,
  type ExpertFramework,
} from "@/lib/learning/types";

type FrameworkDetail = {
  id: string;
  courseId: string;
  courseTitle: string;
  name: string;
  description: string | null;
  status: "draft" | "active" | "inactive" | "archived";
  draftFramework: Record<string, unknown>;
  liveFramework: Record<string, unknown> | null;
  activatedAt: string | null;
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
  const payload = (await response.json()) as
    | ({ success: false; error?: { message?: string } })
    | ({ success?: true } & T);
  if (!response.ok) {
    throw new Error(
      "error" in payload && payload.error?.message
        ? payload.error.message
        : "Request failed",
    );
  }
  return payload as T;
}

function parseFramework(raw: Record<string, unknown>): ExpertFramework {
  return expertFrameworkSchema.parse(raw);
}

function normalizeDraftForSave(framework: ExpertFramework): ExpertFramework {
  return expertFrameworkSchema.parse({
    ...framework,
    name: framework.name.trim(),
    description: framework.description.trim(),
    markdownContent: framework.markdownContent.trim(),
    fewShotExamples: framework.fewShotExamples
      .map((example) => example.trim())
      .filter(Boolean),
  });
}

export function ExpertFrameworkVersionStudio({
  framework,
}: {
  framework: FrameworkDetail;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(framework.status);
  const [draftFramework, setDraftFramework] = useState<ExpertFramework>(
    parseFramework(framework.draftFramework),
  );
  const [liveFramework, setLiveFramework] = useState<ExpertFramework | null>(
    framework.liveFramework ? parseFramework(framework.liveFramework) : null,
  );
  const [activatedAt, setActivatedAt] = useState(framework.activatedAt);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isArchived = status === "archived";
  const canDelete = status === "draft" && !activatedAt;

  const handleSaveDraft = async () => {
    try {
      setIsSavingDraft(true);
      const result = await fetchJson<{ success: true; data: FrameworkDetail }>(
        `/api/learning/expert/frameworks/${framework.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            draftFramework: normalizeDraftForSave(draftFramework),
          }),
        },
      );
      setStatus(result.data.status);
      toast.success("Draft saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save draft");
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleActivate = async () => {
    try {
      setIsActivating(true);
      await fetchJson(`/api/learning/expert/frameworks/${framework.id}/activate`, {
        method: "POST",
      });
      const nextDraft = normalizeDraftForSave(draftFramework);
      setStatus("active");
      setLiveFramework(nextDraft);
      setActivatedAt(new Date().toISOString());
      toast.success("Framework activated for tutoring");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to activate framework");
    } finally {
      setIsActivating(false);
    }
  };

  const handleArchive = async () => {
    try {
      setIsArchiving(true);
      await fetchJson(`/api/learning/expert/frameworks/${framework.id}/archive`, {
        method: "POST",
      });
      setStatus("archived");
      toast.success("Framework archived");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to archive framework");
    } finally {
      setIsArchiving(false);
    }
  };

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await fetchJson(`/api/learning/expert/frameworks/${framework.id}`, {
        method: "DELETE",
      });
      toast.success("Framework deleted");
      router.push("/expert/frameworks/studio");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete framework");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="space-y-4 border-b border-slate-200 pb-5">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <Link
            href="/expert/frameworks/studio"
            className="inline-flex items-center gap-1 font-medium text-slate-600 transition-colors hover:text-slate-950"
          >
            <ChevronLeft className="h-4 w-4" />
            Frameworks
          </Link>
          <span className="text-slate-300">/</span>
          <span className="font-medium text-slate-700">{framework.courseTitle}</span>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-950">
              Framework editor
            </h1>
            <p className="max-w-2xl text-sm text-slate-500">
              Edit the draft, then activate it when you want tutoring to use the new live
              snapshot.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
              {status}
            </span>
            {activatedAt ? (
              <span className="text-xs text-slate-500">
                Live since{" "}
                {new Date(activatedAt).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleActivate}
            disabled={isArchived || isActivating}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {isActivating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUpCircle className="h-4 w-4" />
            )}
            Activate
          </button>
          <button
            type="button"
            onClick={handleArchive}
            disabled={isArchived || status === "active" || isArchiving}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            {isArchiving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Archive className="h-4 w-4" />
            )}
            Archive
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!canDelete || isDeleting}
            className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50"
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Delete draft
          </button>
        </div>
      </header>

      {liveFramework ? (
        <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-600">
          <p className="font-semibold text-slate-900">Live snapshot</p>
          <p className="mt-1">
            Tutoring is currently using <span className="font-medium">{liveFramework.name}</span>.
            Saving new edits below only changes the draft until you activate again.
          </p>
        </section>
      ) : null}

      <FrameworkEditorWizard
        draftFramework={draftFramework}
        setDraftFramework={setDraftFramework}
        onSaveDraft={handleSaveDraft}
        isSavingDraft={isSavingDraft}
      />
    </div>
  );
}
