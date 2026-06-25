"use client";

import { useState } from "react";
import { Brain, Check, X, Pencil, Loader2, BookOpen } from "lucide-react";
import toast from "react-hot-toast";

import { cn } from "@/shared/ui/tailwind-class-utils";

import { approveCrystallization, rejectCrystallization } from "@/app/actions/expert-knowledge";
import { getFriendlyActionError } from "@/shared/http/friendly-action-error";
import type { ExpertHeuristic } from "@/features/tutoring/public-server";

// Type matching the DB query output
type DraftCrystallization = {
  id: string;
  title: string;
  notes: string | null;
  heuristic: ExpertHeuristic;
  relevanceScope: string;
  createdAt: Date;
  topic: {
    title: string;
  } | null;
};

export function ExpertCrystallizationInbox({
  drafts: initialDrafts,
}: {
  drafts: DraftCrystallization[];
}) {
  const [drafts, setDrafts] = useState(initialDrafts);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<DraftCrystallization>>({});

  const handleApprove = async (id: string, currentData: DraftCrystallization) => {
    setIsProcessing(id);
    try {
      // If editing, use the edited form data, otherwise use original
      const dataToSubmit = editingId === id ? {
        title: editForm.title ?? currentData.title,
        notes: editForm.notes ?? currentData.notes ?? "",
        heuristic: editForm.heuristic ?? currentData.heuristic,
        relevanceScope: editForm.relevanceScope ?? currentData.relevanceScope,
      } : {
        title: currentData.title,
        notes: currentData.notes ?? "",
        heuristic: currentData.heuristic,
        relevanceScope: currentData.relevanceScope,
      };

      const result = await approveCrystallization({
        id,
        ...dataToSubmit,
      });
      
      if (!result.success) {
        toast.error(getFriendlyActionError(result.error));
        return;
      }

      setDrafts(drafts.filter((d) => d.id !== id));
      setEditingId(null);
      toast.success("Heuristic approved");
    } catch {
      toast.error("Failed to approve heuristic");
    } finally {
      setIsProcessing(null);
    }
  };

  const handleReject = async (id: string) => {
    if (!window.confirm("Are you sure you want to discard this heuristic?")) return;
    
    setIsProcessing(id);
    try {
      const result = await rejectCrystallization(id);
      if (!result.success) {
        toast.error(getFriendlyActionError(result.error));
        return;
      }
      setDrafts(drafts.filter((d) => d.id !== id));
      toast.success("Heuristic archived");
    } catch {
      toast.error("Failed to reject heuristic");
    } finally {
      setIsProcessing(null);
    }
  };

  const startEditing = (draft: DraftCrystallization) => {
    setEditingId(draft.id);
    setEditForm({ ...draft });
  };

  if (drafts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-500 bg-white rounded-xl border border-slate-200 shadow-sm">
        <Brain className="w-12 h-12 mb-4 text-slate-300" />
        <h3 className="text-lg font-medium text-slate-900">Inbox Zero</h3>
        <p className="text-sm text-center max-w-sm mt-1">
          No pending knowledge crystallizations. Review cases need to accumulate before the AI can generalize new heuristics.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
        <h2 className="text-xl font-bold text-slate-900">Knowledge Inbox</h2>
          <p className="text-sm text-slate-500">
            Review draft pedagogical heuristics before they are allowed to shape live tutoring behavior.
          </p>
        </div>
        <div className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold flex items-center gap-1">
          <Brain className="w-3 h-3" />
          {drafts.length} Pending
        </div>
      </div>

      <div className="grid gap-6">
        {drafts.map((draft) => (
          <div key={draft.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-700 flex items-center gap-1">
                      <BookOpen className="w-3 h-3" />
                      {draft.topic?.title || "Unknown Topic"}
                    </span>
                    <span className="text-xs text-slate-400">
                      Generated {new Date(draft.createdAt).toLocaleDateString()}
                    </span>
                    <span className={cn(
                      "px-2 py-0.5 rounded text-xs font-bold uppercase ring-1 ring-inset",
                      draft.relevanceScope === "general" 
                        ? "bg-blue-50 text-blue-700 ring-blue-600/20" 
                        : "bg-purple-50 text-purple-700 ring-purple-600/20"
                    )}>
                      {draft.relevanceScope === "general" ? "General" : "Framework Specific"}
                    </span>
                  </div>
                  
                  {editingId === draft.id ? (
                    <input 
                      className="text-lg font-bold text-slate-900 bg-white border border-slate-200 rounded px-2 py-1 w-full mt-2"
                      value={editForm.title}
                      onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                    />
                  ) : (
                    <h3 className="text-lg font-bold text-slate-900 mt-1">{draft.title}</h3>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {editingId === draft.id ? (
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  ) : (
                    <button
                      onClick={() => startEditing(draft)}
                      className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                      title="Edit Heuristic"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                  
                  <button
                    onClick={() => {
                      void handleReject(draft.id);
                    }}
                    disabled={isProcessing === draft.id}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-rose-600 hover:bg-rose-50 transition-colors"
                  >
                    <X className="w-4 h-4" />
                    Reject
                  </button>
                  <button
                    onClick={() => {
                      void handleApprove(draft.id, draft);
                    }}
                    disabled={isProcessing === draft.id}
                    className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition-colors disabled:opacity-50"
                  >
                    {isProcessing === draft.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Approve {editingId === draft.id && "& Save"}
                  </button>
                </div>
              </div>
            </div>

            <div className="p-5 space-y-4">
              {editingId === draft.id ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Trigger / Context</label>
                    <textarea 
                      className="w-full text-sm text-slate-700 bg-white border border-slate-200 rounded p-2"
                      rows={2}
                      value={(editForm.heuristic ?? draft.heuristic).trigger}
                      onChange={(e) => setEditForm({ ...editForm, heuristic: { ...(editForm.heuristic ?? draft.heuristic), trigger: e.target.value } })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Action / Pedagogy</label>
                    <textarea 
                      className="w-full text-sm text-slate-700 bg-white border border-slate-200 rounded p-2"
                      rows={2}
                      value={(editForm.heuristic ?? draft.heuristic).action}
                      onChange={(e) => setEditForm({ ...editForm, heuristic: { ...(editForm.heuristic ?? draft.heuristic), action: e.target.value } })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Rationale</label>
                    <textarea 
                      className="w-full text-sm text-slate-700 bg-white border border-slate-200 rounded p-2"
                      rows={2}
                      value={(editForm.heuristic ?? draft.heuristic).rationale}
                      onChange={(e) => setEditForm({ ...editForm, heuristic: { ...(editForm.heuristic ?? draft.heuristic), rationale: e.target.value } })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Relevance Scope</label>
                    <select 
                      className="w-full text-sm text-slate-700 bg-white border border-slate-200 rounded p-2"
                      value={editForm.relevanceScope}
                      onChange={(e) => setEditForm({ ...editForm, relevanceScope: e.target.value })}
                    >
                      <option value="general">General Pedagogy</option>
                      <option value="framework_specific">Framework Specific</option>
                    </select>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">When this happens (Trigger)</h4>
                      <p className="text-sm text-slate-700 leading-relaxed">{draft.heuristic.trigger}</p>
                    </div>
                    <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-100">
                      <h4 className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-2">Tutor should do this (Action)</h4>
                      <p className="text-sm text-emerald-800 leading-relaxed font-medium">{draft.heuristic.action}</p>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Pedagogical Rationale</h4>
                    <p className="text-sm text-slate-600 italic">{draft.heuristic.rationale}</p>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
