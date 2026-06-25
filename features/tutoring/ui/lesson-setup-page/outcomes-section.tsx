"use client";

import { Loader2, Sparkles } from "lucide-react";

export function LessonSetupOutcomesSection(props: {
  rawOutcomeNotes: string;
  setRawOutcomeNotes: (value: string) => void;
  outcomeReviewNotes: string[];
  isGeneratingOutcomes: boolean;
  handleGenerateOutcomes: () => Promise<void>;
}) {
  const {
    rawOutcomeNotes,
    setRawOutcomeNotes,
    outcomeReviewNotes,
    isGeneratingOutcomes,
    handleGenerateOutcomes,
  } = props;

  return (
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
          <textarea
            id="setup-session-outcome-notes"
            value={rawOutcomeNotes}
            onChange={(event) => setRawOutcomeNotes(event.target.value)}
            rows={8}
            placeholder="Students should explain Newton's first law with everyday examples, distinguish balanced from unbalanced forces, and solve simple F = ma questions. I want them to stay within one-dimensional motion and use SI units."
            className={`w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition duration-300 ${
              isGeneratingOutcomes
                ? "border-sky-200 bg-sky-50/70 shadow-[0_0_0_4px_rgba(14,165,233,0.08)]"
                : ""
            }`}
          />
          <p className="text-xs text-slate-500">
            You do not need to format this perfectly. Generate will rewrite this same box into stronger outcomes.
          </p>
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
              Rewrite the notes in place, then edit the same box until the outcomes are
              sharp enough to save.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleGenerateOutcomes()}
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
  );
}
