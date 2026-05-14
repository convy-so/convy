"use client";

import { useState } from "react";
import { z } from "zod";
import { Plus, X, Tag as TagIcon, Loader2, Save } from "lucide-react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";

import { createExpertFewShotExample } from "@/app/actions/ai-ops";
import { getFriendlyActionError } from "@/lib/action-ux";

type FewShotExample = {
  id: string;
  feature: string;
  tags: string[] | null;
  content: Record<string, unknown>;
  isActive: boolean;
};

interface FewShotManagerProps {
  initialExamples: FewShotExample[];
}

const jsonObjectSchema = z.record(z.string(), z.unknown());

export function FewShotManager({ initialExamples }: FewShotManagerProps) {
  const router = useRouter();
  const [isAdding, setIsAdding] = useState(false);
  const [isPending, setIsPending] = useState(false);
  
  // Form state
  const [feature, setFeature] = useState("tutoring.default");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [contentJson, setContentJson] = useState(JSON.stringify({
    userInput: "Example student question...",
    assistantOutput: "Example expert tutor response..."
  }, null, 2));

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = tagInput.trim().toLowerCase().replace(/,/g, '');
      if (val && !tags.includes(val)) {
        setTags([...tags, val]);
        setTagInput("");
      }
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  const handleSubmit = async () => {
    try {
      setIsPending(true);
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(contentJson);
      } catch {
        toast.error("Invalid JSON content");
        return;
      }
      const parsedContent = jsonObjectSchema.safeParse(parsedJson);
      if (!parsedContent.success) {
        toast.error("Example JSON must be an object");
        return;
      }

      const result = await createExpertFewShotExample({
        feature,
        tags,
        content: parsedContent.data,
      });

      if (!result.success) {
        toast.error(getFriendlyActionError(result.error));
        return;
      }

      toast.success("Few-shot example created");
      setIsAdding(false);
      setTags([]);
      setTagInput("");
      router.refresh();
    } catch {
      toast.error("Failed to create example");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold tracking-tight text-slate-950">
          Unstructured Few-Shot Examples
        </h2>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-900 hover:bg-slate-200 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Example
          </button>
        )}
      </div>

      {isAdding && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 space-y-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Feature Spec</label>
              <select
                value={feature}
                onChange={(e) => setFeature(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-slate-950"
              >
                <option value="tutoring.default">tutoring.default</option>
                <option value="tutoring.analysis">tutoring.analysis</option>
                <option value="survey.conducting">survey.conducting</option>
                <option value="survey.analytics">survey.analytics</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Tags (Press Enter)</label>
              <div className="flex flex-wrap gap-2 p-1.5 rounded-lg border border-slate-200 bg-white min-h-[38px]">
                {tags.map(tag => (
                  <span key={tag} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                    {tag}
                    <button onClick={() => removeTag(tag)} className="text-slate-400 hover:text-slate-600">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleAddTag}
                  placeholder={tags.length === 0 ? "math, socratic, ..." : ""}
                  className="flex-1 min-w-[60px] bg-transparent text-sm outline-none"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Example JSON Content</label>
            <textarea
              value={contentJson}
              onChange={(e) => setContentJson(e.target.value)}
              rows={6}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs outline-none focus:ring-1 focus:ring-slate-950"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              onClick={() => setIsAdding(false)}
              className="text-sm font-medium text-slate-500 hover:text-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Example
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {initialExamples.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-[#FAFAFA] p-8 text-center text-sm text-slate-400">
            No few-shot examples found.
          </div>
        ) : (
          initialExamples.map((example) => (
            <div key={example.id} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-400 uppercase">{example.feature}</span>
                <div className="flex gap-1.5">
                  {(example.tags ?? []).map(tag => (
                    <span key={tag} className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-600 ring-1 ring-inset ring-indigo-500/20">
                      <TagIcon className="h-2.5 w-2.5" />
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <pre className="text-[10px] text-slate-600 bg-slate-50 p-2 rounded-lg overflow-x-auto max-h-24">
                {JSON.stringify(example.content, null, 2)}
              </pre>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
