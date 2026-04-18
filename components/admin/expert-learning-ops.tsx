"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpenCheck,
  Brain,
  CheckCircle2,
  Loader2,
  Plus,
  Save,
  Sparkles,
  TestTube2,
} from "lucide-react";
import toast from "react-hot-toast";

type ReviewQueueItem = {
  key: string;
  sessionId: string | null;
  topicId: string | null;
  classroomStudentId: string | null;
  studentName: string | null;
  topicTitle: string | null;
  subjectKey: string | null;
  subjectLabel: string | null;
  priority: "low" | "medium" | "high";
  reasons: string[];
  createdAt: string;
};

type AssetPack = {
  id: string;
  name: string;
  artifactType: string;
  status: string;
  targetScope: string;
  activeVersionId: string | null;
  metadata: Record<string, unknown>;
};

type AssetVersion = {
  id: string;
  version: number;
  status: string;
  notes: string | null;
};

type PreviewPayload = {
  prompt: string;
  expectedAnswer: string;
  explanation: string;
  questionType: string;
  reasoningSkill: string;
  difficulty: string;
  acceptedStrategies: string[];
  hintLadder: string[];
  diagnosticTags: string[];
  evidenceRequirements: string[];
};

type EvalBootstrapResult = {
  presetKey: string;
  datasetId: string;
  datasetName: string;
  status: "created" | "existing";
  caseCount: number;
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
  const payload = (await response.json()) as { error?: string } & T;
  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed");
  }
  return payload;
}

