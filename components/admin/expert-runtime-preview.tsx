"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import toast from "react-hot-toast";

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

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    credentials: "include",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const payload = (await response.json()) as { error?: string } & T;
  if (!response.ok) throw new Error(payload.error ?? "Request failed");
  return payload;
}

export function ExpertRuntimePreview() {
  const [topicId, setTopicId] = useState("");
  const [questionType, setQuestionType] = useState("self_explanation");
  const [difficulty, setDifficulty] = useState("medium");
  const [result, setResult] = useState<PreviewPayload | null>(null);

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!topicId.trim()) throw new Error("Enter a Topic ID to preview against.");
      return (
        await fetchJson<{
          success: true;
          data: { question: PreviewPayload; guidanceCount: number };
        }>("/api/learning/expert/assets/preview", {
          method: "POST",
          body: JSON.stringify({ topicId: topicId.trim(), questionType, difficulty }),
        })
      ).data.question;
    },
    onSuccess: (question) => {
      setResult(question);
      toast.success("Preview generated");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to preview"),
  });

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.02)] space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-950">Runtime Preview</h2>
          <p className="mt-1 text-sm text-slate-500">
            Generate a sample question against a topic before publishing assets.
          </p>
        </div>
        <Sparkles className="h-5 w-5 text-slate-400" />
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_200px_160px_auto]">
        <input
          value={topicId}
          onChange={(e) => setTopicId(e.target.value)}
          placeholder="Topic ID…"
          className="rounded-xl border border-slate-200 bg-[#FAFAFA] px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-slate-900 focus:bg-white transition-colors"
        />
        <select
          value={questionType}
          onChange={(e) => setQuestionType(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-slate-900"
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
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-slate-900"
        >
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
        <button
          type="button"
          onClick={() => previewMutation.mutate()}
          disabled={previewMutation.isPending || !topicId.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white disabled:opacity-50 hover:bg-slate-800 transition-colors whitespace-nowrap"
        >
          {previewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Preview
        </button>
      </div>

      {result && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-[#FAFAFA] p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Generated Prompt</p>
            <p className="text-sm text-slate-800 leading-relaxed">{result.prompt}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { label: "Question Type", value: result.questionType },
              { label: "Reasoning Skill", value: result.reasoningSkill },
              { label: "Difficulty", value: result.difficulty },
              { label: "Evidence Requirements", value: result.evidenceRequirements.join(", ") || "—" },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl bg-white border border-slate-100 p-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</p>
                <p className="mt-1 text-sm text-slate-700">{value}</p>
              </div>
            ))}
          </div>
          {result.hintLadder.length > 0 && (
            <div className="rounded-xl bg-white border border-slate-100 p-3">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Hint Ladder</p>
              <ol className="list-decimal list-inside space-y-1">
                {result.hintLadder.map((hint, i) => (
                  <li key={i} className="text-sm text-slate-700">{hint}</li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
