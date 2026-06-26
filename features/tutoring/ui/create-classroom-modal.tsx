"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, Plus, GraduationCap, Sparkles, BookOpen, Layers } from "lucide-react";
import { createClassroomAction } from "@/app/actions/classroom";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/shared/http/query-keys";
import toast from "react-hot-toast";
import { InputField } from "@/features/auth/public-ui";
import { cn } from "@/shared/ui/tailwind-class-utils";
import { getFriendlyActionError } from "@/shared/http/friendly-action-error";
import { appLocaleLabels, appLocales, isAppLocale, type AppLocale } from "@/shared/i18n/config";

type CreateClassroomModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: (id: string) => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function getCreatedClassroomId(value: unknown): string | null {
    if (!isRecord(value) || typeof value.id !== "string") {
        return null;
    }

    return value.id;
}

export function CreateClassroomModal({ 
    isOpen, 
    onClose,
    onSuccess
}: CreateClassroomModalProps) {
    const queryClient = useQueryClient();
    const [title, setTitle] = useState("");
    const [gradeLabel, setGradeLabel] = useState("");
    const [description, setDescription] = useState("");
    const [defaultContentLocale, setDefaultContentLocale] = useState<AppLocale>("en");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const resetForm = () => {
        setTitle("");
        setGradeLabel("");
        setDescription("");
        setDefaultContentLocale("en");
        setError(null);
    };

    const handleSubmit = async () => {
        if (!title.trim() || !gradeLabel.trim()) return;

        setIsSubmitting(true);
        setError(null);

        try {
            const result = await createClassroomAction({
                title: title.trim(),
                gradeLabel: gradeLabel.trim(),
                description: description.trim() || undefined,
                defaultContentLocale,
            });

            if (!result.success) {
                throw new Error(getFriendlyActionError(result.error));
            }

            toast.success("Classroom established");
            await queryClient.invalidateQueries({
                queryKey: queryKeys.learning.classrooms,
            });
            const classroomId = getCreatedClassroomId(result.data);
            if (classroomId) {
                onSuccess?.(classroomId);
            }
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
                onClick={() => !isSubmitting && onClose()}
            />

            <div className="relative bg-white rounded-3xl w-full max-w-md mx-4 animate-in fade-in zoom-in-95 duration-300 overflow-hidden border border-gray-100 shadow-2xl">
                <div className="px-8 pt-8 pb-4 space-y-4 overflow-y-auto max-h-[85vh]">
                    {/* Header */}
                    <div className="text-center mb-2">
                        <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center mx-auto mb-3 border border-gray-100 shadow-sm">
                            <GraduationCap className="w-6 h-6 text-gray-900" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-1">
                             Start a new class
                        </h3>
                        <p className="text-xs text-gray-500">Set up a teacher-owned classroom to manage students and AI.</p>
                    </div>

                    <button
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="absolute top-4 right-4 p-2 rounded-full text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-all z-20"
                    >
                        <X className="w-5 h-5" />
                    </button>

                    {error && (
                        <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-sm font-medium text-rose-600 animate-in slide-in-from-top-2">
                            {error}
                        </div>
                    )}

                    <InputField
                        label="Class Title"
                        id="class-title"
                        placeholder="e.g. Introduction to Physics"
                        icon={BookOpen}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        required
                    />

                    <InputField
                        label="Grade Level"
                        id="grade-level"
                        placeholder="e.g. Year 10"
                        icon={Layers}
                        value={gradeLabel}
                        onChange={(e) => setGradeLabel(e.target.value)}
                        required
                    />

                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-[#292929]">
                            Description (Optional)
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={3}
                            placeholder="Brief purpose of this course..."
                            className="w-full px-4 py-3 resize-none rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-[#292929] focus:border-transparent outline-none transition-all placeholder:text-gray-400"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-[#292929]">
                            Default study language
                        </label>
                        <select
                            value={defaultContentLocale}
                            onChange={(e) => {
                                const nextLocale = e.target.value;
                                if (isAppLocale(nextLocale)) {
                                    setDefaultContentLocale(nextLocale);
                                }
                            }}
                            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-[#292929] outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-[#292929]"
                        >
                            {appLocales.map((locale) => (
                                <option key={locale} value={locale}>
                                    {appLocaleLabels[locale]}
                                </option>
                            ))}
                        </select>
                        <p className="text-[11px] font-medium leading-relaxed text-gray-500">
                            New lesson tutors and student onboarding default to this language unless you override it later.
                        </p>
                    </div>

                    <div className="bg-sky-50 rounded-xl p-3 border border-sky-100/50 flex gap-3">
                        <div className="w-5 h-5 rounded-lg bg-sky-100 flex items-center justify-center flex-shrink-0">
                            <Sparkles className="w-3 h-3 text-sky-600" />
                        </div>
                        <p className="text-[11px] text-sky-800 leading-relaxed font-medium">
                            Classrooms allow you to organize students, assign AI tutors, and track progress.
                        </p>
                    </div>
                </div>

                <div className="px-8 py-4 bg-gray-50/50 border-t border-gray-100 flex items-center justify-end gap-3">
                    <button
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="px-4 py-2 text-sm font-bold text-gray-400 hover:text-gray-800 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => {
                            void handleSubmit();
                        }}
                        disabled={!title.trim() || !gradeLabel.trim() || isSubmitting}
                        className={cn(
                            "flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-xl font-bold text-sm hover:bg-gray-800 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-gray-200 icon-white",
                            isSubmitting && "opacity-50 pointer-events-none"
                        )}
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Processing...
                            </>
                        ) : (
                            <>
                                <Plus className="w-3.5 h-3.5" />
                                Create Classroom
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