export function ExpertLearningOps() {
  const queryClient = useQueryClient();
  const [selectedQueueKey, setSelectedQueueKey] = useState<string | null>(null);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [annotationSummary, setAnnotationSummary] = useState("");
  const [annotationEvidence, setAnnotationEvidence] = useState("");
  const [annotationType, setAnnotationType] = useState("reasoning_gap");
  const [packName, setPackName] = useState("");
  const [artifactType, setArtifactType] = useState("question_pattern");
  const [versionNotes, setVersionNotes] = useState("");
  const [previewQuestionType, setPreviewQuestionType] = useState("self_explanation");
  const [previewDifficulty, setPreviewDifficulty] = useState("medium");
  const [previewResult, setPreviewResult] = useState<PreviewPayload | null>(null);
  const [bootstrapResults, setBootstrapResults] = useState<EvalBootstrapResult[]>([]);
  const [artifactJson, setArtifactJson] = useState(
    JSON.stringify(
      {
        title: "Reasoning-first pattern",
        instructions: [
          "Ask for an attempt before teaching.",
          "Accept multiple valid strategies when the discipline allows it.",
        ],
      },
      null,
      2,
    ),
  );

  const queueQuery = useQuery({
    queryKey: ["expertLearningReviewQueue"],
    queryFn: async () =>
      (await fetchJson<{ success: true; data: ReviewQueueItem[] }>(
        "/api/learning/expert/review-queue",
      )).data,
  });

  const assetsQuery = useQuery({
    queryKey: ["expertLearningAssets"],
    queryFn: async () =>
      (await fetchJson<{ success: true; data: AssetPack[] }>(
        "/api/learning/expert/assets",
      )).data,
  });

  const selectedQueueItem =
    queueQuery.data?.find((item) => item.key === selectedQueueKey) ?? queueQuery.data?.[0] ?? null;
  const selectedPack =
    assetsQuery.data?.find((item) => item.id === selectedPackId) ?? assetsQuery.data?.[0] ?? null;

  const versionsQuery = useQuery({
    queryKey: ["expertLearningAssetVersions", selectedPack?.id],
    queryFn: async () =>
      (
        await fetchJson<{ success: true; data: AssetVersion[] }>(
          `/api/learning/expert/assets/${selectedPack!.id}/versions`,
        )
      ).data,
    enabled: Boolean(selectedPack?.id),
  });

  const createAnnotationMutation = useMutation({
    mutationFn: async () => {
      if (!selectedQueueItem) {
        throw new Error("Pick a queue item first.");
      }
      return await fetchJson<{ success: true }>("/api/learning/expert/annotations", {
        method: "POST",
        body: JSON.stringify({
          topicId: selectedQueueItem.topicId,
          sessionId: selectedQueueItem.sessionId,
          classroomStudentId: selectedQueueItem.classroomStudentId,
          subjectKey: selectedQueueItem.subjectKey,
          annotationType,
          status: "reviewed",
          summary: annotationSummary.trim(),
          evidence: annotationEvidence.trim(),
          metadata: {
            reviewQueueKey: selectedQueueItem.key,
            reasons: selectedQueueItem.reasons,
          },
        }),
      });
    },
    onSuccess: async () => {
      setAnnotationSummary("");
      setAnnotationEvidence("");
      toast.success("Annotation saved");
      await queryClient.invalidateQueries({ queryKey: ["expertLearningReviewQueue"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Failed to save annotation"),
  });

  const createPackMutation = useMutation({
    mutationFn: async () =>
      (
        await fetchJson<{ success: true; data: AssetPack }>("/api/learning/expert/assets", {
          method: "POST",
          body: JSON.stringify({
            name: packName.trim(),
            artifactType,
            targetScope: "subject",
            metadata: {
              program: "germany_secondary",
              curriculumFrameworkKey: "kmk_de_sek1",
            },
          }),
        })
      ).data,
    onSuccess: async (pack) => {
      setPackName("");
      setSelectedPackId(pack.id);
      toast.success("Asset pack created");
      await queryClient.invalidateQueries({ queryKey: ["expertLearningAssets"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Failed to create asset pack"),
  });

  const createVersionMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPack) {
        throw new Error("Pick an asset pack first.");
      }
      return await fetchJson<{ success: true }>(
        `/api/learning/expert/assets/${selectedPack.id}/versions`,
        {
          method: "POST",
          body: JSON.stringify({
            artifact: JSON.parse(artifactJson),
            notes: versionNotes.trim(),
          }),
        },
      );
    },
    onSuccess: async () => {
      setVersionNotes("");
      toast.success("Draft version saved");
      await queryClient.invalidateQueries({
        queryKey: ["expertLearningAssetVersions", selectedPack?.id],
      });
      await queryClient.invalidateQueries({ queryKey: ["expertLearningAssets"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Failed to save version"),
  });

  const activateVersionMutation = useMutation({
    mutationFn: async (versionId: string) => {
      if (!selectedPack) {
        throw new Error("Pick an asset pack first.");
      }
      return await fetchJson<{ success: true }>(
        `/api/learning/expert/assets/${selectedPack.id}/activate`,
        {
          method: "POST",
          body: JSON.stringify({ versionId }),
        },
      );
    },
    onSuccess: async () => {
      toast.success("Version activated");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["expertLearningAssetVersions", selectedPack?.id],
        }),
        queryClient.invalidateQueries({ queryKey: ["expertLearningAssets"] }),
      ]);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Failed to activate version"),
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!selectedQueueItem?.topicId) {
        throw new Error("Select a review item with a topic first.");
      }
      return (
        await fetchJson<{
          success: true;
          data: { question: PreviewPayload; guidanceCount: number };
        }>("/api/learning/expert/assets/preview", {
          method: "POST",
          body: JSON.stringify({
            topicId: selectedQueueItem.topicId,
            questionType: previewQuestionType,
            difficulty: previewDifficulty,
          }),
        })
      ).data.question;
    },
    onSuccess: (question) => {
      setPreviewResult(question);
      toast.success("Preview generated");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Failed to preview question"),
  });

  const bootstrapEvalsMutation = useMutation({
    mutationFn: async () =>
      (
        await fetchJson<{ success: true; data: EvalBootstrapResult[] }>(
          "/api/learning/expert/evals/bootstrap",
          {
            method: "POST",
          },
        )
      ).data,
    onSuccess: (results) => {
      setBootstrapResults(results);
      toast.success("Eval datasets ready");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Failed to bootstrap eval datasets",
      ),
  });

  const priorityTone = useMemo(
    () => ({
      low: "bg-slate-100 text-slate-600",
      medium: "bg-amber-100 text-amber-700",
      high: "bg-rose-100 text-rose-700",
    }),
    [],
  );

  return (
    <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-950">
              Learning Expert Review Queue
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Review sessions that show reasoning gaps, weak transfer, or low originality signals.
            </p>
          </div>
          <Brain className="h-5 w-5 text-sky-700" />
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-3">
            {queueQuery.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading review queue...
              </div>
            ) : queueQuery.data?.length ? (
              queueQuery.data.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setSelectedQueueKey(item.key)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    selectedQueueItem?.key === item.key
                      ? "border-sky-300 bg-sky-50/70"
                      : "border-slate-200 bg-slate-50/70 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium text-slate-950">
                      {item.studentName ?? "Unknown student"}
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${priorityTone[item.priority]}`}>
                      {item.priority}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    {item.topicTitle ?? "Unknown topic"} {item.subjectLabel ? `| ${item.subjectLabel}` : ""}
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    {item.reasons[0] ?? "Needs expert review"}
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-5 text-sm text-slate-500">
                No review items yet.
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
            <div className="text-sm font-semibold text-slate-950">
              {selectedQueueItem?.studentName ?? "Select a review item"}
            </div>
            <div className="mt-1 text-sm text-slate-600">
              {selectedQueueItem?.topicTitle ?? "Reasoning review details will appear here."}
            </div>
            {selectedQueueItem ? (
              <>
                <div className="mt-4 space-y-2">
                  {selectedQueueItem.reasons.map((reason) => (
                    <div key={reason} className="rounded-xl bg-white px-3 py-2 text-sm text-slate-700">
                      {reason}
                    </div>
                  ))}
                </div>

                <div className="mt-5 grid gap-3">
                  <select
                    value={annotationType}
                    onChange={(event) => setAnnotationType(event.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none"
                  >
                    <option value="reasoning_gap">Reasoning gap</option>
                    <option value="misconception">Misconception</option>
                    <option value="question_quality">Question quality</option>
                    <option value="rubric_improvement">Rubric improvement</option>
                    <option value="hint_ladder">Hint ladder</option>
                  </select>
                  <textarea
                    value={annotationSummary}
                    onChange={(event) => setAnnotationSummary(event.target.value)}
                    rows={3}
                    placeholder="What should the tutor learn from this case?"
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                  />
                  <textarea
                    value={annotationEvidence}
                    onChange={(event) => setAnnotationEvidence(event.target.value)}
                    rows={4}
                    placeholder="Paste the evidence or reasoning pattern you want future versions to remember."
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => createAnnotationMutation.mutate()}
                    disabled={createAnnotationMutation.isPending || !annotationSummary.trim()}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {createAnnotationMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Save annotation
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-slate-950">
                Pedagogy Asset Studio
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Create versioned tutoring assets and activate them only when they are ready.
              </p>
            </div>
            <BookOpenCheck className="h-5 w-5 text-emerald-700" />
          </div>

          <div className="mt-5 grid gap-3">
            <input
              value={packName}
              onChange={(event) => setPackName(event.target.value)}
              placeholder="New pack name"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
            />
            <select
              value={artifactType}
              onChange={(event) => setArtifactType(event.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
            >
              <option value="question_pattern">Question pattern</option>
              <option value="misconception_rule">Misconception rule</option>
              <option value="rubric_set">Rubric set</option>
              <option value="hint_ladder">Hint ladder</option>
              <option value="reflection_template">Reflection template</option>
              <option value="subject_playbook">Subject playbook</option>
            </select>
            <button
              type="button"
              onClick={() => createPackMutation.mutate()}
              disabled={createPackMutation.isPending || !packName.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {createPackMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create pack
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {assetsQuery.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading packs...
              </div>
            ) : (
              assetsQuery.data?.map((pack) => (
                <button
                  key={pack.id}
                  type="button"
                  onClick={() => setSelectedPackId(pack.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    selectedPack?.id === pack.id
                      ? "border-emerald-300 bg-emerald-50/70"
                      : "border-slate-200 bg-slate-50/70 hover:border-slate-300"
                  }`}
                >
                  <div className="font-medium text-slate-950">{pack.name}</div>
                  <div className="mt-1 text-sm text-slate-600">
                    {pack.artifactType} | {pack.status} | {pack.targetScope}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-lg font-semibold tracking-tight text-slate-950">
            Draft or Activate a Version
          </div>
          <div className="mt-1 text-sm text-slate-600">
            {selectedPack ? `Working in ${selectedPack.name}` : "Pick an asset pack first."}
          </div>

          {selectedPack ? (
            <div className="mt-5 space-y-4">
              <textarea
                value={artifactJson}
                onChange={(event) => setArtifactJson(event.target.value)}
                rows={10}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs outline-none"
              />
              <input
                value={versionNotes}
                onChange={(event) => setVersionNotes(event.target.value)}
                placeholder="Version notes"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
              />
              <button
                type="button"
                onClick={() => createVersionMutation.mutate()}
                disabled={createVersionMutation.isPending}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {createVersionMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save draft version
              </button>

              <div className="space-y-3">
                {versionsQuery.isLoading ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading versions...
                  </div>
                ) : (
                  versionsQuery.data?.map((version) => (
                    <div key={version.id} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                      <div>
                        <div className="font-medium text-slate-950">Version {version.version}</div>
                        <div className="mt-1 text-sm text-slate-600">
                          {version.status} {version.notes ? `| ${version.notes}` : ""}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => activateVersionMutation.mutate(version.id)}
                        disabled={activateVersionMutation.isPending || version.status === "approved"}
                        className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 disabled:opacity-60"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Activate
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-lg font-semibold tracking-tight text-slate-950">
                Runtime Preview
              </div>
              <div className="mt-1 text-sm text-slate-600">
                Generate one reasoning-first question against the selected review topic before publishing assets.
              </div>
            </div>
            <Sparkles className="h-5 w-5 text-sky-700" />
          </div>

          <div className="mt-5 grid gap-3">
            <select
              value={previewQuestionType}
              onChange={(event) => setPreviewQuestionType(event.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
            >
              <option value="self_explanation">Self explanation</option>
              <option value="worked_step_diagnosis">Worked-step diagnosis</option>
              <option value="error_analysis">Error analysis</option>
              <option value="compare_two_solutions">Compare two solutions</option>
              <option value="transfer_challenge">Transfer challenge</option>
              <option value="constraint_change">Constraint change</option>
              <option value="problem_posing">Problem posing</option>
              <option value="metacognitive_reflection">Metacognitive reflection</option>
            </select>
            <select
              value={previewDifficulty}
              onChange={(event) => setPreviewDifficulty(event.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
            <button
              type="button"
              onClick={() => previewMutation.mutate()}
              disabled={previewMutation.isPending || !selectedQueueItem?.topicId}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {previewMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Preview question
            </button>
          </div>

          {previewResult ? (
            <div className="mt-5 space-y-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Prompt
                </div>
                <div className="mt-1 text-sm text-slate-800">{previewResult.prompt}</div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-white p-3 text-sm text-slate-700">
                  <div className="font-medium text-slate-950">Question type</div>
                  <div className="mt-1">{previewResult.questionType}</div>
                </div>
                <div className="rounded-xl bg-white p-3 text-sm text-slate-700">
                  <div className="font-medium text-slate-950">Reasoning skill</div>
                  <div className="mt-1">{previewResult.reasoningSkill}</div>
                </div>
              </div>
              <div className="rounded-xl bg-white p-3 text-sm text-slate-700">
                <div className="font-medium text-slate-950">Evidence requirements</div>
                <div className="mt-1">
                  {previewResult.evidenceRequirements.join(" | ") || "None"}
                </div>
              </div>
              <div className="rounded-xl bg-white p-3 text-sm text-slate-700">
                <div className="font-medium text-slate-950">Hint ladder</div>
                <div className="mt-1">
                  {previewResult.hintLadder.join(" | ") || "None"}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-lg font-semibold tracking-tight text-slate-950">
                Subject Eval Baselines
              </div>
              <div className="mt-1 text-sm text-slate-600">
                Bootstrap offline tutoring eval datasets for math, physics, chemistry, and biology.
              </div>
            </div>
            <TestTube2 className="h-5 w-5 text-violet-700" />
          </div>

          <button
            type="button"
            onClick={() => bootstrapEvalsMutation.mutate()}
            disabled={bootstrapEvalsMutation.isPending}
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {bootstrapEvalsMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <TestTube2 className="h-4 w-4" />
            )}
            Bootstrap eval datasets
          </button>

          {bootstrapResults.length > 0 ? (
            <div className="mt-5 space-y-3">
              {bootstrapResults.map((result) => (
                <div
                  key={result.datasetId}
                  className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
                >
                  <div className="font-medium text-slate-950">{result.datasetName}</div>
                  <div className="mt-1 text-sm text-slate-600">
                    {result.status} {result.caseCount > 0 ? `| ${result.caseCount} cases` : ""}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
