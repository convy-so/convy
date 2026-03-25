"use client";

import { Settings2, Sparkles } from "lucide-react";

import { PersonalityControlsPanel } from "@/components/surveys/personality-controls-panel";
import { PlaybookStudioPanel } from "@/components/surveys/playbook-studio-panel";

export function CreatorSettingsPanel({ surveyId }: { surveyId: string }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-gray-900 p-2 text-white">
            <Settings2 className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Creator Configuration</h3>
            <p className="mt-1 text-sm text-gray-500">
              Configure reusable playbooks and interviewer personality outside rehearsal. These settings shape
              creation, conducting, and analytics behavior without changing the system guardrails.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 h-4 w-4" />
          <div>
            <p className="font-semibold">Recommended workflow</p>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-emerald-800">
              <li>Choose a personality preset for the default interviewing style.</li>
              <li>Add playbooks for creation, conducting, or analytics where you need stronger guidance.</li>
              <li>Use sample review to refine behavior with the assistant, then promote approved changes to live.</li>
            </ol>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <PersonalityControlsPanel surveyId={surveyId} />
        <PlaybookStudioPanel surveyId={surveyId} />
      </div>
    </div>
  );
}
