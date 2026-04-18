"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Users,
  Shield,
  AlertCircle,
  AlertTriangle,
  Trash2,
  Loader2,
  LogOut,
  Edit,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import toast from "react-hot-toast";
import { TeamMemberList } from "@/components/dashboard/team-member-list";
import {
  fetchActiveWorkspace,
  fetchWorkspaceDepartments,
  fetchWorkspaceInvitations,
  fetchWorkspaceMembers,
} from "@/lib/api/workspace";
import {
  deleteDepartment,
  deleteWorkspace,
  leaveWorkspace,
} from "@/app/actions/workspace";
import { queryKeys } from "@/lib/query-keys";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { AcademyUnitModal } from "@/components/dashboard/academy-unit-modal";
import { CreateWorkspaceModal } from "@/components/dashboard/create-workspace-modal";

type WorkspaceRole = "owner" | "admin" | "teacher" | "staff_viewer";
type InvitationStatus = "pending" | "expired";

function getWorkspaceRole(value: unknown): WorkspaceRole {
  if (
    value === "owner" ||
    value === "admin" ||
    value === "teacher" ||
    value === "staff_viewer"
  ) {
    return value;
  }

  return "teacher";
}

function getInvitationStatus(value: unknown): InvitationStatus {
  return value === "pending" ? "pending" : "expired";
}

