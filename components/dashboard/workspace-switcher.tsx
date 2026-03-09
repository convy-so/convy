"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Plus, Building2, User, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { setActiveWorkspace } from "@/app/actions/workspace";
import { fetchWorkspaces, fetchActiveWorkspace } from "@/lib/api/workspace";
import { queryKeys } from "@/lib/query-keys";
import { CreateWorkspaceModal } from "./create-workspace-modal";
import { useTranslations } from "next-intl";

type Workspace = {
    id: string;
    name: string;
    slug: string;
    role: string;
    logo?: string | null;
};

export function WorkspaceSwitcher() {
    const [isOpen, setIsOpen] = useState(false);
    const [isSwitching, setIsSwitching] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const t = useTranslations("Workspace.Switcher");

    // Fetch workspaces using React Query
    const { data: workspaces = [], isLoading: isLoadingWorkspaces } = useQuery({
        queryKey: queryKeys.workspaces.all,
        queryFn: fetchWorkspaces,
    });

    // Fetch active workspace using React Query
    const { data: activeWorkspace = null, isLoading: isLoadingActive } = useQuery({
        queryKey: queryKeys.workspaces.active,
        queryFn: fetchActiveWorkspace,
    });

    const isLoading = isLoadingWorkspaces || isLoadingActive;

    const handleSwitchWorkspace = async (workspace: Workspace | null) => {
        setIsSwitching(true);
        try {
            const result = await setActiveWorkspace(workspace?.id || null);
            if (result.success) {
                // Refresh the page to update content
                window.location.reload();
            }
        } catch (error) {
            console.error("Failed to switch workspace:", error);
        } finally {
            setIsSwitching(false);
            setIsOpen(false);
        }
    };

    if (isLoading) {
        return (
            <div className="px-4 py-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gray-100 animate-pulse" />
                <div className="flex-1">
                    <div className="h-4 w-24 bg-gray-100 rounded animate-pulse" />
                </div>
            </div>
        );
    }

    return (
        <div className="relative px-4 py-3 border-b border-gray-100">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-all duration-200"
                disabled={isSwitching}
            >
                {/* Avatar */}
                <div className={cn(
                    "w-9 h-9 rounded-lg flex items-center justify-center font-semibold text-sm",
                    activeWorkspace
                        ? "bg-gradient-to-br from-blue-500 to-purple-600 text-white"
                        : "bg-gradient-to-br from-gray-700 to-gray-900 text-white"
                )}>
                    {activeWorkspace ? (
                        activeWorkspace.logo ? (
                            <img src={activeWorkspace.logo} alt="" className="w-full h-full rounded-lg object-cover" />
                        ) : (
                            <Building2 className="w-4 h-4" />
                        )
                    ) : (
                        <User className="w-4 h-4" />
                    )}
                </div>

                {/* Name & Role */}
                <div className="flex-1 text-left min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                        {activeWorkspace?.name || t("PersonalAccount")}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                        {activeWorkspace ? <>{t(`Roles.${activeWorkspace.role === 'owner' ? 'Owner' : 'Member'}`)} • {t("Workspace")}</> : t("Individual")}
                    </p>
                </div>

                {/* Chevron */}
                {isSwitching ? (
                    <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                ) : (
                    <ChevronDown className={cn(
                        "w-4 h-4 text-gray-400 transition-transform duration-200",
                        isOpen && "rotate-180"
                    )} />
                )}
            </button>

            {/* Dropdown */}
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsOpen(false)}
                    />

                    {/* Menu */}
                    <div className="absolute left-4 right-4 top-full mt-1 bg-white rounded-xl border border-gray-200 shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                        {/* Personal Account */}
                        <button
                            onClick={() => handleSwitchWorkspace(null)}
                            className={cn(
                                "w-full flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors",
                                !activeWorkspace && "bg-gray-50"
                            )}
                        >
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-gray-700 to-gray-900 text-white flex items-center justify-center">
                                <User className="w-4 h-4" />
                            </div>
                            <div className="flex-1 text-left">
                                <p className="text-sm font-medium text-gray-900">{t("PersonalAccount")}</p>
                                <p className="text-xs text-gray-500">{t("PersonalDesc")}</p>
                            </div>
                            {!activeWorkspace && (
                                <Check className="w-4 h-4 text-green-500" />
                            )}
                        </button>

                        {/* Divider */}
                        {workspaces.length > 0 && (
                            <div className="border-t border-gray-100 my-1" />
                        )}

                        {/* Workspaces */}
                        <div className="max-h-48 overflow-y-auto">
                            {workspaces.map((workspace) => (
                                <button
                                    key={workspace.id}
                                    onClick={() => handleSwitchWorkspace(workspace)}
                                    className={cn(
                                        "w-full flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors",
                                        activeWorkspace?.id === workspace.id && "bg-gray-50"
                                    )}
                                >
                                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 text-white flex items-center justify-center">
                                        {workspace.logo ? (
                                            <img src={workspace.logo} alt="" className="w-full h-full rounded-lg object-cover" />
                                        ) : (
                                            <Building2 className="w-4 h-4" />
                                        )}
                                    </div>
                                    <div className="flex-1 text-left min-w-0">
                                        <p className="text-sm font-medium text-gray-900 truncate">{workspace.name}</p>
                                        <p className="text-xs text-gray-500 capitalize">{t(`Roles.${workspace.role === 'owner' ? 'Owner' : 'Member'}`)}</p>
                                    </div>
                                    {activeWorkspace?.id === workspace.id && (
                                        <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                                    )}
                                </button>
                            ))}
                        </div>

                        {/* Create Workspace */}
                        <div className="border-t border-gray-100">
                            <button
                                onClick={() => {
                                    setIsOpen(false);
                                    setShowCreateModal(true);
                                }}
                                className="w-full flex items-center gap-3 p-3 text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                            >
                                <div className="w-8 h-8 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center">
                                    <Plus className="w-4 h-4" />
                                </div>
                                <span className="text-sm font-medium">{t("CreateWorkspace")}</span>
                            </button>
                        </div>
                    </div>
                </>
            )}

            {/* Create Workspace Modal */}
            <CreateWorkspaceModal
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                onSuccess={() => {
                    // Reload the page to refresh the workspace list
                    window.location.reload();
                }}
            />
        </div>
    );
}
