"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, Plus, Sparkles, BookOpen, Hash, AlertCircle } from "lucide-react";
import { createLessonAction } from "@/app/actions/classroom";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/shared/http/query-keys";
import toast from "react-hot-toast";
import { InputField } from "@/features/auth/public-ui";
import { TextareaField } from "@/features/auth/public-ui";
import { FormDropdown } from "@/shared/ui/form-dropdown";
import { cn } from "@/shared/ui/tailwind-class-utils";
import { getFriendlyActionError } from "@/shared/http/friendly-action-error";
import { useRouter } from "@/i18n/routing";

type CreateLessonModalProps = {
    isOpen: boolean;
    onClose: () => void;
    classroomId: string;
    availableCourses: Array<{
        id: string;
        title: string;
    }>;
};

export function CreateLessonModal({ 
    isOpen, 
    onClose, 
    classroomId,
    availableCourses,
}: CreateLessonModalProps) {
    const queryClient = useQueryClient();
    const router = useRouter();
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [courseId, setCourseId] = useState(availableCourses[0]?.id ?? "");
    
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const resetForm = () => {
        setTitle("");
        setDescription("");
        setCourseId(availableCourses[0]?.id ?? "");
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
            const selectedCourse = availableCourses.find((course) => course.id === courseId);
            if (!selectedCourse) {
                throw new Error("Choose a course before creating the session.");
            }

            const result = await createLessonAction({
                classroomId,
                courseId: selectedCourse.id,
                title: title.trim(),
                description: description.trim() || undefined,
            });
            if (!result.success) {
                throw new Error(getFriendlyActionError(result.error));
            }

            toast.success("Session draft created");
            await queryClient.invalidateQueries({
                queryKey: queryKeys.learning.lessons(classroomId),
            });
            resetForm();
            onClose();
            router.push(`/dashboard/teaching/lessons/${result.data.id}`);
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

            <div className="relative mx-4 w-full max-w-xl animate-in zoom-in-95 rounded-3xl border border-gray-100 bg-white shadow-2xl duration-300">
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
                                Add the session title, course, and overview to create the draft.
                            </p>
                        </div>
                    </div>
                </div>

                <form onSubmit={(event) => {
                    void handleSubmit(event);
                }} className="flex max-h-[76vh] flex-col">
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
                            id="lesson-title"
                            placeholder="e.g. Newton's Laws of Motion"
                            icon={BookOpen}
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            required
                        />

                        <div className="grid gap-4">
                            <FormDropdown
                                id="lesson-course"
                                label="Course"
                                icon={Hash}
                                value={courseId}
                                onChange={setCourseId}
                                placeholder="Select a course"
                                options={availableCourses.map((course) => ({
                                    value: course.id,
                                    label: course.title,
                                }))}
                                menuZIndex={120}
                            />

                            <TextareaField
                                label="Session overview"
                                id="lesson-overview"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={4}
                                placeholder="Briefly describe what this session will cover..."
                                className="resize-none"
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

