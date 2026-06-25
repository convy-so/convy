"use client";

import { useMemo, useState } from "react";
import { Brain, Compass, Sparkles, User2 } from "lucide-react";

import {
  type LearningMeData,
} from "@/features/tutoring/public-client";
import { GlassPanel } from "@/shared/ui/glass-panel";
import { MetricTile } from "@/features/tutoring/ui/metric-tile";
import { SectionHeading } from "@/features/tutoring/ui/section-heading";
import { getSubjectDisplayLabel } from "@/features/tutoring/server/subject-packages";
import type {
  getMyPatternSummaries,
  getOnboardingStateData,
} from "@/shared/http/page-data";

const patternScopes = ["all", "global", "subject"] as const;

function getRecordString(value: unknown, key: string): string | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" ? candidate : null;
}

function getStringArray(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function getInterestRows(record: Record<string, unknown> | null | undefined) {
  const raw = record?.primaryInterests;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const label = getRecordString(item, "label");
      const details = getRecordString(item, "details");
      if (!label || !details) return null;
      return { label, details };
    })
    .filter((item): item is { label: string; details: string } => item !== null);
}

function getStringValue(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "string" ? value : null;
}

type PatternSummaryResult = Awaited<ReturnType<typeof getMyPatternSummaries>>;

export function StudentProfilePage({
  initialLearningMe,
  initialPatterns,
  initialOnboardingState,
}: {
  initialLearningMe: LearningMeData;
  initialPatterns: PatternSummaryResult;
  initialOnboardingState?: Awaited<ReturnType<typeof getOnboardingStateData>>;
}) {
  const [selectedScope, setSelectedScope] = useState<"all" | "global" | "subject">("all");

  const memberships = useMemo(
    () =>
      initialLearningMe.role === "student"
        ? initialLearningMe.student
        : [],
    [initialLearningMe],
  );
  const profile =
    initialOnboardingState?.completed ? initialOnboardingState.profile ?? null : null;
  const patterns = initialPatterns.data.profiles ?? [];
  const memoryState = initialPatterns.data.memoryState;
  const filteredPatterns =
    selectedScope === "all"
      ? patterns
      : patterns.filter((pattern) => pattern.scopeType === selectedScope);
  const interestRows = getInterestRows(profile);
  const aspirations = getStringArray(profile, "aspirations");
  const curiosityAreas = getStringArray(profile, "curiosityAreas");
  const contextTags = getStringArray(profile, "contextTags");
  const learningRelationship = getStringValue(profile, "learningRelationship");
  const motivationalValues = getStringArray(profile, "motivationalStyle");
  const strongestPattern = filteredPatterns[0] ?? null;
  const subjectPatternCount = patterns.filter((pattern) => pattern.scopeType === "subject").length;
  const profileLastUpdated = useMemo(() => {
    const values = memberships.map((membership) => membership.profileLastUpdated).filter(Boolean);
    return values[0] ?? null;
  }, [memberships]);

  return (
    <div className="mx-auto max-w-[1200px] space-y-8 px-2 pb-12">
      <div className="relative overflow-hidden rounded-[28px] border border-white/60 bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.15),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(14,165,233,0.14),_transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.92),rgba(255,255,255,0.74))] px-6 py-8 shadow-[0_30px_90px_-60px_rgba(15,23,42,0.32)] backdrop-blur-xl md:px-8 md:py-10">
        <div className="grid gap-8 lg:grid-cols-[1.25fr_0.95fr]">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-200/70 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-violet-700">
              <Sparkles className="h-3.5 w-3.5" />
              Student Profile
            </div>
            <div className="space-y-3">
              <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-slate-950 md:text-5xl">
                See what the tutor has learned about you.
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-slate-600 md:text-base">
                These patterns are not labels. They are working signals the tutor uses to explain things in ways that fit you better, and they keep updating as you learn.
              </p>
            </div>
          </div>

          <GlassPanel className="grid gap-4 p-5">
            <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              Personal snapshot
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <MetricTile label="Classes" value={String(memberships.length)} helper="Teacher-managed classrooms you currently belong to." />
              <MetricTile label="Patterns" value={String(patterns.length)} helper="Learning overlays currently guiding your sessions." />
              <MetricTile label="Subjects" value={String(subjectPatternCount)} helper="Subject-specific pattern layers discovered so far." />
              <MetricTile label="Updated" value={profileLastUpdated ? new Date(profileLastUpdated).toLocaleDateString() : "Early"} helper="Latest moment your personal profile was refreshed." />
            </div>
          </GlassPanel>
        </div>
      </div>

      <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-6">
          <GlassPanel className="p-6">
            <div className="flex items-center gap-2 text-slate-950">
              <User2 className="h-4 w-4 text-sky-700" />
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                Your interests and goals
              </h2>
            </div>

            <div className="mt-6 space-y-5">
                <div className="rounded-[20px] border border-white/70 bg-white/75 p-5">
                  <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                    Primary interests
                  </div>
                  <div className="mt-3 space-y-3">
                    {interestRows.length ? (
                      interestRows.map((interest) => (
                        <div key={`${interest.label}-${interest.details}`} className="rounded-[16px] border border-white/70 bg-white/80 px-4 py-3">
                          <div className="text-sm font-semibold text-slate-950">{interest.label}</div>
                          <div className="mt-1 text-sm leading-6 text-slate-600">{interest.details}</div>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-slate-500">
                        Your interest profile will appear here after onboarding completes.
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <GlassPanel className="p-5">
                    <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                      Aspirations
                    </div>
                    <div className="mt-3 space-y-2">
                      {aspirations.length ? aspirations.map((item) => (
                        <div key={item} className="text-sm leading-6 text-slate-700">{item}</div>
                      )) : <div className="text-sm text-slate-500">Nothing stored yet.</div>}
                    </div>
                  </GlassPanel>
                  <GlassPanel className="p-5">
                    <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                      Curiosity areas
                    </div>
                    <div className="mt-3 space-y-2">
                      {curiosityAreas.length ? curiosityAreas.map((item) => (
                        <div key={item} className="text-sm leading-6 text-slate-700">{item}</div>
                      )) : <div className="text-sm text-slate-500">Nothing stored yet.</div>}
                    </div>
                  </GlassPanel>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <GlassPanel className="p-5">
                    <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                      Learning relationship
                    </div>
                    <div className="mt-3 text-sm leading-6 text-slate-700">
                      {learningRelationship ?? "Still emerging"}
                    </div>
                  </GlassPanel>
                  <GlassPanel className="p-5">
                    <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                      Motivation themes
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {motivationalValues.length ? motivationalValues.map((item) => (
                        <span key={item} className="rounded-full border border-sky-200/70 bg-sky-50/80 px-3 py-1 text-xs font-semibold text-sky-700">
                          {item.replaceAll("_", " ")}
                        </span>
                      )) : <div className="text-sm text-slate-500">Still emerging</div>}
                    </div>
                  </GlassPanel>
                </div>

                <GlassPanel className="p-5">
                  <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                    Context tags
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {contextTags.length ? contextTags.map((tag) => (
                      <span key={tag} className="rounded-full border border-violet-200/70 bg-violet-50/80 px-3 py-1 text-xs font-semibold text-violet-700">
                        {tag}
                      </span>
                    )) : <div className="text-sm text-slate-500">No tags yet.</div>}
                  </div>
                </GlassPanel>
              </div>
          </GlassPanel>
        </div>

        <div className="space-y-6">
          <GlassPanel className="p-6">
            <SectionHeading
              eyebrow="Learning patterns"
              title="How the tutor is adapting"
              description="These summaries are phrased to help you understand the teaching adjustments being made. They are tendencies, not permanent judgments."
            />

            <div className="mt-4 flex flex-wrap gap-2">
              {patternScopes.map((scope) => (
                <button
                  key={scope}
                  type="button"
                  onClick={() => setSelectedScope(scope)}
                  className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                    selectedScope === scope
                      ? "border border-slate-900 bg-slate-950 text-white"
                      : "border border-white/70 bg-white/80 text-slate-600 hover:border-slate-200"
                  }`}
                >
                  {scope === "all" ? "All patterns" : scope === "global" ? "Across subjects" : "Subject overlays"}
                </button>
              ))}
            </div>

            <div className="mt-6 space-y-4">
              {memoryState.status !== "ready" && memoryState.message ? (
                <div className="rounded-[20px] border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
                  {memoryState.message}
                </div>
              ) : null}
              {filteredPatterns.length ? (
                filteredPatterns.map((pattern) => (
                  <div key={`${pattern.scopeType}-${pattern.subjectKey ?? "global"}`} className="rounded-[20px] border border-white/70 bg-white/75 p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-950">
                          {pattern.scopeType === "global"
                            ? "Across subjects"
                            : pattern.subjectKey
                              ? getSubjectDisplayLabel(pattern.subjectKey)
                              : "Subject"}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          Confidence: {pattern.confidenceLabel}
                        </div>
                      </div>
                      <div className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
                        {Math.round((pattern.patternConfidence ?? 0) * 100)}%
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                      {pattern.studentSummary}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-[20px] border border-dashed border-slate-200 bg-white/60 px-5 py-6 text-sm text-slate-500">
                  Your learning-pattern summary will appear here once enough evidence has been gathered.
                </div>
              )}
            </div>
          </GlassPanel>

          <GlassPanel className="p-6">
            <div className="flex items-center gap-2 text-slate-950">
              <Compass className="h-4 w-4 text-emerald-700" />
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                Strongest current signal
              </h2>
            </div>
            {strongestPattern ? (
              <div className="mt-4 rounded-[20px] border border-white/70 bg-white/75 p-5">
                <div className="text-sm font-semibold text-slate-950">
                  {strongestPattern.scopeType === "global"
                    ? "Across subjects"
                    : strongestPattern.subjectKey
                      ? getSubjectDisplayLabel(strongestPattern.subjectKey)
                      : "Subject"}
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {strongestPattern.studentSummary}
                </p>
              </div>
            ) : (
              <div className="mt-4 text-sm text-slate-500">
                Still gathering enough evidence to show a confident signal.
              </div>
            )}
          </GlassPanel>

          <GlassPanel className="p-6">
            <div className="flex items-center gap-2 text-slate-950">
              <Brain className="h-4 w-4 text-sky-700" />
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                Why this matters
              </h2>
            </div>
            <p className="mt-4 text-sm leading-7 text-slate-600">
              The tutor uses these signals to decide which explanation style to lead with, which kinds of examples to avoid repeating, how much challenge to add, and when to slow down or push deeper.
            </p>
          </GlassPanel>
        </div>
      </section>
    </div>
  );
}
