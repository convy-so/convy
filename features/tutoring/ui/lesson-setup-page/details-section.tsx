"use client";

import { InputField, TextareaField } from "@/features/auth/public-ui";

export function LessonSetupDetailsSection(props: {
  subjectName: string;
  title: string;
  description: string;
  setTitle: (value: string) => void;
  setDescription: (value: string) => void;
}) {
  const { subjectName, title, description, setTitle, setDescription } = props;

  return (
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
  );
}
