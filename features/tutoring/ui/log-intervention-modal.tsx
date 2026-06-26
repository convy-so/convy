"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, Sparkles, AlignLeft, Calendar, Check, ChevronDown } from "lucide-react";
import { createInterventionAction } from "@/app/actions/classroom";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/shared/http/query-keys";
import toast from "react-hot-toast";
import { InputField } from "@/features/auth/public-ui";
import { cn } from "@/shared/ui/tailwind-class-utils";
import { getFriendlyActionError } from "@/shared/http/friendly-action-error";

type InterventionType = "reteach" | "check_in" | "practice" | "family_follow_up";
type InterventionPriority = "low" | "medium" | "high";

type LogInterventionModalProps = {
    isOpen: boolean;
    onClose: () => void;
    classroomId: string;
    classroomStudentId: string;
    studentName: string;
    lessonId?: string | null;
};

const INTERVENTION_TYPES: { value: InterventionType; label: string; color: string }[] = [
    { value: "reteach", label: "Reteach Concept", color: "text-rose-600 bg-rose-50 border-rose-100" },
    { value: "check_in", label: "Check-in", color: "text-blue-600 bg-blue-50 border-blue-100" },
    { value: "practice", label: "More Practice", color: "text-emerald-600 bg-emerald-50 border-emerald-100" },
    { value: "family_follow_up", label: "Family Follow-up", color: "text-purple-600 bg-purple-50 border-purple-100" },
];

const PRIORITIES: { value: InterventionPriority; label: string; color: string }[] = [
    { value: "high", label: "High Priority", color: "text-rose-700 bg-rose-50" },
    { value: "medium", label: "Medium", color: "text-amber-700 bg-amber-50" },
    { value: "low", label: "Low", color: "text-gray-600 bg-gray-50" },
];

