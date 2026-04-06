"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Users,
  Shield,
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
  fetchActiveWorkspace,
  fetchWorkspaceDepartments,
  fetchWorkspaceInvitations,
  fetchWorkspaceMembers,
} from "@/lib/api/workspace";
import {
  createDepartment,
  deleteDepartment,
  deleteWorkspace,
  leaveWorkspace,
  updateDepartment,
} from "@/app/actions/workspace";
import { queryKeys } from "@/lib/query-keys";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";

type WorkspaceRole = "owner" | "member";
type InvitationStatus = "pending" | "expired";

function getWorkspaceRole(value: unknown): WorkspaceRole {
  return value === "owner" ? "owner" : "member";
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
  const [departmentForm, setDepartmentForm] = useState({
    departmentId: "",
    name: "",
    code: "",
    description: "",
    headUserId: "",
  });
  const [isCreatingDepartment, setIsCreatingDepartment] = useState(false);
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

  const handleDepartmentCreate = async () => {
    if (!activeWorkspace?.id || !departmentForm.name.trim()) {
      return;
    }

    setIsCreatingDepartment(true);

    try {
      const result = departmentForm.departmentId
        ? await updateDepartment({
            departmentId: departmentForm.departmentId,
            name: departmentForm.name.trim(),
            code: departmentForm.code.trim() || undefined,
            description: departmentForm.description.trim() || undefined,
            headUserId: departmentForm.headUserId || null,
          })
        : await createDepartment({
            organizationId: activeWorkspace.id,
            name: departmentForm.name.trim(),
            code: departmentForm.code.trim() || undefined,
            description: departmentForm.description.trim() || undefined,
            headUserId: departmentForm.headUserId || null,
          });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      setDepartmentForm({
        departmentId: "",
        name: "",
        code: "",
        description: "",
        headUserId: "",
      });
      toast.success(
        departmentForm.departmentId ? "Department updated" : "Department created",
      );
      await queryClient.invalidateQueries({
        queryKey: queryKeys.workspaces.departments(activeWorkspace.id),
      });
    } catch {
      toast.error("Failed to create department");
    } finally {
      setIsCreatingDepartment(false);
    }
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

    if (departmentForm.departmentId === departmentId) {
      setDepartmentForm({
        departmentId: "",
        name: "",
        code: "",
        description: "",
        headUserId: "",
      });
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
          <h2 className="text-2xl font-semibold text-gray-900">You are in your personal account</h2>
          <p className="text-gray-500 max-w-md mx-auto">
            Personal mode is for private surveys and folders. Create a workspace when you need shared teachers, departments, classrooms, and controlled collaboration.
          </p>
          <div className="pt-2">
            <Link
              href="/dashboard/workspaces/new"
              className="inline-flex items-center rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-800"
            >
              Create workspace
            </Link>
          </div>
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
            Workspace management
          </h1>
          <p className="text-gray-500">
            {activeWorkspace.name} is the shared institution space for teachers, departments, classrooms, and controlled collaboration.
          </p>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="exclude-from-layout bg-white rounded-xl border border-gray-100 p-4 flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">{t("Stats.TotalMembers")}</p>
              <p className="text-2xl font-bold text-gray-900">{members.length}</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
              <Users className="w-5 h-5" />
            </div>
          </div>

          <div className="exclude-from-layout bg-white rounded-xl border border-gray-100 p-4 flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">{t("Stats.YourRole")}</p>
              <p className="text-2xl font-bold text-gray-900 capitalize">{t(`Roles.${activeWorkspace.role === 'owner' ? 'Owner' : 'Member'}`)}</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
              <Shield className="w-5 h-5" />
            </div>
          </div>

          <div className="exclude-from-layout bg-white rounded-xl border border-gray-100 p-4 flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">Departments</p>
              <div className="flex items-center gap-2">
                <p className="text-2xl font-bold text-gray-900">{departments.length}</p>
              </div>
            </div>
            <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600">
              <Building2 className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Members List - Main Area */}
          <div className="flex-1 space-y-8">
            <TeamMemberList
              members={members}
              pendingInvites={filteredInvites}
              currentUserId={user?.id || ""}
              isOwner={activeWorkspace.role === "owner"}
              workspaceId={activeWorkspace.id}
              onMemberRemoved={handleMemberRemoved}
              onInviteSent={() => {
                toast.success(t("Toasts.InvitationSent"));
                loadTeamData();
              }}
            />

            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">Departments</h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Organize large workspaces without exposing classroom internals by default.
                  </p>
                </div>
              </div>

              <div className="grid gap-6 p-6 lg:grid-cols-[0.9fr_1.1fr]">
                <div className="space-y-4">
                  {departmentForm.departmentId ? (
                    <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                      Editing an existing department. Save changes below or clear the form to create a new one.
                    </div>
                  ) : null}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Department name
                    </label>
                    <input
                      value={departmentForm.name}
                      onChange={(event) =>
                        setDepartmentForm((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      placeholder="Science Department"
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-gray-900"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Short code
                    </label>
                    <input
                      value={departmentForm.code}
                      onChange={(event) =>
                        setDepartmentForm((current) => ({
                          ...current,
                          code: event.target.value,
                        }))
                      }
                      placeholder="SCI"
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-gray-900"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Department head
                    </label>
                    <select
                      value={departmentForm.headUserId}
                      onChange={(event) =>
                        setDepartmentForm((current) => ({
                          ...current,
                          headUserId: event.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-gray-900"
                    >
                      <option value="">No department head</option>
                      {members.map((member) => (
                        <option key={member.userId} value={member.userId}>
                          {member.user.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Description
                    </label>
                    <textarea
                      value={departmentForm.description}
                      onChange={(event) =>
                        setDepartmentForm((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                      rows={4}
                      placeholder="Optional description"
                      className="w-full resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-gray-900"
                    />
                  </div>
                  {activeWorkspace.role === "owner" ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        onClick={handleDepartmentCreate}
                        disabled={!departmentForm.name.trim() || isCreatingDepartment}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-60"
                      >
                        {isCreatingDepartment ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Building2 className="w-4 h-4" />
                        )}
                        {departmentForm.departmentId ? "Save department" : "Create department"}
                      </button>
                      {departmentForm.departmentId ? (
                        <button
                          type="button"
                          onClick={() =>
                            setDepartmentForm({
                              departmentId: "",
                              name: "",
                              code: "",
                              description: "",
                              headUserId: "",
                            })
                          }
                          className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                        >
                          Clear
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                      Only the workspace owner can create departments.
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  {departments.length ? (
                    departments.map((department) => (
                      <div
                        key={department.id}
                        className="rounded-2xl border border-gray-100 bg-gray-50/60 px-4 py-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="text-sm font-semibold text-gray-900">
                              {department.name}
                            </div>
                            <div className="mt-1 text-xs text-gray-500">
                              {department.code || "No code"} ·{" "}
                              {department.headName || "No department head"}
                            </div>
                            {department.description ? (
                              <div className="mt-2 text-sm text-gray-600">
                                {department.description}
                              </div>
                            ) : null}
                            <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-medium text-gray-500">
                              <span className="rounded-full border border-gray-200 bg-white px-2.5 py-1">
                                {department.classroomCount} classrooms
                              </span>
                              <span className="rounded-full border border-gray-200 bg-white px-2.5 py-1">
                                {department.surveyCount} surveys
                              </span>
                              <span className="rounded-full border border-gray-200 bg-white px-2.5 py-1">
                                {department.folderCount} folders
                              </span>
                            </div>
                          </div>
                          {activeWorkspace.role === "owner" ? (
                            <div className="flex flex-col items-end gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setDepartmentForm({
                                    departmentId: department.id,
                                    name: department.name,
                                    code: department.code ?? "",
                                    description: department.description ?? "",
                                    headUserId: department.headUserId ?? "",
                                  })
                                }
                                className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDepartmentDelete(department.id)}
                                className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                              >
                                Delete
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-8 text-sm text-gray-500">
                      No departments yet. Add one when the workspace starts spanning multiple subjects or units.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar Info */}
          <div className="lg:w-80 space-y-6">
            {/* Permissions Info */}
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Settings className="w-4 h-4 text-gray-500" />
                {t("Permissions.Title")}
              </h3>

              <div className="space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 uppercase tracking-wide">
                      {t("Permissions.Owner.Title")}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    {t("Permissions.Owner.Description")}
                  </p>
                </div>

                <div className="w-full h-px bg-gray-50" />

                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-gray-50 text-gray-600 border border-gray-200 uppercase tracking-wide">
                      {t("Permissions.Member.Title")}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    {t("Permissions.Member.Description")}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-5 text-white">
              <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center mb-4">
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <h3 className="font-semibold mb-1">Workspace principles</h3>
              <p className="text-sm text-gray-300 mb-4">
                Workspace membership lets teachers discover one another and the classroom directory. Classroom data still stays private until the owner grants access.
              </p>
              <div className="text-xs text-gray-300 leading-6">
                Departments organize the institution. Classroom permissions control access.
              </div>
            </div>

            {/* Danger Zone */}
            <div className="bg-red-50 rounded-xl border border-red-100 p-5">
              <h3 className="font-semibold text-red-900 mb-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {t("Danger.Title")}
              </h3>

              {activeWorkspace.role === "owner" ? (
                <div>
                  <p className="text-xs text-red-700 mb-3">
                    {t("Danger.DeleteDesc")}
                  </p>
                  <button
                    onClick={() => setShowDeleteModal(true)}
                    className="w-full py-2 bg-white border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 hover:border-red-300 transition-colors"
                  >
                    {t("Danger.DeleteWorkspace")}
                  </button>
                </div>
              ) : (
                <div>
                  <p className="text-xs text-red-700 mb-3">
                    {t("Danger.LeaveDesc")}
                  </p>
                  <button
                    onClick={() => setShowLeaveModal(true)}
                    className="w-full py-2 bg-white border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 hover:border-red-300 transition-colors"
                  >
                    {t("Danger.LeaveWorkspace")}
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
    </>
  );
}

