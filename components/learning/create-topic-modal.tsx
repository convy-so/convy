"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, Plus, Sparkles, BookOpen, Hash, AlertCircle } from "lucide-react";
import { createLearningTopicAction } from "@/app/actions/classroom";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import toast from "react-hot-toast";
import { InputField } from "@/components/auth/input-field";
import { TextareaField } from "@/components/auth/textarea-field";
import { cn } from "@/lib/utils";
import { getFriendlyActionError } from "@/lib/action-ux";
import { appLocaleLabels, appLocales, type AppLocale } from "@/lib/i18n/config";

type CreateTopicModalProps = {
    isOpen: boolean;
    onClose: () => void;
    classroomId: string;
};

function parseOutcomes(raw: string) {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [titlePart, ...rest] = line.split("::");
      const title = titlePart?.trim() ?? "";
      const description = rest.join("::").trim();

      if (!title || !description) {
        throw new Error(`Outcome line ${index + 1} must follow "Title :: Description".`);
      }

      return { id: `outcome-${index + 1}`, title, description };
    });
}

export function CreateTopicModal({ 
    isOpen, 
    onClose, 
    classroomId 
}: CreateTopicModalProps) {
    const queryClient = useQueryClient();
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [subjectKey, setSubjectKey] = useState("");
    const [subjectLabel, setSubjectLabel] = useState("");
    const [outcomes, setOutcomes] = useState("");
    const [contentLocale, setContentLocale] = useState<AppLocale>("en");
    const [teacherSummary, setTeacherSummary] = useState("");
    const [scopeNotes, setScopeNotes] = useState("");
    const [notationNotes, setNotationNotes] = useState("");
    const [rigorNotes, setRigorNotes] = useState("");
    
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const resetForm = () => {
        setTitle("");
        setDescription("");
        setSubjectKey("");
        setSubjectLabel("");
        setOutcomes("");
        setContentLocale("en");
        setTeacherSummary("");
        setScopeNotes("");
        setNotationNotes("");
        setRigorNotes("");
        setError(null);
    };

    const handleClose = () => {
        if (isSubmitting) return;
        onClose();
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!title.trim()) return;

        setIsSubmitting(true);
        setError(null);

        try {
            const parsedOutcomes = parseOutcomes(outcomes);
            
            const result = await createLearningTopicAction({
                classroomId,
                title: title.trim(),
                description: description.trim() || undefined,
                subjectKey: subjectKey.trim() || undefined,
                subjectLabel: subjectLabel.trim() || undefined,
                contentLocale,
                learningOutcomes: parsedOutcomes,
                sourceBoundary: {
                    teacherSummary: teacherSummary.trim() || description.trim() || undefined,
                    scopeNotes: scopeNotes.split("\n").map((line) => line.trim()).filter(Boolean),
                    notationNotes: notationNotes.split("\n").map((line) => line.trim()).filter(Boolean),
                    rigorNotes: rigorNotes.split("\n").map((line) => line.trim()).filter(Boolean),
                },
            });
            if (!result.success) {
                throw new Error(getFriendlyActionError(result.error));
            }

            toast.success("Session created");
            await queryClient.invalidateQueries({
                queryKey: queryKeys.learning.topics(classroomId),
            });
            resetForm();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : "An unexpected error occurred");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen || !mounted) return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-md animate-in fade-in duration-300"
                onClick={handleClose}
            />

            <div className="relative mx-4 w-full max-w-xl animate-in zoom-in-95 overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-2xl duration-300">
                <button
                        type="button"
                        onClick={handleClose}
                        disabled={isSubmitting}
                        className="absolute top-4 right-4 p-2 rounded-full text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-all z-20"
                    >
                        <X className="w-5 h-5" />
                    </button>

                <div className="border-b border-gray-100 px-6 py-5">
                    <div className="flex items-start gap-3 pr-10">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-amber-100 bg-amber-50 text-amber-600">
                            <Sparkles className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-[#080808]">Create a new session</h3>
                            <p className="mt-1 text-sm text-[#696969]">
                                Define the learning scope, outcomes, and grounding that students will move through in this session.
                            </p>
                        </div>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="flex max-h-[76vh] flex-col">
                    <div className="space-y-4 overflow-y-auto px-6 py-5">
                        {error && (
                            <div className="rounded-2xl border border-rose-100 bg-rose-50 p-3 text-sm font-medium text-rose-600 animate-in slide-in-from-top-2">
                                <div className="flex gap-2">
                                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                    <span>{error}</span>
                                </div>
                            </div>
                        )}

                        <InputField
                            label="Session title"
                            id="topic-title"
                            placeholder="e.g. Newton's Laws of Motion"
                            icon={BookOpen}
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            required
                        />

                        <div className="grid gap-4 ">
                            <InputField
                                label="Subject area"
                                id="subject-area"
                                placeholder="e.g. Classical Mechanics"
                                icon={Hash}
                                value={subjectLabel}
                                onChange={(e) => setSubjectLabel(e.target.value)}
                            />

                            <InputField
                                label="Subject key"
                                id="subject-key"
                                placeholder="e.g. physics.mechanics"
                                icon={Hash}
                                value={subjectKey}
                                onChange={(e) => setSubjectKey(e.target.value)}
                            />

                            <TextareaField
                                label="Session overview"
                                id="topic-overview"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={4}
                                placeholder="Briefly describe what this session will cover..."
                                className="resize-none"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-[#292929]">
                                Content language
                            </label>
                            <select
                                value={contentLocale}
                                onChange={(e) => setContentLocale(e.target.value as AppLocale)}
                                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-[#292929] outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-[#292929]"
                            >
                                {appLocales.map((locale) => (
                                    <option key={locale} value={locale}>
                                        {appLocaleLabels[locale]}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <TextareaField
                            label="Session outcomes"
                            id="topic-outcomes"
                            value={outcomes}
                            onChange={(e) => setOutcomes(e.target.value)}
                            rows={4}
                            placeholder={"Outcome Title :: Detailed description\ne.g. Inertia :: Understand resistance to change in motion"}
                            helperText='Use one outcome per line in the format: Title :: Description.'
                            className="resize-none font-mono text-[13px] leading-5"
                            required
                        />

                        <TextareaField
                            label="Teacher grounding summary"
                            id="topic-teacher-summary"
                            value={teacherSummary}
                            onChange={(e) => setTeacherSummary(e.target.value)}
                            rows={3}
                            placeholder="Summarize the boundaries, framing, and what the tutor should emphasize for this topic."
                            className="resize-none"
                        />

                        <div className="grid gap-4 md:grid-cols-3">
                            <TextareaField
                                label="Scope notes"
                                id="topic-scope-notes"
                                value={scopeNotes}
                                onChange={(e) => setScopeNotes(e.target.value)}
                                rows={4}
                                placeholder={"Stay within Newtonian mechanics\nAvoid relativistic edge cases"}
                                helperText="One note per line."
                                className="resize-none text-[13px] leading-5"
                            />
                            <TextareaField
                                label="Notation notes"
                                id="topic-notation-notes"
                                value={notationNotes}
                                onChange={(e) => setNotationNotes(e.target.value)}
                                rows={4}
                                placeholder={"Use F = ma\nPrefer SI units"}
                                helperText="One note per line."
                                className="resize-none text-[13px] leading-5"
                            />
                            <TextareaField
                                label="Rigor notes"
                                id="topic-rigor-notes"
                                value={rigorNotes}
                                onChange={(e) => setRigorNotes(e.target.value)}
                                rows={4}
                                placeholder={"Derive before summarizing\nShow assumptions explicitly"}
                                helperText="One note per line."
                                className="resize-none text-[13px] leading-5"
                            />
                        </div>
                    </div>

                    <div className="flex items-center justify-end gap-3 border-t border-gray-100 bg-gray-50/60 px-6 py-4">
                    <button
                        type="button"
                        onClick={handleClose}
                        disabled={isSubmitting}
                        className="px-3 py-2 text-sm font-medium text-[#696969] transition-colors hover:text-[#292929]"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={!title.trim() || isSubmitting}
                        className={cn(
                            "flex min-w-[148px] items-center justify-center gap-2 rounded-xl bg-[#292929] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#3a3a3a] focus:ring-2 focus:ring-[#292929] focus:ring-offset-2 outline-none disabled:cursor-not-allowed disabled:opacity-50"
                        )}
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Defining...
                            </>
                        ) : (
                            <>
                                <Plus className="h-4 w-4" />
                                Create session
                            </>
                        )}
                    </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
}
