"use client";

import { TextareaField } from "@/features/auth/public-ui";

export function LessonSetupScopeSection(props: {
  scopeNotes: string;
  setScopeNotes: (value: string) => void;
}) {
  const { scopeNotes, setScopeNotes } = props;

  return (
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
  );
}
