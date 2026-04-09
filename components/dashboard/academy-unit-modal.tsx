"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, Plus, Building2, Sparkles, User, Hash, AlignLeft, ChevronDown, Check } from "lucide-react";
import { createDepartment, updateDepartment } from "@/app/actions/workspace";
import { useRouter } from "@/i18n/routing";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import toast from "react-hot-toast";
import { InputField } from "@/components/auth/input-field";
import { cn } from "@/lib/utils";

type Member = {
    userId: string;
    user: {
        name: string;
        email: string;
    };
};

type AcademyUnitModalProps = {
    isOpen: boolean;
    onClose: () => void;
    workspaceId: string;
    members: Member[];
    editingUnit?: {
        id: string;
        name: string;
        code: string;
        description: string;
        headUserId: string;
    } | null;
};

export function AcademyUnitModal({ 
    isOpen, 
    onClose, 
    workspaceId, 
    members, 
    editingUnit 
}: AcademyUnitModalProps) {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [name, setName] = useState("");
    const [code, setCode] = useState("");
    const [description, setDescription] = useState("");
    const [headUserId, setHeadUserId] = useState("");
    const [isHeadDropdownOpen, setIsHeadDropdownOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (editingUnit) {
            setName(editingUnit.name);
            setCode(editingUnit.code);
            setDescription(editingUnit.description);
            setHeadUserId(editingUnit.headUserId);
        } else {
            setName("");
            setCode("");
            setDescription("");
            setHeadUserId("");
        }
    }, [editingUnit, isOpen]);

    const handleSubmit = async () => {
        if (!name.trim()) return;

        setIsSubmitting(true);
        setError(null);

        try {
            const result = editingUnit
                ? await updateDepartment({
                    departmentId: editingUnit.id,
                    name: name.trim(),
                    code: code.trim() || undefined,
                    description: description.trim() || undefined,
                    headUserId: headUserId || null,
                  })
                : await createDepartment({
                    organizationId: workspaceId,
                    name: name.trim(),
                    code: code.trim() || undefined,
                    description: description.trim() || undefined,
                    headUserId: headUserId || null,
                  });

            if (result.success) {
                toast.success(editingUnit ? "Academy unit updated" : "Academy unit registered");
                await queryClient.invalidateQueries({
                    queryKey: queryKeys.workspaces.departments(workspaceId),
                });
                onClose();
            } else {
                setError(result.error);
            }
        } catch {
            setError("Failed to save academy unit");
        } finally {
            setIsSubmitting(false);
        }
    };

    const selectedHead = members.find(m => m.userId === headUserId);

    if (!isOpen || !mounted) return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-md animate-in fade-in duration-300"
                onClick={() => !isSubmitting && onClose()}
            />

            <div className="relative bg-white rounded-3xl w-full max-w-md mx-4 animate-in fade-in zoom-in-95 duration-300 overflow-hidden border border-gray-100">
                <div className="px-8 pt-8 pb-4 space-y-4 overflow-y-auto max-h-[80vh]">
                    {/* Header */}
                    <div className="text-center mb-4">
                        <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center mx-auto mb-3 border border-gray-100 shadow-sm">
                            <Building2 className="w-6 h-6 text-gray-900" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-1">
                             {editingUnit ? "Modify Academy Unit" : "Register Academy Unit"}
                        </h3>
                        <p className="text-xs text-gray-500">Organize your institution into administrative groups.</p>
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
                        label="Unit Name"
                        id="unit-name"
                        placeholder="e.g. Science Department"
                        icon={Building2}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                    />

                    <div className="grid grid-cols-2 gap-4">
                        <InputField
                            label="Short Code"
                            id="unit-code"
                            placeholder="e.g. SCI"
                            icon={Hash}
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                        />
                        
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-[#292929]">
                                Head of Unit
                            </label>
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setIsHeadDropdownOpen(!isHeadDropdownOpen)}
                                    className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl hover:border-gray-300 focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all text-left bg-white text-sm flex items-center justify-between"
                                >
                                    <div className="flex items-center gap-2 truncate">
                                        <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#696969] w-4 h-4" />
                                        <span className={cn(headUserId ? "text-gray-900" : "text-gray-400")}>
                                            {selectedHead ? selectedHead.user.name : "Unassigned"}
                                        </span>
                                    </div>
                                    <ChevronDown className={cn("w-4 h-4 text-gray-400 transition-transform", isHeadDropdownOpen && "rotate-180")} />
                                </button>

                                {isHeadDropdownOpen && (
                                    <>
                                        <div className="fixed inset-0 z-[110]" onClick={() => setIsHeadDropdownOpen(false)} />
                                        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-100 rounded-xl shadow-xl z-[120] py-2 max-h-[200px] overflow-y-auto animate-in fade-in zoom-in-95">
                                            <button
                                                type="button"
                                                onClick={() => { setHeadUserId(""); setIsHeadDropdownOpen(false); }}
                                                className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 transition-colors flex items-center justify-between"
                                            >
                                                <span className="text-gray-500">Unassigned</span>
                                                {!headUserId && <Check className="w-4 h-4 text-gray-900" />}
                                            </button>
                                            <div className="h-px bg-gray-50 my-1" />
                                            {members.map((member) => (
                                                <button
                                                    key={member.userId}
                                                    type="button"
                                                    onClick={() => {
                                                        setHeadUserId(member.userId);
                                                        setIsHeadDropdownOpen(false);
                                                    }}
                                                    className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 transition-colors flex items-center justify-between"
                                                >
                                                    <div className="flex flex-col">
                                                        <span className="font-medium text-gray-900">{member.user.name}</span>
                                                        <span className="text-xs text-gray-500">{member.user.email}</span>
                                                    </div>
                                                    {headUserId === member.userId && <Check className="w-4 h-4 text-gray-900" />}
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-[#292929]">
                            Description (Optional)
                        </label>
                        <div className="relative">
                            <AlignLeft className="absolute left-3 top-3 text-[#696969] w-4 h-4" />
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={3}
                                placeholder="Purpose and scope of this unit..."
                                className="w-full pl-9 pr-4 py-3 resize-none rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-[#292929] focus:border-transparent outline-none transition-all placeholder:text-gray-400"
                            />
                        </div>
                    </div>

                    <div className="bg-sky-50 rounded-xl p-3 border border-sky-100/50 flex gap-3">
                        <div className="w-5 h-5 rounded-lg bg-sky-100 flex items-center justify-center flex-shrink-0">
                            <Sparkles className="w-3 h-3 text-sky-600" />
                        </div>
                        <p className="text-[11px] text-sky-800 leading-relaxed font-medium">
                            Units help organize surveys and teachers by administrative boundaries.
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
                        disabled={!name.trim() || isSubmitting}
                        className={cn(
                            "flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-xl font-bold text-sm hover:bg-gray-800 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-gray-200",
                            isSubmitting && "opacity-50 pointer-events-none"
                        )}
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            <>
                                {editingUnit ? <AlignLeft className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                                {editingUnit ? "Update Unit" : "Register Unit"}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
