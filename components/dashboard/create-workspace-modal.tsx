"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, Plus, Building2, Sparkles } from "lucide-react";
import { createWorkspace, setActiveWorkspace } from "@/app/actions/workspace";
import { useRouter } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { InputField } from "@/components/auth/input-field";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import toast from "react-hot-toast";

type CreateWorkspaceModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: (workspaceId: string) => void | Promise<void>;
};

export function CreateWorkspaceModal({ isOpen, onClose, onSuccess }: CreateWorkspaceModalProps) {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [name, setName] = useState("");
    const [slug, setSlug] = useState("");
    const [description, setDescription] = useState("");
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);
    const t = useTranslations("Workspace.Create");

    useEffect(() => {
        setMounted(true);
    }, []);

    const handleCreate = async () => {
        if (!name.trim()) return;

        setIsCreating(true);
        setError(null);

        try {
            const finalSlug = slug.trim() || name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

            const result = await createWorkspace({
                name: name.trim(),
                slug: finalSlug,
            });

            if (result.success) {
                const activationResult = await setActiveWorkspace(result.data.id);
                if (!activationResult.success) {
                    setError(activationResult.error);
                    return;
                }

                await Promise.all([
                   queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all }),
                   queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.active }),
                ]);

                toast.success("Workspace established");
                setName("");
                setSlug("");
                setDescription("");
                await onSuccess?.(result.data.id);
                onClose();
                router.refresh();
                router.push("/dashboard/team");
            } else {
                setError(result.error);
            }
        } catch {
            setError(t("Error"));
        } finally {
            setIsCreating(false);
        }
    };

    if (!isOpen || !mounted) return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-md animate-in fade-in duration-300"
                onClick={onClose}
            />

            <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md mx-4 animate-in fade-in zoom-in-95 duration-300 overflow-hidden border border-gray-100">
                <div className="px-8 py-8 space-y-4">
                    {/* Header */}
                    <div className="text-center mb-6">
                        <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center mx-auto mb-3 border border-gray-100 shadow-sm">
                            <Building2 className="w-6 h-6 text-gray-900" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-1">Create Workspace</h3>
                        <p className="text-xs text-gray-500">Classrooms and units are organized within workspaces.</p>
                    </div>

                    <button
                        onClick={onClose}
                        disabled={isCreating}
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
                        label="Institution Name"
                        id="name"
                        placeholder="e.g. Greenfield Academy"
                        icon={Building2}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                    />

                    <InputField
                        label="Short Code (Optional)"
                        id="slug"
                        placeholder="e.g. greenfield"
                        value={slug}
                        onChange={(e) => setSlug(e.target.value)}
                    />

                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-[#292929]">
                            Description (Optional)
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={3}
                            placeholder="Primary purpose of this institution..."
                            className="w-full resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm focus:ring-2 focus:ring-[#292929] focus:border-transparent outline-none transition-all placeholder:text-gray-400"
                        />
                    </div>

                    <div className="bg-amber-50 rounded-xl p-3 border border-amber-100/50 flex gap-3">
                        <div className="w-5 h-5 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                            <Sparkles className="w-3 h-3 text-amber-600" />
                        </div>
                        <p className="text-[11px] text-amber-800 leading-relaxed font-medium">
                            <span className="font-bold underline decoration-amber-200 decoration-2 underline-offset-2">{t("TipTitle")}</span> {t("TipDesc")}
                        </p>
                    </div>
                </div>

                <div className="px-8 py-4 bg-gray-50/50 border-t border-gray-100 flex items-center justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-800 transition-colors"
                    >
                        {t("Cancel")}
                    </button>
                    <button
                        onClick={handleCreate}
                        disabled={!name.trim() || isCreating}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-xl font-bold text-sm hover:bg-gray-800 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-gray-200 disabled:opacity-50 disabled:hover:scale-100"
                    >
                        {isCreating ? (
                            <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                {t("Creating")}
                            </>
                        ) : (
                            <>
                                <Plus className="w-3.5 h-3.5" />
                                {t("CreateButton")}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}