export function LogInterventionModal({ 
    isOpen, 
    onClose, 
    classroomId,
    classroomStudentId,
    studentName,
    lessonId
}: LogInterventionModalProps) {
    const queryClient = useQueryClient();
    const [title, setTitle] = useState("");
    const [notes, setNotes] = useState("");
    const [type, setType] = useState<InterventionType>("reteach");
    const [priority, setPriority] = useState<InterventionPriority>("medium");
    const [dueAt, setDueAt] = useState("");
    
    const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
    const [isPriorityDropdownOpen, setIsPriorityDropdownOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const resetForm = () => {
        setTitle("");
        setNotes("");
        setType("reteach");
        setPriority("medium");
        setDueAt("");
    };

    const handleSubmit = async () => {
        if (!title.trim() || !classroomStudentId) return;

        setIsSubmitting(true);

        try {
            const result = await createInterventionAction({
                classroomId,
                classroomStudentId,
                lessonId: lessonId ?? undefined,
                interventionType: type,
                priority,
                title: title.trim(),
                notes: notes.trim() || undefined,
                dueAt: dueAt || undefined,
            });
            if (!result.success) {
                throw new Error(getFriendlyActionError(result.error));
            }

            toast.success(`Intervention logged for ${studentName}`);
            void queryClient.invalidateQueries({
                queryKey: queryKeys.tutoring.interventions(
                    classroomId, 
                    classroomStudentId, 
                    lessonId ?? undefined
                ),
            });
            resetForm();
            onClose();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "An unexpected error occurred");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen || !mounted) return null;

    const selectedType = INTERVENTION_TYPES.find(t => t.value === type);
    const selectedPriority = PRIORITIES.find(p => p.value === priority);

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-md animate-in fade-in duration-300"
                onClick={() => !isSubmitting && onClose()}
            />

            <div className="relative bg-white rounded-3xl w-full max-w-md mx-4 animate-in fade-in zoom-in-95 duration-300 overflow-hidden border border-gray-100 shadow-2xl">
                <div className="px-8 pt-8 pb-4 space-y-4 overflow-y-auto max-h-[85vh]">
                    {/* Header */}
                    <div className="text-center mb-4">
                        <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center mx-auto mb-3 border border-amber-100 shadow-sm">
                            <Sparkles className="w-6 h-6 text-amber-600" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-1">
                             Log Intervention
                        </h3>
                        <p className="text-xs text-gray-500 font-medium">Plan a follow-up action for {studentName}.</p>
                    </div>

                    <button
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="absolute top-4 right-4 p-2 rounded-full text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-all z-20"
                    >
                        <X className="w-5 h-5" />
                    </button>

                    <InputField
                        label="Action Title"
                        id="action-title"
                        placeholder={`e.g. Discuss Newton's 1st Law with ${studentName.split(" ")[0]}`}
                        icon={AlignLeft}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        required
                    />

                    <div className="grid grid-cols-2 gap-4">
                        {/* Type Select */}
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700">Type</label>
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setIsTypeDropdownOpen(!isTypeDropdownOpen)}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl hover:border-gray-300 focus:ring-2 focus:ring-slate-900 outline-none transition-all text-left bg-white text-sm flex items-center justify-between"
                                >
                                    <span className="truncate">{selectedType?.label}</span>
                                    <ChevronDown className="w-4 h-4 text-gray-400" />
                                </button>
                                {isTypeDropdownOpen && (
                                    <>
                                        <div className="fixed inset-0 z-[110]" onClick={() => setIsTypeDropdownOpen(false)} />
                                        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-100 rounded-xl shadow-xl z-[120] py-2 animate-in fade-in zoom-in-95">
                                            {INTERVENTION_TYPES.map((t) => (
                                                <button
                                                    key={t.value}
                                                    type="button"
                                                    onClick={() => { setType(t.value); setIsTypeDropdownOpen(false); }}
                                                    className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 transition-colors flex items-center justify-between"
                                                >
                                                    <span className={cn("font-medium", type === t.value ? "text-slate-950" : "text-gray-500")}>{t.label}</span>
                                                    {type === t.value && <Check className="w-4 h-4 text-slate-950" />}
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Priority Select */}
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700">Priority</label>
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setIsPriorityDropdownOpen(!isPriorityDropdownOpen)}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl hover:border-gray-300 focus:ring-2 focus:ring-slate-900 outline-none transition-all text-left bg-white text-sm flex items-center justify-between"
                                >
                                    <span className={cn("font-bold truncate", selectedPriority?.color.split(" ")[0])}>{selectedPriority?.label}</span>
                                    <ChevronDown className="w-4 h-4 text-gray-400" />
                                </button>
                                {isPriorityDropdownOpen && (
                                    <>
                                        <div className="fixed inset-0 z-[110]" onClick={() => setIsPriorityDropdownOpen(false)} />
                                        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-100 rounded-xl shadow-xl z-[120] py-2 animate-in fade-in zoom-in-95">
                                            {PRIORITIES.map((p) => (
                                                <button
                                                    key={p.value}
                                                    type="button"
                                                    onClick={() => { setPriority(p.value); setIsPriorityDropdownOpen(false); }}
                                                    className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 transition-colors flex items-center justify-between"
                                                >
                                                    <span className={cn("font-bold", p.color)}>{p.label}</span>
                                                    {priority === p.value && <Check className="w-4 h-4 text-slate-950" />}
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    <InputField
                        label="Target Date"
                        id="due-date"
                        type="date"
                        icon={Calendar}
                        value={dueAt}
                        onChange={(e) => setDueAt(e.target.value)}
                    />

                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-[#292929]">
                            Notes
                        </label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={3}
                            placeholder="Specific gap observed or context for follow-up..."
                            className="w-full px-4 py-3 resize-none rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-slate-900 outline-none transition-all placeholder:text-gray-400"
                        />
                    </div>
                </div>

                <div className="px-8 py-5 bg-gray-50/50 border-t border-gray-100 flex items-center justify-end gap-3 font-bold">
                    <button
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="px-4 py-2 text-sm text-gray-400 hover:text-gray-800 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => {
                            void handleSubmit();
                        }}
                        disabled={!title.trim() || isSubmitting}
                        className={cn(
                            "flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-gray-200 icon-white",
                            isSubmitting && "opacity-50 pointer-events-none"
                        )}
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Logging...
                            </>
                        ) : (
                            <>
                                <Check className="w-4 h-4" />
                                Log Intervention
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}


