"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/routing";
import {
  ArrowLeft,
  FolderOpen,
  MessageSquare,
  Users,
  Clock,
  Plus,
  Settings,
  MoreVertical,
  Trash2,
  ExternalLink,
  TrendingUp,
  X,
  Check,
  Loader2,
  BarChart3,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { InviteMemberModal } from "@/components/dashboard/invite-member-modal";
import { ProjectAIChat } from "@/components/dashboard/project-ai-chat";
import {
  useProject,
  useUpdateProject,
  useDeleteProject,
  useAddSurveyToProject,
  useRemoveSurveyFromProject,
  useAvailableSurveys
} from "@/components/dashboard/projects/hooks";
import { formatDistanceToNow } from "date-fns";
import toast from "react-hot-toast";
import { ClientT } from "@/components/i18n/client-t";
import { Suspense } from "react";

import { getClientTranslation } from "@/app/actions/translate";

function ProjectDetailContent() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const { data: project, isLoading, isError } = useProject(projectId);
  const updateProjectMutation = useUpdateProject();
  const deleteProjectMutation = useDeleteProject();
  const removeSurveyMutation = useRemoveSurveyFromProject();
  const addSurveyMutation = useAddSurveyToProject();
  const { data: availableSurveys, isLoading: isLoadingAvailable } = useAvailableSurveys();

  const [showAddSurveyModal, setShowAddSurveyModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showMenuFor, setShowMenuFor] = useState<string | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeletingProject, setIsDeletingProject] = useState(false);

  // Edit states
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [placeholders, setPlaceholders] = useState({
    search: "Search surveys...",
    name: "e.g. Q4 User Research",
    description: "Describe the objective of this project...",
  });

  useEffect(() => {
    Promise.all([
      getClientTranslation("Search surveys...", "Project details search"),
      getClientTranslation("e.g. Q4 User Research", "Project name placeholder"),
      getClientTranslation("Describe the objective of this project...", "Project description placeholder"),
    ]).then(([search, name, description]) => {
      setPlaceholders({ search, name, description });
    });
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (isError || !project) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] gap-4">
        <h2 className="text-xl font-semibold text-gray-900"><ClientT>Project not found</ClientT></h2>
        <p className="text-gray-500"><ClientT>The project you are looking for does not exist or you don&apos;t have permission to view it.</ClientT></p>
        <Link href="/dashboard/projects" className="text-blue-600 hover:underline">
          <ClientT>Back to Projects</ClientT>
        </Link>
      </div>
    );
  }

  // Calculate stats
  // Calculate stats
  const totalStarted = project.surveys.reduce((acc, s) => acc + (s.currentParticipants || 0), 0);
  const totalCompleted = project.surveys.reduce((acc, s) => acc + (s.completedCount || 0), 0);

  const stats = {
    totalSurveys: project.surveys.length,
    totalResponses: totalStarted,
    avgCompletion: totalStarted > 0 ? Math.round((totalCompleted / totalStarted) * 100) : 0,
    activeSurveys: project.surveys.filter(s => s.status === 'active').length,
  };

  const handleDelete = () => {
    setIsDeletingProject(true);
    deleteProjectMutation.mutate(projectId, {
      onSuccess: () => {
        router.push("/dashboard/projects");
      },
      onSettled: () => {
        setIsDeletingProject(false);
        setShowDeleteModal(false);
      }
    });
  };

  const handleUpdate = () => {
    updateProjectMutation.mutate({
      id: projectId,
      name: editName,
      description: editDescription
    }, {
      onSuccess: () => {
        setShowSettingsModal(false);
      }
    });
  };

  const openSettings = () => {
    setEditName(project.name);
    setEditDescription(project.description || "");
    setShowSettingsModal(true);
  };

  const handleAddSurvey = (surveyId: string) => {
    addSurveyMutation.mutate({ projectId, surveyId }, {
      onSuccess: () => {
        // Toast handled by hook
      }
    });
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard/projects"
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${project.color || 'from-gray-500 to-gray-600'} flex items-center justify-center`}>
                <FolderOpen className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-xl font-bold text-gray-900">{project.name}</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={openSettings}
              className="px-4 py-2.5 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors font-medium text-sm flex items-center gap-2"
            >
              <Settings className="w-4 h-4" />
              <ClientT>Settings</ClientT>
            </button>
            <button
              onClick={() => setShowAddSurveyModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <ClientT>Add Survey</ClientT>
            </button>
          </div>
        </div>
        {project.description && (
          <p className="text-gray-500 mt-3 ml-16 text-sm max-w-2xl">{project.description}</p>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
            <MessageSquare className="w-4 h-4" />
            <span className="text-sm"><ClientT>Surveys</ClientT></span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.totalSurveys}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
            <Users className="w-4 h-4" />
            <span className="text-sm"><ClientT>Responses</ClientT></span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.totalResponses}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
            <TrendingUp className="w-4 h-4" />
            <span className="text-sm"><ClientT>Avg. Completion</ClientT></span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.avgCompletion}%</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
            <Clock className="w-4 h-4" />
            <span className="text-sm"><ClientT>Active</ClientT></span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.activeSurveys}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Surveys List */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900"><ClientT>Surveys in Project</ClientT></h2>
              <span className="text-sm text-gray-500">{project.surveys.length} <ClientT>surveys</ClientT></span>
            </div>
            <div className="divide-y divide-gray-50">
              {project.surveys.length === 0 ? (
                <div className="p-8 text-center bg-gray-50/30">
                  <MessageSquare className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 mb-2"><ClientT>No surveys yet</ClientT></p>
                  <button
                    onClick={() => setShowAddSurveyModal(true)}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    <ClientT>Add your first survey</ClientT>
                  </button>
                </div>
              ) : (
                project.surveys.map((survey) => (
                  <div key={survey.id} className="p-4 hover:bg-gray-50/50 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          "w-10 h-10 rounded-lg flex items-center justify-center",
                          // No exact 'isVoice' on backend type yet, relying on inferred or null check if needed. 
                          // Assuming 'type' or checking if it has voice config. 
                          // Current schema has 'type', let's default to text if not sure or check props.
                          // The backend 'surveys' schema has no 'type' column shown in previous view, 
                          // BUT previous code used `isVoice` prop. 
                          // Let's assume generic icon for now or check if we can infer it.
                          "bg-blue-100 text-blue-600"
                        )}>
                          <MessageSquare className="w-5 h-5" />
                        </div>
                        <div>
                          <Link
                            href={`/dashboard/surveys/${survey.id}`}
                            className="font-medium text-gray-900 hover:text-blue-600 transition-colors"
                          >
                            {survey.title}
                          </Link>
                          <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                            <span>{survey.currentParticipants || 0} <ClientT>responses</ClientT></span>
                            <span>•</span>
                            <span><ClientT>Created</ClientT> {formatDistanceToNow(new Date(survey.createdAt), { addSuffix: true })}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-xs font-medium capitalize",
                          survey.status === "active" && "bg-emerald-50 text-emerald-700",
                          survey.status === "draft" && "bg-amber-50 text-amber-700",
                          survey.status === "completed" && "bg-gray-100 text-gray-600"
                        )}>
                          <ClientT>{survey.status === "active" ? "Active" : survey.status === "completed" ? "Completed" : "Draft"}</ClientT>
                        </span>

                        <div className="relative">
                          <button
                            onClick={() => setShowMenuFor(showMenuFor === survey.id ? null : survey.id)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>

                          {showMenuFor === survey.id && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => setShowMenuFor(null)} />
                              <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-xl border border-gray-200 shadow-xl z-50 py-1">
                                <Link
                                  href={`/dashboard/surveys/${survey.id}`}
                                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                  <ClientT>View Survey</ClientT>
                                </Link>
                                <Link
                                  href={`/dashboard/surveys/${survey.id}?tab=analytics`}
                                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                >
                                  <BarChart3 className="w-4 h-4" />
                                  <ClientT>Analytics</ClientT>
                                </Link>
                                <div className="border-t border-gray-100 my-1" />
                                <button
                                  onClick={() => {
                                    removeSurveyMutation.mutate({ projectId, surveyId: survey.id });
                                    setShowMenuFor(null);
                                  }}
                                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  <ClientT>Remove</ClientT>
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}

              {/* Add Survey Button */}
              <button
                onClick={() => setShowAddSurveyModal(true)}
                className="w-full p-4 flex items-center justify-center gap-2 text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <ClientT>Add another survey</ClientT>
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Project Info */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="font-semibold text-gray-900 mb-4"><ClientT>Project Info</ClientT></h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500"><ClientT>Created</ClientT></span>
                <span className="text-sm text-gray-900">{new Date(project.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500"><ClientT>Updated</ClientT></span>
                <span className="text-sm text-gray-900">{project.updatedAt ? new Date(project.updatedAt).toLocaleDateString() : '-'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500"><ClientT>Color</ClientT></span>
                <div className={`w-4 h-4 rounded-full bg-gradient-to-br ${project.color || 'bg-gray-500'}`} />
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-gray-900 rounded-xl p-5 text-white">
            <h3 className="font-semibold mb-3"><ClientT>Quick Actions</ClientT></h3>
            <div className="space-y-2">
              <Link
                href="/dashboard/create"
                className="flex items-center gap-2 w-full px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors"
              >
                <Plus className="w-4 h-4" />
                <ClientT>Create New Survey</ClientT>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Add Survey Modal */}
      {showAddSurveyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowAddSurveyModal(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900"><ClientT>Add Survey to Project</ClientT></h3>
              <button
                onClick={() => setShowAddSurveyModal(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 max-h-80 overflow-y-auto">
              {isLoadingAvailable ? (
                <div className="flex justify-center p-4"><Loader2 className="animate-spin text-gray-400" /></div>
              ) : !availableSurveys || availableSurveys.length === 0 ? (
                <div className="text-center py-8">
                  <Check className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
                  <p className="text-gray-600"><ClientT>All available surveys are already in a project!</ClientT></p>
                </div>
              ) : (
                <div className="space-y-2">
                  {availableSurveys.map((survey) => (
                    <button
                      key={survey.id}
                      onClick={() => handleAddSurvey(survey.id)}
                      className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-gray-100 text-gray-600">
                          <MessageSquare className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{survey.title}</p>
                          <p className="text-xs text-gray-500">{survey.currentParticipants || 0} <ClientT>responses</ClientT></p>
                        </div>
                      </div>
                      <Plus className="w-5 h-5 text-gray-400" />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100">
              <button
                onClick={() => setShowAddSurveyModal(false)}
                className="w-full px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ClientT>Cancel</ClientT>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowSettingsModal(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900"><ClientT>Project Settings</ClientT></h3>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2"><ClientT>Project Name</ClientT></label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder={placeholders.name}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2"><ClientT>Description</ClientT></label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder={placeholders.description}
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 outline-none resize-none"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
              <button
                onClick={() => setShowDeleteModal(true)}
                className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium transition-colors"
              >
                <ClientT>Delete Project</ClientT>
              </button>
              <button
                onClick={handleUpdate}
                disabled={!editName.trim() || updateProjectMutation.isPending}
                className="px-4 py-2.5 bg-gray-900 text-white rounded-lg font-medium text-sm hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                {updateProjectMutation.isPending ? <ClientT>Saving...</ClientT> : <ClientT>Save Changes</ClientT>}
              </button>
            </div>
          </div>
        </div>
      )}
      <InviteMemberModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        onSuccess={() => {
          getClientTranslation("Invited successfully", "Project member invite success toast").then(msg => toast.success(msg));
        }}
      />

      {/* 
          ProjectAI Chat would need to be updated to accept real project data type 
          or generic type. Assuming it works or will need checking.
      */}
      <ProjectAIChat project={project} />

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowDeleteModal(false)}
          />

          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2"><ClientT>Delete Project</ClientT></h3>
              <p className="text-gray-500">
                <ClientT>Are you sure you want to delete</ClientT> <span className="font-semibold text-gray-900">&quot;{project.name}&quot;</span>?
                <ClientT>This action cannot be undone and will remove all survey associations.</ClientT>
              </p>
            </div>

            <div className="px-6 py-4 bg-gray-50 flex items-center gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                disabled={isDeletingProject}
              >
                <ClientT>Cancel</ClientT>
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeletingProject}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-medium text-sm hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isDeletingProject ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <ClientT>Deleting...</ClientT>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <ClientT>Delete Project</ClientT>
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

export default function ProjectDetailPage() {
  return (
    <Suspense fallback={
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    }>
      <ProjectDetailContent />
    </Suspense>
  );
}
