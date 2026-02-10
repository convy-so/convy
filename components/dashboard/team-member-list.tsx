"use client";

import { useState } from "react";
import {
    UserPlus,
    Mail,
    Crown,
    Shield,
    MoreVertical,
    Trash2,
    User,
    X,
    Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { inviteToWorkspace, removeWorkspaceMember } from "@/app/actions/workspace";
import toast from "react-hot-toast";

interface TeamMember {
    id: string;
    userId: string;
    role: "owner" | "member";
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
    isOwner: boolean;
    workspaceId: string;
    onMemberRemoved?: (memberId: string) => void;
    onInviteSent?: () => void;
}

export function TeamMemberList({
    members,
    pendingInvites = [],
    currentUserId,
    isOwner,
    workspaceId,
    onMemberRemoved,
    onInviteSent,
}: TeamMemberListProps) {
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteRole, setInviteRole] = useState<"owner" | "member">("member");
    const [isInviting, setIsInviting] = useState(false);
    const [inviteError, setInviteError] = useState<string | null>(null);
    const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
    const [showMenuFor, setShowMenuFor] = useState<string | null>(null);

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
                setInviteRole("member");
                toast.success("Invitation sent successfully");
                onInviteSent?.();
            } else {
                setInviteError(result.error);
                toast.error(result.error || "Failed to send invitation");
            }
        } catch (error) {
            setInviteError("Failed to send invitation");
            toast.error("An unexpected error occurred");
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
                toast.success("Member removed successfully");
                onMemberRemoved?.(memberIdOrEmail);
            } else {
                toast.error(result.error || "Failed to remove member");
            }
        } catch (error) {
            console.error("Failed to remove member:", error);
            toast.error("An unexpected error occurred");
        } finally {
            setRemovingMemberId(null);
            setShowMenuFor(null);
        }
    };

    return (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                    <h3 className="text-base font-semibold text-gray-900">Team Members</h3>
                    <p className="text-sm text-gray-500 mt-0.5">
                        {members.length} member{members.length !== 1 ? "s" : ""}
                        {pendingInvites.length > 0 && ` • ${pendingInvites.length} pending`}
                    </p>
                </div>
                {isOwner && (
                    <button
                        onClick={() => setShowInviteModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg font-medium text-sm hover:bg-gray-800 transition-colors"
                    >
                        <UserPlus className="w-4 h-4" />
                        Invite
                    </button>
                )}
            </div>

            {/* Members List */}
            <div className="divide-y divide-gray-50">
                {members.map((member) => {
                    const isCurrentUser = member.userId === currentUserId;
                    const canRemove = isOwner && !isCurrentUser && member.role !== "owner";

                    return (
                        <div
                            key={member.id}
                            className="px-6 py-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                {/* Avatar */}
                                <div className="relative">
                                    {member.user.image ? (
                                        <img
                                            src={member.user.image}
                                            alt={member.user.name}
                                            className="w-10 h-10 rounded-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center text-white font-semibold text-sm">
                                            {member.user.name?.charAt(0)?.toUpperCase() || "U"}
                                        </div>
                                    )}
                                    {member.role === "owner" && (
                                        <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-amber-400 rounded-full flex items-center justify-center border-2 border-white">
                                            <Crown className="w-2.5 h-2.5 text-white" />
                                        </div>
                                    )}
                                </div>

                                {/* Info */}
                                <div>
                                    <div className="flex items-center gap-2">
                                        <p className="text-sm font-semibold text-gray-900">
                                            {member.user.name}
                                        </p>
                                        {isCurrentUser && (
                                            <span className="text-xs text-gray-400">(you)</span>
                                        )}
                                    </div>
                                    <p className="text-sm text-gray-500">{member.user.email}</p>
                                </div>
                            </div>

                            {/* Role & Actions */}
                            <div className="flex items-center gap-3">
                                <span className={cn(
                                    "px-2.5 py-1 rounded-full text-xs font-medium capitalize",
                                    member.role === "owner"
                                        ? "bg-amber-50 text-amber-700 border border-amber-200"
                                        : "bg-gray-50 text-gray-600 border border-gray-200"
                                )}>
                                    {member.role}
                                </span>

                                {canRemove && (
                                    <div className="relative">
                                        <button
                                            onClick={() => setShowMenuFor(showMenuFor === member.id ? null : member.id)}
                                            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                                        >
                                            <MoreVertical className="w-4 h-4" />
                                        </button>

                                        {showMenuFor === member.id && (
                                            <>
                                                <div
                                                    className="fixed inset-0 z-40"
                                                    onClick={() => setShowMenuFor(null)}
                                                />
                                                <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-xl border border-gray-200 shadow-xl z-50 py-1">
                                                    <button
                                                        onClick={() => handleRemoveMember(member.userId)}
                                                        disabled={removingMemberId === member.userId}
                                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                                                    >
                                                        {removingMemberId === member.userId ? (
                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                        ) : (
                                                            <Trash2 className="w-4 h-4" />
                                                        )}
                                                        Remove
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

                {/* Pending Invites */}
                {pendingInvites.map((invite) => (
                    <div
                        key={invite.id}
                        className="px-6 py-4 flex items-center justify-between bg-gray-50/50"
                    >
                        <div className="flex items-center gap-3">
                            {/* Pending Avatar */}
                            <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center border-2 border-dashed border-gray-300">
                                <Mail className="w-4 h-4 text-gray-400" />
                            </div>

                            {/* Info */}
                            <div>
                                <p className="text-sm font-medium text-gray-700">{invite.email}</p>
                                <p className="text-xs text-gray-400">Invitation pending</p>
                            </div>
                        </div>

                        {/* Status */}
                        <div className="flex items-center gap-2">
                            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-600 border border-blue-200">
                                Pending
                            </span>
                            {isOwner && (
                                <button
                                    onClick={() => handleRemoveMember(invite.email)}
                                    disabled={removingMemberId === invite.email}
                                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
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

            {/* Empty State */}
            {members.length === 0 && pendingInvites.length === 0 && (
                <div className="px-6 py-12 text-center">
                    <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-4">
                        <User className="w-8 h-8 text-gray-400" />
                    </div>
                    <h4 className="text-base font-semibold text-gray-900 mb-1">No team members yet</h4>
                    <p className="text-sm text-gray-500 mb-4">
                        Invite colleagues to collaborate on surveys together
                    </p>
                    {isOwner && (
                        <button
                            onClick={() => setShowInviteModal(true)}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg font-medium text-sm hover:bg-gray-800 transition-colors"
                        >
                            <UserPlus className="w-4 h-4" />
                            Invite Team Members
                        </button>
                    )}
                </div>
            )}

            {/* Invite Modal */}
            {showInviteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={() => setShowInviteModal(false)}
                    />

                    {/* Modal */}
                    <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-in fade-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-gray-900">Invite Team Member</h3>
                            <button
                                onClick={() => setShowInviteModal(false)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="px-6 py-5 space-y-5">
                            {/* Email Input */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Email Address
                                </label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                    <input
                                        type="email"
                                        value={inviteEmail}
                                        onChange={(e) => setInviteEmail(e.target.value)}
                                        placeholder="colleague@company.com"
                                        className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all"
                                    />
                                </div>
                            </div>

                            {/* Role Selection */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Role
                                </label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        onClick={() => setInviteRole("member")}
                                        className={cn(
                                            "p-4 rounded-xl border-2 text-left transition-all",
                                            inviteRole === "member"
                                                ? "border-gray-900 bg-gray-50"
                                                : "border-gray-200 hover:border-gray-300"
                                        )}
                                    >
                                        <div className="flex items-center gap-2 mb-1">
                                            <Shield className="w-4 h-4 text-gray-600" />
                                            <span className="font-semibold text-gray-900">Member</span>
                                        </div>
                                        <p className="text-xs text-gray-500">
                                            Can view surveys and analytics
                                        </p>
                                    </button>
                                    <button
                                        onClick={() => setInviteRole("owner")}
                                        className={cn(
                                            "p-4 rounded-xl border-2 text-left transition-all",
                                            inviteRole === "owner"
                                                ? "border-gray-900 bg-gray-50"
                                                : "border-gray-200 hover:border-gray-300"
                                        )}
                                    >
                                        <div className="flex items-center gap-2 mb-1">
                                            <Crown className="w-4 h-4 text-amber-500" />
                                            <span className="font-semibold text-gray-900">Owner</span>
                                        </div>
                                        <p className="text-xs text-gray-500">
                                            Full access to workspace
                                        </p>
                                    </button>
                                </div>
                            </div>

                            {/* Error Message */}
                            {inviteError && (
                                <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                                    <p className="text-sm text-red-600">{inviteError}</p>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
                            <button
                                onClick={() => setShowInviteModal(false)}
                                className="px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleInvite}
                                disabled={!inviteEmail.trim() || isInviting}
                                className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-lg font-medium text-sm hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isInviting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Sending...
                                    </>
                                ) : (
                                    <>
                                        <Mail className="w-4 h-4" />
                                        Send Invitation
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
