"use client";

import { useState } from "react";
import Image from "next/image";
import {
    UserPlus,
    Mail,
    Crown,
    MoreVertical,
    Trash2,
    User,
    X,
    Loader2,
    ChevronDown,
    Check,
    Shield,
    Eye,
} from "lucide-react";
import { inviteToWorkspace, removeWorkspaceMember } from "@/app/actions/workspace";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface TeamMember {
    id: string;
    userId: string;
    role: "owner" | "admin" | "teacher" | "staff_viewer";
    user: {
        id: string;
        name: string;
        email: string;
        image?: string | null;
    };
}

interface PendingInvite {
    id: string;
    email: string;
    role: string;
    status: "pending" | "expired";
    createdAt: string;
}

interface TeamMemberListProps {
    members: TeamMember[];
    pendingInvites?: PendingInvite[];
    currentUserId: string;
    canManageMembers: boolean;
    workspaceId: string;
    workspaceType: "collaborative" | "institutional";
    onMemberRemoved?: (memberId: string) => void;
    onInviteSent?: () => void;
}

export function TeamMemberList({
    members,
    pendingInvites = [],
    currentUserId,
    canManageMembers,
    workspaceId,
    workspaceType,
    onMemberRemoved,
    onInviteSent,
}: TeamMemberListProps) {
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteRole, setInviteRole] = useState<"admin" | "teacher" | "staff_viewer">("teacher");
    const [isRoleOpen, setIsRoleOpen] = useState(false);
    const [isInviting, setIsInviting] = useState(false);
    const [inviteError, setInviteError] = useState<string | null>(null);
    const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
    const [showMenuFor, setShowMenuFor] = useState<string | null>(null);
    const t = useTranslations("TeamPage");
    const mlT = useTranslations("TeamPage.MemberList");

    const inviteRoles = workspaceType === "institutional"
        ? [
            {
                id: "teacher" as const,
                label: "Teacher",
                description: "Creates classes, surveys, materials, and folders",
                icon: User,
            },
            {
                id: "admin" as const,
                label: "Admin",
                description: "Manages members, settings, and departments",
                icon: Shield,
            },
            {
                id: "staff_viewer" as const,
                label: "Staff Viewer",
                description: "Sees workspace structure and class metadata only",
                icon: Eye,
            },
        ]
        : [
            {
                id: "teacher" as const,
                label: "Teacher",
                description: "Creates and collaborates on teaching content",
                icon: User,
            },
            {
                id: "admin" as const,
                label: "Admin",
                description: "Manages members and workspace settings",
                icon: Shield,
            },
        ];

    const selectedInviteRole = inviteRoles.find((role) => role.id === inviteRole) ?? inviteRoles[0];

    const handleInvite = async () => {
        if (!inviteEmail.trim()) return;

        setIsInviting(true);
        setInviteError(null);

        try {
            const result = await inviteToWorkspace({
                email: inviteEmail,
                role: inviteRole,
                organizationId: workspaceId,
            });

            if (result.success) {
                setShowInviteModal(false);
                setInviteEmail("");
                setInviteRole("teacher");
                toast.success(t("Toasts.InvitationSent"));
                onInviteSent?.();
            } else {
                setInviteError(result.error);
                toast.error(result.error);
            }
        } finally {
            setIsInviting(false);
        }
    };

    const handleRemoveMember = async (memberIdOrEmail: string) => {
        setRemovingMemberId(memberIdOrEmail);
        try {
            const result = await removeWorkspaceMember({
                memberIdOrEmail,
                organizationId: workspaceId,
            });

            if (result.success) {
                toast.success(t("Toasts.MemberRemoved"));
                onMemberRemoved?.(memberIdOrEmail);
            } else {
                toast.error(result.error);
            }
        } catch {
            toast.error(t("Toasts.RemoveFailed"));
        } finally {
            setRemovingMemberId(null);
            setShowMenuFor(null);
        }
    };

    return (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-bold text-slate-950">{mlT("Header")}</h3>
                    <p className="text-sm text-slate-500 mt-1">
                        {mlT("Count", { count: members.length })} members recorded
                        {pendingInvites.length > 0 && (
                            <span> · {mlT("PendingCount", { count: pendingInvites.length })} pending</span>
                        )}
                    </p>
                </div>
                {canManageMembers && (
                    <button
                        onClick={() => setShowInviteModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-950 text-white rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-slate-900 transition-colors"
                    >
                        <UserPlus className="w-4 h-4" />
                        {mlT("InviteButton")}
                    </button>
                )}
            </div>

            <div className="bg-slate-50/30">
                {members.map((member) => {
                    const isCurrentUser = member.userId === currentUserId;
                    const canRemove = canManageMembers && !isCurrentUser && member.role !== "owner";

                    return (
                        <div
                            key={member.id}
                            className="px-6 py-4 flex items-center justify-between border-b border-slate-50/50 last:border-0 hover:bg-white transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <div className="relative">
                                    {member.user.image ? (
                                        <Image
                                            src={member.user.image}
                                            alt={member.user.name}
                                            width={44}
                                            height={44}
                                            unoptimized
                                            className="w-11 h-11 rounded-full object-cover ring-2 ring-slate-50"
                                        />
                                    ) : (
                                        <div className="w-11 h-11 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-sm">
                                            {member.user.name?.charAt(0)?.toUpperCase() || "U"}
                                        </div>
                                    )}
                                    {member.role === "owner" && (
                                        <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-amber-400 rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                                            <Crown className="w-2.5 h-2.5 text-white" />
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <div className="flex items-center gap-2">
                                        <p className="text-sm font-bold text-slate-950">
                                            {member.user.name}
                                        </p>
                                        {isCurrentUser && (
                                            <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">{mlT("You")}</span>
                                        )}
                                    </div>
                                    <p className="text-[13px] text-slate-500 font-medium">{member.user.email}</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <span className={cn(
                                    "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                                    member.role === "owner"
                                        ? "bg-amber-50 text-amber-700 border border-amber-100"
                                        : member.role === "admin"
                                            ? "bg-sky-50 text-sky-700 border border-sky-100"
                                            : member.role === "staff_viewer"
                                                ? "bg-violet-50 text-violet-700 border border-violet-100"
                                                : "bg-slate-50 text-slate-500 border border-slate-100"
                                )}>
                                    {member.role.replace("_", " ")}
                                </span>

                                {canRemove && (
                                    <div className="relative">
                                        <button
                                            onClick={() => setShowMenuFor(showMenuFor === member.id ? null : member.id)}
                                            className="p-2 rounded-xl text-slate-400 hover:text-slate-900 border border-transparent hover:border-slate-100 hover:bg-white transition"
                                        >
                                            <MoreVertical className="w-4 h-4" />
                                        </button>

                                        {showMenuFor === member.id && (
                                            <>
                                                <div
                                                    className="fixed inset-0 z-40"
                                                    onClick={() => setShowMenuFor(null)}
                                                />
                                                <div className="absolute right-0 top-full mt-2 w-44 bg-white rounded-2xl border border-slate-100 shadow-xl z-50 py-1.5 p-1 animate-in fade-in slide-in-from-top-1 duration-200">
                                                    <button
                                                        onClick={() => handleRemoveMember(member.userId)}
                                                        disabled={removingMemberId === member.userId}
                                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 rounded-xl transition disabled:opacity-50"
                                                    >
                                                        {removingMemberId === member.userId ? (
                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                        ) : (
                                                            <Trash2 className="w-4 h-4" />
                                                        )}
                                                        {mlT("Menu.Remove")}
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}

                {pendingInvites.map((invite) => (
                    <div
                        key={invite.id}
                        className="px-6 py-4 flex items-center justify-between border-b border-slate-50/50 last:border-0 bg-slate-50/30"
                    >
                        <div className="flex items-center gap-3 opacity-60">
                            <div className="w-11 h-11 rounded-full bg-slate-100 flex items-center justify-center border border-dashed border-slate-300">
                                <Mail className="w-4 h-4 text-slate-400" />
                            </div>

                            <div>
                                <p className="text-sm font-bold text-slate-700">{invite.email}</p>
                                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">{mlT("Pending.Status")}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-sky-50 text-sky-700 border border-sky-100">
                                {invite.role.replace("_", " ")}
                            </span>
                            {canManageMembers && (
                                <button
                                    onClick={() => handleRemoveMember(invite.email)}
                                    disabled={removingMemberId === invite.email}
                                    className="p-2 rounded-xl text-slate-400 hover:text-rose-600 border border-transparent hover:border-rose-100 hover:bg-rose-50 transition"
                                >
                                    {removingMemberId === invite.email ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <X className="w-4 h-4" />
                                    )}
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {members.length === 0 && pendingInvites.length === 0 && (
                <div className="px-6 py-16 text-center bg-slate-50/20">
                    <div className="w-16 h-16 rounded-full bg-white border border-slate-100 flex items-center justify-center mx-auto mb-5">
                        <User className="w-8 h-8 text-slate-200" />
                    </div>
                    <h4 className="text-lg font-bold text-slate-950 mb-1">{mlT("Empty.Title")}</h4>
                    <p className="text-sm text-slate-500 mb-6 max-w-xs mx-auto">
                        {mlT("Empty.Description")}
                    </p>
                    {canManageMembers && (
                        <button
                            onClick={() => setShowInviteModal(true)}
                            className="inline-flex items-center gap-2 px-6 py-3 bg-slate-950 text-white rounded-2xl font-bold text-sm hover:bg-slate-900 transition-colors"
                        >
                            <UserPlus className="w-4 h-4" />
                            {mlT("Button")}
                        </button>
                    )}
                </div>
            )}

            {showInviteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-slate-950/20 backdrop-blur-sm"
                        onClick={() => setShowInviteModal(false)}
                    />

                    <div className="relative bg-white rounded-3xl w-full max-w-md animate-in fade-in zoom-in-95 duration-200 overflow-hidden shadow-2xl">
                        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="text-xl font-bold text-slate-950">{mlT("InviteModal.Title")}</h3>
                            <button
                                onClick={() => setShowInviteModal(false)}
                                className="p-2 rounded-xl text-slate-400 hover:text-slate-900 hover:bg-slate-50 transition"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="px-8 py-8 space-y-6">
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-3 ml-1">
                                    Recipient Email
                                </label>
                                <div className="relative">
                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
                                    <input
                                        type="email"
                                        value={inviteEmail}
                                        onChange={(e) => setInviteEmail(e.target.value)}
                                        placeholder="teacher@academy.edu"
                                        className="w-full pl-12 pr-4 py-4 border border-slate-200 rounded-2xl focus:border-slate-950 outline-none transition-all placeholder:text-slate-300"
                                    />
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 ml-1">
                                    Invite Role
                                </label>
                                <div className="relative">
                                    <button
                                        onClick={() => setIsRoleOpen((open) => !open)}
                                        className="w-full flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left"
                                    >
                                        <div>
                                            <div className="text-sm font-semibold text-slate-950">{selectedInviteRole.label}</div>
                                            <div className="text-xs text-slate-500 mt-1">{selectedInviteRole.description}</div>
                                        </div>
                                        <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", isRoleOpen && "rotate-180")} />
                                    </button>

                                    {isRoleOpen && (
                                        <>
                                            <div className="fixed inset-0 z-40" onClick={() => setIsRoleOpen(false)} />
                                            <div className="absolute inset-x-0 top-full mt-2 z-50 rounded-2xl border border-slate-100 bg-white p-2 shadow-xl">
                                                {inviteRoles.map((role) => (
                                                    <button
                                                        key={role.id}
                                                        onClick={() => {
                                                            setInviteRole(role.id);
                                                            setIsRoleOpen(false);
                                                        }}
                                                        className="flex w-full items-start justify-between rounded-xl px-3 py-3 text-left hover:bg-slate-50 transition"
                                                    >
                                                        <div className="pr-4">
                                                            <div className="text-sm font-semibold text-slate-950">{role.label}</div>
                                                            <div className="text-xs text-slate-500 mt-1">{role.description}</div>
                                                        </div>
                                                        {inviteRole === role.id ? <Check className="w-4 h-4 text-slate-900 mt-0.5 shrink-0" /> : null}
                                                    </button>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>

                            {inviteError && (
                                <div className="p-4 rounded-2xl bg-rose-50 border border-rose-100">
                                    <p className="text-xs font-bold text-rose-600">{inviteError}</p>
                                </div>
                            )}
                        </div>

                        <div className="px-8 py-6 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50/30">
                            <button
                                onClick={() => setShowInviteModal(false)}
                                className="px-5 py-3 text-sm font-bold text-slate-500 hover:text-slate-950 transition"
                            >
                                {mlT("InviteModal.Cancel")}
                            </button>
                            <button
                                onClick={handleInvite}
                                disabled={!inviteEmail.trim() || isInviting}
                                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-slate-950 text-white rounded-2xl font-bold text-sm hover:bg-slate-900 transition-colors disabled:opacity-50"
                            >
                                {isInviting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        {mlT("InviteModal.Submitting")}
                                    </>
                                ) : (
                                    <>
                                        <Mail className="w-4 h-4" />
                                        {mlT("InviteModal.Submit")}
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