export default function TeamPage() {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAcademyModalOpen, setIsAcademyModalOpen] = useState(false);
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<{
    id: string;
    name: string;
    code: string;
    description: string;
  } | null>(null);
  const t = useTranslations("TeamPage");

  // Fetch active workspace first
  const { data: activeWorkspace, isLoading: isLoadingWorkspace } = useQuery({
    queryKey: queryKeys.workspaces.active,
    queryFn: fetchActiveWorkspace,
  });

  // Dependent query: Fetch members only when workspace is available
  const { data: membersData = [], isLoading: isLoadingMembers } = useQuery({
    queryKey: queryKeys.workspaces.members(activeWorkspace?.id || ''),
    queryFn: async () => {
      if (!activeWorkspace?.id) {
        return [];
      }
      return fetchWorkspaceMembers(activeWorkspace.id);
    },
    enabled: !!activeWorkspace?.id,
    select: (data: { id: string; userId: string; role: string; user: { id: string; name: string; email: string; image?: string | null } }[]) => data.map((m) => ({
      ...m,
      role: getWorkspaceRole(m.role),
    })),
  });

  // Dependent query: Fetch invitations only when workspace is available
  const { data: pendingInvites = [], isLoading: isLoadingInvites } = useQuery({
    queryKey: queryKeys.workspaces.invitations(activeWorkspace?.id || ''),
    queryFn: async () => {
      if (!activeWorkspace?.id) {
        return [];
      }
      return fetchWorkspaceInvitations(activeWorkspace.id);
    },
    enabled: !!activeWorkspace?.id,
    select: (data: { id: string; email: string; role: string; status: string; createdAt: string | number | Date }[]) => data.map((i) => ({
      id: i.id,
      email: i.email,
      role: getWorkspaceRole(i.role),
      status: getInvitationStatus(i.status),
      createdAt: new Date(i.createdAt).toLocaleDateString()
    })),
  });

  const { data: departments = [], isLoading: isLoadingDepartments } = useQuery({
    queryKey: queryKeys.workspaces.departments(activeWorkspace?.id || ""),
    queryFn: async () => {
      if (!activeWorkspace?.id) {
        return [];
      }
      return fetchWorkspaceDepartments(activeWorkspace.id);
    },
    enabled: !!activeWorkspace?.id,
  });

  const members = membersData;
  const memberEmails = new Set(
    members.map((member) => member.user.email.toLowerCase()),
  );
  const filteredInvites = pendingInvites.filter(
    (invite) =>
      invite.status === "pending" &&
      !memberEmails.has(invite.email.toLowerCase()),
  );
  const isLoading =
    isLoadingWorkspace ||
    isLoadingMembers ||
    isLoadingInvites ||
    isLoadingDepartments;
  const canManageMembers = Boolean(activeWorkspace?.capabilities.manageMembers);
  const canManageDepartments = Boolean(activeWorkspace?.capabilities.manageDepartments);
  const canManageWorkspace = Boolean(activeWorkspace?.capabilities.manageWorkspace);

  // Function for refreshing team data (for backwards compatibility)
  const loadTeamData = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.active });
    if (activeWorkspace?.id) {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.members(activeWorkspace.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.invitations(activeWorkspace.id) });
    }
  };

  const handleMemberRemoved = async () => {
    if (activeWorkspace?.id) {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.members(activeWorkspace.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.invitations(activeWorkspace.id) });
    }
    toast.success(t("Toasts.MemberRemoved"));
  };

  const handleDepartmentDelete = async (departmentId: string) => {
    if (!activeWorkspace?.id) {
      return;
    }

    const result = await deleteDepartment({ departmentId });
    if (!result.success) {
      toast.error(result.error);
      return;
    }

    if (editingUnit?.id === departmentId) {
      setEditingUnit(null);
    }

    toast.success("Department deleted");
    await queryClient.invalidateQueries({
      queryKey: queryKeys.workspaces.departments(activeWorkspace.id),
    });
  };

  const handleWorkspaceDelete = async () => {
    if (!activeWorkspace) return;
    setIsProcessing(true);
    try {
      const result = await deleteWorkspace(activeWorkspace.id);
      if (result.success) {
        toast.success(t("Toasts.WorkspaceDeleted"));
        await queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
        await queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.active });
        router.push("/dashboard");
        router.refresh();
      } else {
        toast.error(t("Toasts.DeleteFailed"));
        setIsProcessing(false);
        setShowDeleteModal(false);
      }
    } catch {
      toast.error(t("Toasts.DeleteFailed"));
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
        toast.success(t("Toasts.LeftWorkspace"));
        await queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
        await queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.active });
        router.push("/dashboard");
        router.refresh();
      } else {
        toast.error(t("Toasts.LeaveFailed"));
        setIsProcessing(false);
        setShowLeaveModal(false);
      }
    } catch {
      toast.error(t("Toasts.LeaveFailed"));
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
            <Building2 className="w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-2xl font-semibold text-gray-900">You are in your personal space</h2>
          <p className="text-gray-500 max-w-md mx-auto">
            Personal space is your full solo-teacher workspace for classes, students, surveys, materials, and folders. Create a shared workspace when you want to collaborate with other teachers.
          </p>
          <div className="pt-2">
            <button
              onClick={() => setIsWorkspaceModalOpen(true)}
              className="inline-flex items-center rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-800"
            >
              Create workspace
            </button>
          </div>
        </div>
        <CreateWorkspaceModal 
          isOpen={isWorkspaceModalOpen}
          onClose={() => setIsWorkspaceModalOpen(false)}
        />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-8 max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-950 mb-2">
            Academy Center
          </h1>
          <p className="text-sm text-slate-500 max-w-2xl">
            {activeWorkspace.type === "institutional"
              ? `Manage departments, teacher roles, and shared academic infrastructure for ${activeWorkspace.name}.`
              : `Manage your shared teacher workspace, invitations, and collaboration settings for ${activeWorkspace.name}.`}
          </p>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="bg-white rounded-2xl border border-slate-100 p-5 flex items-start justify-between">
            <div>
              <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-2">{t("Stats.TotalMembers")}</p>
              <p className="text-3xl font-bold text-slate-950">{members.length}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center text-sky-600">
              <Users className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 p-5 flex items-start justify-between">
            <div>
              <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-2">{t("Stats.YourRole")}</p>
              <p className="text-2xl font-bold text-slate-950 capitalize">{activeWorkspace.role.replace("_", " ")}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
              <Shield className="w-5 h-5" />
            </div>
          </div>

          {activeWorkspace.type === "institutional" && (
          <div className="bg-white rounded-2xl border border-slate-100 p-5 flex items-start justify-between">
            <div>
              <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-2">Academy Units</p>
              <p className="text-3xl font-bold text-slate-950">{departments.length}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
              <Building2 className="w-5 h-5" />
            </div>
          </div>
          )}
        </div>

        {/* Main Content */}
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Members List - Main Area */}
          <div className="flex-1 space-y-8">
            <TeamMemberList
              members={members}
              pendingInvites={filteredInvites}
              currentUserId={user?.id || ""}
              canManageMembers={canManageMembers}
              workspaceId={activeWorkspace.id}
              workspaceType={activeWorkspace.type}
              onMemberRemoved={handleMemberRemoved}
              onInviteSent={() => {
                toast.success(t("Toasts.InvitationSent"));
                loadTeamData();
              }}
            />

            {activeWorkspace.type === "institutional" && (
            <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-white">
                <div>
                    <h3 className="text-lg font-bold text-slate-950">Academy Units</h3>
                    <p className="text-sm text-slate-500 mt-1">
                    Organize your institution into subjects or administrative groups.
                    </p>
                </div>
                {canManageDepartments && (
                    <button
                        onClick={() => {
                            setEditingUnit(null);
                            setIsAcademyModalOpen(true);
                        }}
                        className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-900"
                    >
                        Register Unit
                    </button>
                )}
              </div>

              <div className="p-6">
                <div className="space-y-4 w-full">
                  {departments.length ? (
                    departments.map((department) => (
                      <div
                        key={department.id}
                        className="rounded-2xl border border-slate-100 bg-white p-5 flex items-start justify-between gap-4"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-bold text-slate-950">{department.name}</span>
                            {department.code && (
                              <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">{department.code}</span>
                            )}
                          </div>
                          {department.description && (
                            <p className="text-sm text-slate-600 mb-4 line-clamp-2">{department.description}</p>
                          )}
                          <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              <span className="rounded-full border border-slate-100 bg-slate-50 px-3 py-1.5">
                                {department.classroomCount} Classes
                              </span>
                              <span className="rounded-full border border-slate-100 bg-slate-50 px-3 py-1.5">
                                {department.surveyCount} Surveys
                              </span>
                          </div>
                        </div>
                        {canManageDepartments && (
                          <div className="flex flex-col gap-2">
                             <button
                                type="button"
                                onClick={() => {
                                  setEditingUnit({
                                    id: department.id,
                                    name: department.name,
                                    code: department.code ?? "",
                                    description: department.description ?? "",
                                  });
                                  setIsAcademyModalOpen(true);
                                }}
                                className="p-2 rounded-xl border border-slate-100 bg-white text-slate-600 hover:bg-slate-50 transition"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDepartmentDelete(department.id)}
                                className="p-2 rounded-xl border border-rose-100 bg-rose-50 text-rose-600 hover:bg-rose-100 transition"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-10 text-center">
                      <Building2 className="w-10 h-10 text-slate-200 mx-auto mb-4" />
                      <p className="text-sm text-slate-500 font-medium">No units registered yet.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            )}
          </div>

          {/* Sidebar Info */}
          <div className="lg:w-80 space-y-6">
            {/* Permissions Info */}
            <div className="bg-white rounded-2xl border border-slate-100 p-6">
              <h3 className="font-bold text-slate-950 mb-4 flex items-center gap-2">
                <Shield className="w-4 h-4 text-slate-400" />
                Access Roles
              </h3>

              <div className="space-y-5">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100 uppercase tracking-widest">
                      {t("Permissions.Owner.Title")}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Full administration of the academy, units, and membership.
                  </p>
                </div>

                <div className="h-px bg-slate-50" />

                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-50 text-slate-600 border border-slate-100 uppercase tracking-widest">
                      Admin
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Manages membership, shared settings, and governance without inheriting survey or class internals.
                  </p>
                </div>

                <div className="h-px bg-slate-50" />

                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-50 text-slate-600 border border-slate-100 uppercase tracking-widest">
                      Teacher
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Creates classes, surveys, materials, and folders. Collaboration is granted per class or survey.
                  </p>
                </div>

                {activeWorkspace.type === "institutional" && (
                  <>
                    <div className="h-px bg-slate-50" />

                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-50 text-slate-600 border border-slate-100 uppercase tracking-widest">
                          Staff Viewer
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Sees workspace structure and class directory metadata, but not class internals or surveys by default.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="bg-slate-950 rounded-2xl p-6 text-white">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center mb-4">
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <h3 className="font-bold mb-2">Workspace Principles</h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                Shared institution space where classrooms are discoverable but internal data remains protected by classroom permissions.
              </p>
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
                Governance & Privacy
              </div>
            </div>

            {/* Danger Zone */}
            <div className="bg-white rounded-2xl border border-rose-100 p-6">
              <h3 className="font-bold text-rose-950 mb-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500" />
                System Actions
              </h3>

              {canManageWorkspace && activeWorkspace.role === "owner" ? (
                <div>
                  <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                    Permanently delete this academy and all associated classroom data.
                  </p>
                  <button
                    onClick={() => setShowDeleteModal(true)}
                    className="w-full py-2.5 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl text-xs font-bold hover:bg-rose-100 transition-colors uppercase tracking-wider"
                  >
                    Delete Academy
                  </button>
                </div>
              ) : (
                <div>
                  <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                    Leave this shared workspace and return to your personal space.
                  </p>
                  <button
                    onClick={() => setShowLeaveModal(true)}
                    className="w-full py-2.5 bg-slate-50 border border-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-100 transition-colors uppercase tracking-wider"
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
              <h3 className="text-xl font-bold text-gray-900 mb-2">{t("Modals.Delete.Title")}</h3>
              <p className="text-gray-500">
                {t("Modals.Delete.Description", { name: activeWorkspace.name })}
              </p>
            </div>

            <div className="px-6 py-4 bg-gray-50 flex items-center gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                disabled={isProcessing}
              >
                {t("Modals.Delete.Cancel")}
              </button>
              <button
                onClick={handleWorkspaceDelete}
                disabled={isProcessing}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-medium text-sm hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t("Modals.Delete.Deleting")}
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    {t("Modals.Delete.Confirm")}
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
              <h3 className="text-xl font-bold text-gray-900 mb-2">{t("Modals.Leave.Title")}</h3>
              <p className="text-gray-500">
                {t("Modals.Leave.Description", { name: activeWorkspace.name })}
              </p>
            </div>

            <div className="px-6 py-4 bg-gray-50 flex items-center gap-3">
              <button
                onClick={() => setShowLeaveModal(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                disabled={isProcessing}
              >
                {t("Modals.Leave.Cancel")}
              </button>
              <button
                onClick={handleWorkspaceLeave}
                disabled={isProcessing}
                className="flex-1 px-4 py-2.5 bg-orange-600 text-white rounded-xl font-medium text-sm hover:bg-orange-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t("Modals.Leave.Leaving")}
                  </>
                ) : (
                  <>
                    <LogOut className="w-4 h-4" />
                    {t("Modals.Leave.Confirm")}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      <AcademyUnitModal 
        isOpen={isAcademyModalOpen}
        onClose={() => setIsAcademyModalOpen(false)}
        workspaceId={activeWorkspace.id}
        members={members}
        editingUnit={editingUnit}
      />
      
      <CreateWorkspaceModal 
        isOpen={isWorkspaceModalOpen}
        onClose={() => setIsWorkspaceModalOpen(false)}
      />
    </>
  );
}

