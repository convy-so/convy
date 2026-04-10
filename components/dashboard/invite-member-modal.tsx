"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
    X,
    Loader2,
    UserPlus,
    Mail,
    ChevronDown,
    Check,
    User,
    Shield,
    Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { inviteToWorkspace } from "@/app/actions/workspace";
import { useRouter } from "@/i18n/routing";

type InviteMemberModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: () => void;
    organizationId?: string;
    workspaceType?: "collaborative" | "institutional";
};

export function InviteMemberModal({
    isOpen,
    onClose,
    onSuccess,
    organizationId,
    workspaceType = "collaborative",
}: InviteMemberModalProps) {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [role, setRole] = useState<"admin" | "teacher" | "staff_viewer">("teacher");
    const [isInviting, setIsInviting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);
    const [isRoleOpen, setIsRoleOpen] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const roles = workspaceType === "institutional"
        ? [
            { id: "teacher" as const, label: "Teacher", description: "Creates classes, surveys, materials, and folders", icon: User },
            { id: "admin" as const, label: "Admin", description: "Manages workspace membership and settings", icon: Shield },
            { id: "staff_viewer" as const, label: "Staff Viewer", description: "Views structure and class metadata only", icon: Eye },
        ]
        : [
            { id: "teacher" as const, label: "Teacher", description: "Creates and collaborates on teaching content", icon: User },
            { id: "admin" as const, label: "Admin", description: "Manages members and workspace settings", icon: Shield },
        ];

    const selectedRole = roles.find((item) => item.id === role) ?? roles[0];

    const handleInvite = async () => {
        if (!email.trim()) return;

        setIsInviting(true);
        setError(null);

        try {
            const result = await inviteToWorkspace({
                email,
                role,
                organizationId,
            });

            if (result.success) {
                setEmail("");
                setRole("teacher");
                setIsRoleOpen(false);
                onSuccess?.();
                onClose();
                router.refresh();
            } else {
                setError(result.error);
            }
        } catch {
            setError("An unexpected error occurred");
        } finally {
            setIsInviting(false);
        }
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
                        <div className="w-10 h-10 rounded-xl bg-gray-900 flex items-center justify-center">
                            <UserPlus className="w-5 h-5 text-white" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900">Invite Team Member</h3>
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
                            Email Address
                        </label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="colleague@school.edu"
                                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Role
                        </label>
                        <div className="relative">
                            <button
                                onClick={() => setIsRoleOpen(!isRoleOpen)}
                                className="w-full flex items-center justify-between px-4 py-3 border border-gray-200 rounded-xl hover:border-gray-300 transition-all text-left group bg-white focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-gray-100 rounded-lg group-hover:bg-gray-200 transition-colors">
                                        <selectedRole.icon className="w-4 h-4 text-gray-600" />
                                    </div>
                                    <div>
                                        <div className="font-medium text-gray-900">{selectedRole.label}</div>
                                        <div className="text-xs text-gray-500">{selectedRole.description}</div>
                                    </div>
                                </div>
                                <ChevronDown className={cn("w-4 h-4 text-gray-400 transition-transform", isRoleOpen && "rotate-180")} />
                            </button>

                            {isRoleOpen && (
                                <>
                                    <div className="fixed inset-0 z-10" onClick={() => setIsRoleOpen(false)} />
                                    <div className="absolute top-full mt-2 w-full bg-white border border-gray-100 rounded-xl shadow-xl z-20 overflow-hidden animate-in fade-in zoom-in-95">
                                        {roles.map((entry) => (
                                            <button
                                                key={entry.id}
                                                onClick={() => {
                                                    setRole(entry.id);
                                                    setIsRoleOpen(false);
                                                }}
                                                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                                            >
                                                <div className="p-2 rounded-lg bg-gray-900 text-white">
                                                    <entry.icon className="w-4 h-4" />
                                                </div>
                                                <div className="flex-1">
                                                    <div className="font-medium text-gray-900">
                                                        {entry.label}
                                                    </div>
                                                    <div className="text-xs text-gray-500">{entry.description}</div>
                                                </div>
                                                {role === entry.id ? <Check className="w-4 h-4 text-gray-900" /> : null}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="bg-gray-50 rounded-xl p-4">
                        <p className="text-sm text-gray-600">
                            Invited teammates join the shared workspace, but classes and surveys still require explicit collaboration access.
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
                        onClick={handleInvite}
                        disabled={!email.trim() || isInviting}
                        className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-lg font-medium text-sm hover:bg-gray-800 transition-colors disabled:opacity-50"
                    >
                        {isInviting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Sending Invite...
                            </>
                        ) : (
                            <>
                                <UserPlus className="w-4 h-4" />
                                Send Invite
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
