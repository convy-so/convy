"use client";

import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { getCreationCommentsAction, postCreationCommentAction, grantEditAccessAction, requestEditAccessAction, revokeEditAccessAction } from "@/app/actions/collaboration";
import { getWorkspaceMembers } from "@/app/actions/workspace";
import { Users, Send, ShieldPlus, Loader2, X } from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import { usePresence } from "@/hooks/use-presence";
import { useRealtime, type RealtimeEvent } from "@/hooks/use-realtime";

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

type Comment = {
    id: string;
    text: string;
    createdAt: string | Date;
    user: { name: string; email: string };
};

type ActiveUser = {
    id: string;
    name: string;
};

type WorkspaceMember = {
    id: string;
    userId: string;
    role: string;
    user: { id: string; name: string; email: string; image?: string | null };
};

export function CollaborationSidebar({ 
    surveyId, 
    workspaceId,
    isOwner, 
    editors = [], 
    isOpen, 
    onClose 
}: { 
    surveyId: string; 
    workspaceId?: string | null;
    isOwner: boolean; 
    editors?: string[];
    isOpen: boolean;
    onClose: () => void;
}) {
    const { user } = useAuth();
    const [comments, setComments] = useState<Comment[]>([]);
    const [newComment, setNewComment] = useState("");
    const [isPosting, setIsPosting] = useState(false);

    // Access Management State
    const [showAccessModal, setShowAccessModal] = useState(false);
    const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>([]);
    const [isLoadingMembers, setIsLoadingMembers] = useState(false);
    const [currentEditors, setCurrentEditors] = useState<string[]>(editors);
    const [isRequestingAccess, setIsRequestingAccess] = useState(false);

    const commentsEndRef = useRef<HTMLDivElement>(null);
    const presence = usePresence({
        workspaceId: workspaceId || "",
        surveyId,
    });

    const activeUsers: ActiveUser[] = presence.users.map((user) => ({
        id: user.userId,
        name: user.name,
    }));

    useEffect(() => {
        const loadComments = async () => {
            if (!surveyId || !isOpen) return;
            const commentsRes = await getCreationCommentsAction(surveyId);
            if (commentsRes.success) {
                setComments(commentsRes.data);
            }
        };

        loadComments().catch((error) => {
        });
    }, [surveyId, isOpen]);

    useRealtime({
        channels: isOpen ? [`survey:${surveyId}`] : [],
        onEvent: (event: RealtimeEvent) => {
            if (event.eventType === "survey.comment_added" || event.eventType === "survey.editor_granted" || event.eventType === "survey.editor_revoked") {
                getCreationCommentsAction(surveyId).then((result) => {
                    if (result.success) {
                        setComments(result.data);
                    }
                });
            }

            if (event.eventType === "survey.editor_granted" && isRecord(event.payload) && typeof event.payload.userId === "string") {
                const userId = event.payload.userId;
                setCurrentEditors((prev) =>
                    prev.includes(userId)
                        ? prev
                        : [...prev, userId],
                );
            }

            if (event.eventType === "survey.editor_revoked" && isRecord(event.payload) && typeof event.payload.userId === "string") {
                const userId = event.payload.userId;
                setCurrentEditors((prev) =>
                    prev.filter((id) => id !== userId),
                );
            }
        },
    });

    useEffect(() => {
        commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [comments]);

    useEffect(() => {
        setCurrentEditors(editors);
    }, [editors]);

    const loadMembers = async () => {
        setIsLoadingMembers(true);
        const res = await getWorkspaceMembers();
        if (res.success) {
            setWorkspaceMembers(res.data);
        }
        setIsLoadingMembers(false);
    };

    const handlePostComment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newComment.trim() || isPosting) return;

        setIsPosting(true);
        const text = newComment.trim();
        setNewComment("");

        const res = await postCreationCommentAction({ surveyId, text });
        if (!res.success) {
            toast.error("Failed to post comment");
            setNewComment(text); // revert
        } else {
            // Optimistically fetch again to update list
            const fetchRes = await getCreationCommentsAction(surveyId);
            if (fetchRes.success) setComments(fetchRes.data);
        }
        setIsPosting(false);
    };

    const handleManageAccess = async (userIdToGrant: string, action: "grant" | "revoke") => {
        if (action === "grant") {
            setCurrentEditors(prev => [...prev, userIdToGrant]);
            const res = await grantEditAccessAction({ surveyId, userIdToGrant });
            if (!res.success) toast.error(res.error);
        } else {
            setCurrentEditors(prev => prev.filter(id => id !== userIdToGrant));
            const res = await revokeEditAccessAction({ surveyId, userIdToGrant });
            if (!res.success) toast.error(res.error);
        }
    };

    const handleRequestAccess = async () => {
        setIsRequestingAccess(true);
        const result = await requestEditAccessAction(surveyId);
        if (result.success) {
            toast.success("Editor access request sent");
        } else {
            toast.error(result.error);
        }
        setIsRequestingAccess(false);
    };

    return (
        <>
            <div className={cn(
                "fixed right-0 top-0 h-screen w-80 bg-white border-l border-gray-100 shadow-2xl flex flex-col z-50 transform transition-transform duration-300 ease-in-out",
                isOpen ? "translate-x-0" : "translate-x-full"
            )}>
                <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                    <div className="flex items-center gap-2">
                        <Users className="w-5 h-5 text-indigo-600" />
                        <h3 className="font-semibold text-gray-900">Team Collaboration</h3>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Presence Bar */}
                <div className="p-3 bg-indigo-50/50 border-b border-indigo-100 flex items-center justify-between">
                    <div className="flex -space-x-2 overflow-hidden">
                        {activeUsers.map(u => (
                            <div key={u.id} className="w-8 h-8 rounded-full bg-indigo-200 border-2 border-white flex items-center justify-center text-xs font-bold text-indigo-800 ring-2 ring-emerald-400" title={u.name}>
                                {u.name.charAt(0).toUpperCase()}
                            </div>
                        ))}
                    </div>
                    {isOwner && (
                        <button
                            onClick={() => {
                                setShowAccessModal(true);
                                if (workspaceMembers.length === 0) loadMembers();
                            }}
                            className="text-xs font-medium text-indigo-600 bg-indigo-100 hover:bg-indigo-200 px-2.5 py-1.5 rounded-md flex items-center gap-1 transition"
                        >
                            <ShieldPlus className="w-3.5 h-3.5" />
                            Access
                        </button>
                    )}
                    {!isOwner && user && !currentEditors.includes(user.id) && (
                        <button
                            onClick={handleRequestAccess}
                            disabled={isRequestingAccess}
                            className="text-xs font-medium text-indigo-600 bg-white hover:bg-indigo-50 px-2.5 py-1.5 rounded-md flex items-center gap-1 transition border border-indigo-100 disabled:opacity-50"
                        >
                            {isRequestingAccess ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldPlus className="w-3.5 h-3.5" />}
                            Request Edit Access
                        </button>
                    )}
                </div>

                {/* Comments Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/30 text-sm">
                    {comments.map((comment, i) => (
                        <div key={comment.id || i} className={`flex flex-col ${comment.user.email === user?.email ? 'items-end' : 'items-start'}`}>
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-medium text-gray-500">{comment.user.name}</span>
                                <span className="text-[10px] text-gray-400">{new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <div className={`px-3 py-2 rounded-2xl max-w-[90%] ${comment.user.email === user?.email ? 'bg-indigo-600 text-white rounded-tr-sm' : 'bg-white border text-gray-800 rounded-tl-sm shadow-sm'}`}>
                                {comment.text}
                            </div>
                        </div>
                    ))}
                    <div ref={commentsEndRef} />
                    {comments.length === 0 && <p className="text-center text-gray-400 mt-10 italic">No comments yet</p>}
                </div>

                {/* Input Area */}
                <div className="p-4 bg-white border-t border-gray-100">
                    <form onSubmit={handlePostComment} className="flex items-center gap-2">
                        <input
                            type="text"
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            placeholder="Add a comment..."
                            className="flex-1 bg-gray-50 border border-gray-200 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                        <button
                            type="submit"
                            disabled={!newComment.trim() || isPosting}
                            className="p-2 rounded-full bg-indigo-600 text-white disabled:opacity-50 hover:bg-indigo-700 transition"
                        >
                            {isPosting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        </button>
                    </form>
                </div>
            </div>

            {/* Backdrop for mobile or focus */}
            {isOpen && (
                <div 
                    className="fixed inset-0 bg-black/5 backdrop-blur-[1px] z-40 transition-opacity" 
                    onClick={onClose}
                />
            )}

            {/* Access Modal */}
            {showAccessModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
                    <div className="bg-white rounded-2xl shadow-xl w-[400px] max-w-[90%] p-6 space-y-6 animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between">
                            <h3 className="font-bold text-lg text-gray-900">Manage Edit Access</h3>
                            <button onClick={() => setShowAccessModal(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <p className="text-sm text-gray-500">
                            Select workspace members who can open and edit this survey alongside you. Teachers without access can still discover that the survey exists, but they cannot open its internals.
                        </p>

                        <div className="space-y-3 max-h-60 overflow-y-auto">
                            {isLoadingMembers ? (
                                <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 text-indigo-500 animate-spin" /></div>
                            ) : (
                                workspaceMembers.map((member) => {
                                    if (member.user.email === user?.email) return null; // Don't show self
                                    const hasAccess = currentEditors.includes(member.userId);
                                    return (
                                        <div key={member.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 bg-gray-50/50">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">
                                                    {member.user.name.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium text-gray-900">{member.user.name}</p>
                                                    <p className="text-xs text-gray-500">{member.role}</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleManageAccess(member.userId, hasAccess ? "revoke" : "grant")}
                                                className={`text-xs font-semibold px-3 py-1.5 rounded-md transition ${hasAccess ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`}
                                            >
                                                {hasAccess ? "Revoke Access" : "Grant Edit Access"}
                                            </button>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        <button onClick={() => setShowAccessModal(false)} className="w-full py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors">
                            Done
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}

