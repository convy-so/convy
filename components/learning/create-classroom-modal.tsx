"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, Plus, GraduationCap, Sparkles, BookOpen, Layers, Hash, ChevronDown, Check } from "lucide-react";
import { createClassroom } from "@/lib/api/learning";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import toast from "react-hot-toast";
import { InputField } from "@/components/auth/input-field";
import { cn } from "@/lib/utils";

type Department = {
    id: string;
    name: string;
};

type CreateClassroomModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: (id: string) => void;
    departments: Department[];
};

export function CreateClassroomModal({ 
    isOpen, 
    onClose,
    onSuccess,
    departments 
}: CreateClassroomModalProps) {
    const queryClient = useQueryClient();
    const [title, setTitle] = useState("");
    const [gradeLabel, setGradeLabel] = useState("");
    const [subject, setSubject] = useState("");
    const [departmentId, setDepartmentId] = useState("");
    const [description, setDescription] = useState("");
    
    const [isDeptDropdownOpen, setIsDeptDropdownOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const resetForm = () => {
        setTitle("");
        setGradeLabel("");
        setSubject("");
        setDepartmentId("");
        setDescription("");
        setError(null);
    };

    const handleSubmit = async () => {
        if (!title.trim() || !gradeLabel.trim()) return;

        setIsSubmitting(true);
        setError(null);

        try {
            const result = await createClassroom({
                title: title.trim(),
                gradeLabel: gradeLabel.trim(),
                subject: subject.trim() || undefined,
                departmentId: departmentId || undefined,
                description: description.trim() || undefined,
            });

            toast.success("Classroom established");
            await queryClient.invalidateQueries({
                queryKey: queryKeys.learning.classrooms,
            });
            onSuccess?.(result.data.id);
            resetForm();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : "An unexpected error occurred");
        } finally {
            setIsSubmitting(false);
        }
    };

    const selectedDept = departments.find(d => d.id === departmentId);

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

                    <div className="grid grid-cols-2 gap-4">
                        <InputField
                            label="Grade Level"
                            id="grade-level"
                            placeholder="e.g. Year 10"
                            icon={Layers}
                            value={gradeLabel}
                            onChange={(e) => setGradeLabel(e.target.value)}
                            required
                        />
                        <InputField
                            label="Core Subject"
                            id="core-subject"
                            placeholder="e.g. Science"
                            icon={Hash}
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-[#292929]">
                            Academy Unit / Department
                        </label>
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setIsDeptDropdownOpen(!isDeptDropdownOpen)}
                                className="w-full pl-4 pr-4 py-3 border border-gray-200 rounded-xl hover:border-gray-300 focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all text-left bg-white text-sm flex items-center justify-between"
                            >
                                <span className={cn(departmentId ? "text-gray-900" : "text-gray-400")}>
                                    {selectedDept ? selectedDept.name : "Select a unit (Optional)"}
                                </span>
                                <ChevronDown className={cn("w-4 h-4 text-gray-400 transition-transform", isDeptDropdownOpen && "rotate-180")} />
                            </button>

                            {isDeptDropdownOpen && (
                                <>
                                    <div className="fixed inset-0 z-[110]" onClick={() => setIsDeptDropdownOpen(false)} />
                                    <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-100 rounded-xl shadow-xl z-[120] py-2 max-h-[200px] overflow-y-auto animate-in fade-in zoom-in-95">
                                        <button
                                            type="button"
                                            onClick={() => { setDepartmentId(""); setIsDeptDropdownOpen(false); }}
                                            className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 transition-colors flex items-center justify-between"
                                        >
                                            <span className="text-gray-500">No Academy Unit</span>
                                            {!departmentId && <Check className="w-4 h-4 text-gray-900" />}
                                        </button>
                                        <div className="h-px bg-gray-50 my-1" />
                                        {departments.map((dept) => (
                                            <button
                                                key={dept.id}
                                                type="button"
                                                onClick={() => {
                                                    setDepartmentId(dept.id);
                                                    setIsDeptDropdownOpen(false);
                                                }}
                                                className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 transition-colors flex items-center justify-between"
                                            >
                                                <span className="font-medium text-gray-900">{dept.name}</span>
                                                {departmentId === dept.id && <Check className="w-4 h-4 text-gray-900" />}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

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
                        onClick={handleSubmit}
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
