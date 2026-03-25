"use client";

import { FormEvent, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

type PlaybookRecord = {
  playbook: {
    id: string;
    name: string;
    phase: "creation" | "conducting" | "analytics";
    scope: "survey" | "workspace";
    status: string;
  };
  activeVersion: {
    id: string;
    interpretation: {
      summary: string;
      blockedReasons: string[];
      clarificationQuestions: string[];
      usefulnessScore: number;
      specificityScore: number;
    };
    preview: {
      interpretedEffect: string[];
      unchangedGuardrails: string[];
      examples: string[];
    };
  } | null;
  isAttached: boolean;
};

const EMPTY_FORM = {
  name: "",
  phase: "conducting",
  scope: "survey",
  objective: "",
  targetAudience: "",
  desiredStyle: "",
  wordingToUse: "",
  wordingToAvoid: "",
  examplePhrasings: "",
  extraContext: "",
};

export function PlaybookStudioPanel({ surveyId }: { surveyId: string }) {
  const [playbooks, setPlaybooks] = useState<PlaybookRecord[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function load() {
    setIsLoading(true);
    const response = await fetch(`/api/surveys/${surveyId}/playbooks`);
    const data = await response.json();
    setPlaybooks(data.playbooks || []);
    setIsLoading(false);
  }

  useEffect(() => {
    load().catch(() => setIsLoading(false));
  }, [surveyId]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await fetch(`/api/surveys/${surveyId}/playbooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          wordingToUse: form.wordingToUse.split("\n").map((item) => item.trim()).filter(Boolean),
          wordingToAvoid: form.wordingToAvoid.split("\n").map((item) => item.trim()).filter(Boolean),
          examplePhrasings: form.examplePhrasings.split("\n").map((item) => item.trim()).filter(Boolean),
        }),
      });
      setForm(EMPTY_FORM);
      await load();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePlaybookAction(playbookId: string, action: "approve" | "archive" | "attach" | "detach", versionId?: string) {
    await fetch(`/api/surveys/${surveyId}/playbooks/${playbookId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, versionId }),
    });
    await load();
  }

  return (
    <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Playbook Studio</h3>
        <p className="mt-1 text-xs text-gray-500">
          Author creation, conducting, or analytics playbooks with guided inputs, preview, and approval.
        </p>
      </div>

      <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-900">
        <p className="font-semibold">What makes a useful playbook</p>
        <ul className="mt-2 space-y-1 text-emerald-800">
          <li>- Focus on behavior the system can actually change.</li>
          <li>- Name the audience and the context.</li>
          <li>- Give one or two wording examples.</li>
          <li>- Say what to avoid, not only what to prefer.</li>
          <li>- Keep it specific. “Be better” or “sound human” is too vague to apply reliably.</li>
        </ul>
      </div>

      <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs text-gray-600">
        <p className="font-semibold text-gray-900">Phase guide</p>
        <div className="mt-2 space-y-1">
          <p><span className="font-medium text-gray-800">Creation:</span> helps clarify the brief and creator-facing planning questions.</p>
          <p><span className="font-medium text-gray-800">Conducting:</span> shapes interviewer wording, pacing, probing, and tone.</p>
          <p><span className="font-medium text-gray-800">Analytics:</span> shapes narrative framing and approved derived metrics, not raw counts.</p>
        </div>
      </div>

      <form onSubmit={handleCreate} className="space-y-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
        <input
          value={form.name}
          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          placeholder="Playbook name"
          className="w-full rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-gray-300"
        />
        <div className="grid grid-cols-2 gap-2">
          <select
            value={form.phase}
            onChange={(event) => setForm((current) => ({ ...current, phase: event.target.value as any }))}
            className="rounded-xl border border-gray-200 p-3 text-sm outline-none"
          >
            <option value="creation">Creation</option>
            <option value="conducting">Conducting</option>
            <option value="analytics">Analytics</option>
          </select>
          <select
            value={form.scope}
            onChange={(event) => setForm((current) => ({ ...current, scope: event.target.value as any }))}
            className="rounded-xl border border-gray-200 p-3 text-sm outline-none"
          >
            <option value="survey">Survey</option>
            <option value="workspace">Workspace</option>
          </select>
        </div>
        <textarea
          value={form.objective}
          onChange={(event) => setForm((current) => ({ ...current, objective: event.target.value }))}
          placeholder="What should this playbook improve in practice?"
          className="h-20 w-full rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-gray-300"
        />
        <textarea
          value={form.targetAudience}
          onChange={(event) => setForm((current) => ({ ...current, targetAudience: event.target.value }))}
          placeholder="Target audience. Example: first-year students in blended courses."
          className="h-16 w-full rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-gray-300"
        />
        <textarea
          value={form.desiredStyle}
          onChange={(event) => setForm((current) => ({ ...current, desiredStyle: event.target.value }))}
          placeholder="Desired style or behavior. Example: short, plain-language follow-ups with a calm tone."
          className="h-16 w-full rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-gray-300"
        />
        <textarea
          value={form.wordingToUse}
          onChange={(event) => setForm((current) => ({ ...current, wordingToUse: event.target.value }))}
          placeholder="Wording to use, one per line. Example: Can you walk me through..."
          className="h-16 w-full rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-gray-300"
        />
        <textarea
          value={form.wordingToAvoid}
          onChange={(event) => setForm((current) => ({ ...current, wordingToAvoid: event.target.value }))}
          placeholder="Wording to avoid, one per line. Example: leverage, stakeholder, obviously"
          className="h-16 w-full rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-gray-300"
        />
        <textarea
          value={form.examplePhrasings}
          onChange={(event) => setForm((current) => ({ ...current, examplePhrasings: event.target.value }))}
          placeholder="Example phrasing, one per line. Give concrete examples you would actually want the system to use."
          className="h-20 w-full rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-gray-300"
        />
        <textarea
          value={form.extraContext}
          onChange={(event) => setForm((current) => ({ ...current, extraContext: event.target.value }))}
          placeholder="Extra context or terminology. Example: use mentor instead of coach; refer to modules as learning blocks."
          className="h-20 w-full rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-gray-300"
        />

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-xl bg-gray-900 px-3 py-2 text-sm font-medium text-white"
        >
          {isSubmitting ? "Creating..." : "Create playbook draft"}
        </button>
      </form>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading playbooks...
        </div>
      ) : (
        <div className="space-y-3">
          {playbooks.map((record) => (
            <div key={record.playbook.id} className="rounded-xl border border-gray-200 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-gray-900">{record.playbook.name}</div>
                  <div className="mt-1 text-xs text-gray-500">
                    {record.playbook.phase} · {record.playbook.scope} · {record.playbook.status}
                  </div>
                </div>
                <div className="text-xs text-gray-500">{record.isAttached ? "Attached" : "Not attached"}</div>
              </div>
              {record.activeVersion && (
                <>
                  <p className="mt-3 text-sm text-gray-700">{record.activeVersion.interpretation.summary}</p>
                  <div className="mt-2 rounded-lg bg-gray-50 p-2 text-xs text-gray-600">
                    <div>Usefulness: {Math.round(record.activeVersion.interpretation.usefulnessScore * 100)}%</div>
                    <div>Specificity: {Math.round(record.activeVersion.interpretation.specificityScore * 100)}%</div>
                  </div>
                  {record.activeVersion.interpretation.clarificationQuestions.length > 0 && (
                    <div className="mt-2 rounded-lg border border-amber-100 bg-amber-50 p-2 text-xs text-amber-900">
                      {record.activeVersion.interpretation.clarificationQuestions[0]}
                    </div>
                  )}
                  {record.activeVersion.preview.examples.length > 0 && (
                    <div className="mt-2 rounded-lg border border-gray-100 bg-white p-2 text-xs text-gray-700">
                      Preview: {record.activeVersion.preview.examples[0]}
                    </div>
                  )}
                </>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {record.playbook.status !== "approved" && record.activeVersion && (
                  <button
                    type="button"
                    onClick={() => handlePlaybookAction(record.playbook.id, "approve", record.activeVersion!.id)}
                    className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white"
                  >
                    Approve
                  </button>
                )}
                {record.playbook.scope === "workspace" && (
                  <button
                    type="button"
                    onClick={() => handlePlaybookAction(record.playbook.id, record.isAttached ? "detach" : "attach")}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700"
                  >
                    {record.isAttached ? "Detach" : "Attach"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handlePlaybookAction(record.playbook.id, "archive")}
                  className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700"
                >
                  Archive
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
