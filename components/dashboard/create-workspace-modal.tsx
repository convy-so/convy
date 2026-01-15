"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, Plus, Building2 } from "lucide-react";
// import { createWorkspace } from "@/app/actions/workspace";
import { useRouter } from "next/navigation";

type CreateWorkspaceModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: () => void;
};

export function CreateWorkspaceModal({ isOpen, onClose, onSuccess }: CreateWorkspaceModalProps) {
    const router = useRouter();
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const handleCreate = async () => {
        if (!name.trim()) return;

        setIsCreating(true);
        setError(null);

        // Mock creation simulation
        setTimeout(() => {
            setIsCreating(false);
            setName("");
            setDescription("");
            onSuccess?.();
            onClose();
            router.refresh();
        }, 1500);
    };

    if (!isOpen || !mounted) return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />

            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-in fade-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                            <Building2 className="w-5 h-5 text-white" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900">Create Workspace</h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="px-6 py-5 space-y-4">
                    {error && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                            {error}
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Workspace Name *
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g., Marketing Team"
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Description (optional)
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="What is this workspace for?"
                            rows={3}
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all resize-none"
                        />
                    </div>

                    <div className="bg-blue-50 rounded-xl p-4">
                        <p className="text-sm text-blue-700">
                            <span className="font-medium">Tip:</span> Workspaces help you organize surveys and collaborate with your team. You can invite members after creation.
                        </p>
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleCreate}
                        disabled={!name.trim() || isCreating}
                        className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-lg font-medium text-sm hover:bg-gray-800 transition-colors disabled:opacity-50"
                    >
                        {isCreating ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Creating...
                            </>
                        ) : (
                            <>
                                <Plus className="w-4 h-4" />
                                Create Workspace
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
