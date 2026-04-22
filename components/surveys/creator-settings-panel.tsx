"use client";

import { MessageSquareMore, Sparkles } from "lucide-react";

export function CreatorSettingsPanel({ surveyId }: { surveyId: string }) {
  return (
    <div className="space-y-4" data-survey-id={surveyId}>
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-gray-900 p-2 text-white">
            <MessageSquareMore className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Survey refinement</h3>
            <p className="mt-1 text-sm text-gray-500">
              V1 keeps survey behavior refinement inside the conversational sample-review flow so creators can
              observe sample runs before applying changes.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 h-4 w-4" />
          <div>
            <p className="font-semibold">Recommended workflow</p>
            <p className="mt-2 text-emerald-800">
              Complete survey creation, review multiple sample conversations, and then use sample review to request
              improvements that carry into the live survey agent.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
