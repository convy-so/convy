"use client";

import { useState, useEffect } from "react";
import { 
  Users, 
  Shield, 
  Globe, 
  Settings,
  AlertCircle
} from "lucide-react";
import { TeamMemberList } from "@/components/dashboard/team-member-list";
import { getWorkspaceMembers, getActiveWorkspace } from "@/app/actions/workspace";
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
  const [activeWorkspace, setActiveWorkspace] = useState<{
    id: string;
    name: string;
    role: string;
  } | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Mock pending invites for now since we don't have a backend action for it yet
  const pendingInvites = [
    {
      id: "1",
      email: "sarah@example.com",
      role: "member",
      status: "pending" as const,
      createdAt: "2 days ago",
    },
  ];

  useEffect(() => {
    async function loadTeamData() {
      try {
        const workspaceResult = await getActiveWorkspace();
        
        if (workspaceResult.success && workspaceResult.data) {
          setActiveWorkspace(workspaceResult.data);
          
          const membersResult = await getWorkspaceMembers({
            organizationId: workspaceResult.data.id
          });
          
          if (membersResult.success) {
            // Transform the data to match Key<TeamMember>
            const transformedMembers = membersResult.data.map(m => ({
              ...m,
              role: m.role as "owner" | "member"
            }));
            setMembers(transformedMembers);
          }
        }
      } catch (error) {
        console.error("Failed to load team data:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadTeamData();
  }, []);

  const handleMemberRemoved = (id: string) => {
    setMembers(members.filter(m => m.userId !== id));
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
              <p className="text-2xl font-bold text-gray-900">Free</p>
              <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-medium">
                Upgrade
              </span>
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
            currentUserId={members.find(m => m.user.email === "user@example.com")?.userId || ""} // TODO: Get actual current user ID
            isOwner={activeWorkspace.role === "owner"}
            workspaceId={activeWorkspace.id}
            onMemberRemoved={handleMemberRemoved}
            onInviteSent={() => {
              // Refresh logic would go here
              console.log("Invite sent");
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
        </div>
      </div>
    </div>
  );
}
