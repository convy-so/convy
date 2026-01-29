"use client";

import { useState, useEffect } from "react";
import { 
  Users, 
  Shield, 
  Globe, 
  Settings,
  AlertCircle,
  AlertTriangle,
  Trash2,
  Loader2,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import toast from "react-hot-toast";
import { TeamMemberList } from "@/components/dashboard/team-member-list";
import { 
  getWorkspaceMembers, 
  getActiveWorkspace, 
  getWorkspaceInvitations,
  deleteWorkspace,
  leaveWorkspace
} from "@/app/actions/workspace";
import { cn } from "@/lib/utils";

type TeamMember = {
  id: string;
  userId: string;
  role: "owner" | "member";
  user: {
    id: string;
    name: string;
    email: string;
    image?: string | null;
  };
};

export default function TeamPage() {
  const { user } = useAuth();
  const [activeWorkspace, setActiveWorkspace] = useState<{
    id: string;
    name: string;
    slug: string;
    role: string;
    logo?: string | null;
    plan?: string | null;
  } | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  async function loadTeamData() {
    try {
      const workspaceResult = await getActiveWorkspace();
      
      if (workspaceResult.success && workspaceResult.data) {
        setActiveWorkspace(workspaceResult.data);
        
        const [membersResult, invitationsResult] = await Promise.all([
          getWorkspaceMembers({ organizationId: workspaceResult.data.id }),
          getWorkspaceInvitations(workspaceResult.data.id)
        ]);
        
        if (membersResult.success) {
          const transformedMembers = membersResult.data.map((m: any) => ({
            ...m,
            role: m.role as "owner" | "member"
          }));
          setMembers(transformedMembers);
        }

        if (invitationsResult.success) {
            setPendingInvites(invitationsResult.data.map((i: any) => ({
                id: i.id,
                email: i.email,
                role: i.role,
                status: i.status === "pending" ? "pending" : "expired",
                createdAt: new Date(i.createdAt).toLocaleDateString()
            })));
        }
      }
    } catch (error) {
      console.error("Failed to load team data:", error);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadTeamData();
  }, []);

  const handleMemberRemoved = (id: string) => {
    // Check if memberIdOrEmail was passed (it could be email for invites or userId for members)
    setMembers(prev => prev.filter(m => m.userId !== id && m.user?.id !== id));
    // Also clear from pending if it was an invite
    setPendingInvites(prev => prev.filter(i => i.id !== id && i.email !== id));
    toast.success("Member removed");
  };

  const handleWorkspaceDelete = async () => {
    if (!activeWorkspace) return;
    setIsProcessing(true);
    try {
      const result = await deleteWorkspace(activeWorkspace.id);
      if (result.success) {
        toast.success("Workspace deleted");
        window.location.href = "/dashboard";
      } else {
        toast.error(result.error);
        setIsProcessing(false);
        setShowDeleteModal(false);
      }
    } catch (error) {
      toast.error("Failed to delete workspace");
      setIsProcessing(false);
      setShowDeleteModal(false);
    }
  };

  const handleWorkspaceLeave = async () => {
    if (!activeWorkspace) return;
    setIsProcessing(true);
    try {
      const result = await leaveWorkspace(activeWorkspace.id);
      if (result.success) {
        toast.success("Left workspace");
        window.location.href = "/dashboard";
      } else {
        toast.error(result.error);
        setIsProcessing(false);
        setShowLeaveModal(false);
      }
    } catch (error) {
      toast.error("Failed to leave workspace");
      setIsProcessing(false);
      setShowLeaveModal(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
      </div>
    );
  }

  if (!activeWorkspace) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
            <Users className="w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-2xl font-semibold text-gray-900">Personal Space</h2>
          <p className="text-gray-500 max-w-md mx-auto">
            You are currently in your personal space. To manage a team, please switch to a workspace or create a new one.
          </p>
          {/* We could add a create workspace button here */}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-8 max-w-5xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight mb-2">
            Team Management
          </h1>
          <p className="text-gray-500">
            Manage members, roles, and permissions for <span className="font-semibold text-gray-900">{activeWorkspace.name}</span>
          </p>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="exclude-from-layout bg-white rounded-xl border border-gray-100 p-4 flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">Total Members</p>
              <p className="text-2xl font-bold text-gray-900">{members.length}</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
              <Users className="w-5 h-5" />
            </div>
          </div>

          <div className="exclude-from-layout bg-white rounded-xl border border-gray-100 p-4 flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">Your Role</p>
              <p className="text-2xl font-bold text-gray-900 capitalize">{activeWorkspace.role}</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
              <Shield className="w-5 h-5" />
            </div>
          </div>

          <div className="exclude-from-layout bg-white rounded-xl border border-gray-100 p-4 flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">Workspace Plan</p>
              <div className="flex items-center gap-2">
                <p className="text-2xl font-bold text-gray-900">{activeWorkspace.plan || "Free"}</p>
                {(activeWorkspace.plan === "Free" || !activeWorkspace.plan) && (
                  <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-medium cursor-pointer hover:bg-gray-200 transition-colors">
                    Upgrade
                  </span>
                )}
              </div>
            </div>
            <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600">
              <Globe className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Members List - Main Area */}
          <div className="flex-1">
            <TeamMemberList 
              members={members}
              pendingInvites={pendingInvites}
              currentUserId={user?.id || ""}
              isOwner={activeWorkspace.role === "owner"}
              workspaceId={activeWorkspace.id}
              onMemberRemoved={handleMemberRemoved}
              onInviteSent={() => {
                toast.success("Invitation sent successfully");
                loadTeamData();
              }}
            />
          </div>

          {/* Sidebar Info */}
          <div className="lg:w-80 space-y-6">
            {/* Permissions Info */}
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Settings className="w-4 h-4 text-gray-500" />
                Role Permissions
              </h3>
              
              <div className="space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 uppercase tracking-wide">
                      Owner
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Full access to workspace settings, billing, and team management. Can delete workspace.
                  </p>
                </div>
                
                <div className="w-full h-px bg-gray-50" />

                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-gray-50 text-gray-600 border border-gray-200 uppercase tracking-wide">
                      Member
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Can create and manage surveys, view analytics, and collaborate with other members.
                  </p>
                </div>
              </div>
            </div>

            {/* Upgrade Prompt */}
            {(activeWorkspace.plan === "Free" || !activeWorkspace.plan) && (
              <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-5 text-white">
                <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center mb-4">
                  <Users className="w-5 h-5 text-white" />
                </div>
                <h3 className="font-semibold mb-1">Need more seats?</h3>
                <p className="text-sm text-gray-300 mb-4">
                  Upgrade to Pro to add unlimited team members and access advanced collaboration features.
                </p>
                <button className="w-full py-2 bg-white text-gray-900 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
                  Upgrade Plan
                </button>
              </div>
            )}

            {/* Danger Zone */}
            <div className="bg-red-50 rounded-xl border border-red-100 p-5">
              <h3 className="font-semibold text-red-900 mb-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Danger Zone
              </h3>
              
              {activeWorkspace.role === "owner" ? (
                <div>
                  <p className="text-xs text-red-700 mb-3">
                    Deleting a workspace is permanent and cannot be undone. All surveys and data will be lost.
                  </p>
                  <button 
                    onClick={() => setShowDeleteModal(true)}
                    className="w-full py-2 bg-white border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 hover:border-red-300 transition-colors"
                  >
                    Delete Workspace
                  </button>
                </div>
              ) : (
                <div>
                  <p className="text-xs text-red-700 mb-3">
                    Leaving this workspace will revoke your access to all surveys and data.
                  </p>
                  <button 
                    onClick={() => setShowLeaveModal(true)}
                    className="w-full py-2 bg-white border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 hover:border-red-300 transition-colors"
                  >
                    Leave Workspace
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Delete Workspace Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => !isProcessing && setShowDeleteModal(false)}
          />

          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Delete Workspace</h3>
              <p className="text-gray-500">
                Are you sure you want to delete <span className="font-semibold text-gray-900">"{activeWorkspace.name}"</span>? 
                This action is permanent and will delete all surveys, responses, and members.
              </p>
            </div>

            <div className="px-6 py-4 bg-gray-50 flex items-center gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                disabled={isProcessing}
              >
                Cancel
              </button>
              <button
                onClick={handleWorkspaceDelete}
                disabled={isProcessing}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-medium text-sm hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Delete Workspace
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leave Workspace Modal */}
      {showLeaveModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => !isProcessing && setShowLeaveModal(false)}
          />

          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <LogOut className="w-8 h-8 text-orange-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Leave Workspace</h3>
              <p className="text-gray-500">
                Are you sure you want to leave <span className="font-semibold text-gray-900">"{activeWorkspace.name}"</span>? 
                You will lose access to all surveys and data in this workspace.
              </p>
            </div>

            <div className="px-6 py-4 bg-gray-50 flex items-center gap-3">
              <button
                onClick={() => setShowLeaveModal(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                disabled={isProcessing}
              >
                Cancel
              </button>
              <button
                onClick={handleWorkspaceLeave}
                disabled={isProcessing}
                className="flex-1 px-4 py-2.5 bg-orange-600 text-white rounded-xl font-medium text-sm hover:bg-orange-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Leaving...
                  </>
                ) : (
                  <>
                    <LogOut className="w-4 h-4" />
                    Leave Workspace
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
