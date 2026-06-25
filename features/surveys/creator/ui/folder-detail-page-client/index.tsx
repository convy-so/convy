"use client";

import { useState, type ReactNode } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Check,
  Clock,
  ExternalLink,
  FolderOpen,
  Loader2,
  MessageSquare,
  MoreVertical,
  Plus,
  Settings,
  Trash2,
  TrendingUp,
  Users,
  X,
} from "lucide-react";

import { Link, useRouter } from "@/i18n/routing";
import { cn } from "@/shared/ui/tailwind-class-utils";
import { FolderAIChat } from "@/features/surveys/creator/ui/folder-ai-chat";
import {
  useAddSurveyToFolder,
  useDeleteFolder,
  useRemoveSurveyFromFolder,
  useUpdateFolder,
} from "@/features/surveys/creator/client/folder-mutations";

type FolderSurveyDetail = {
  id: string;
  title: string | null;
  status: string;
  currentParticipants: number;
  createdAt: string | Date;
  completedCount: number;
};

type FolderDetail = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  createdAt: string | Date;
  updatedAt: string | Date | null;
  canEditMetadata: boolean;
  canOrganizeSurveys: boolean;
  canDelete: boolean;
  surveys: FolderSurveyDetail[];
};

type AvailableSurvey = {
  id: string;
  title: string | null;
  currentParticipants: number;
  isVoice: boolean;
};

export function FolderDetailPageClient({
  initialFolder,
  initialAvailableSurveys,
}: {
  initialFolder: FolderDetail;
  initialAvailableSurveys: AvailableSurvey[];
}) {
  const router = useRouter();
  const updateFolderMutation = useUpdateFolder();
  const deleteFolderMutation = useDeleteFolder();
  const removeSurveyMutation = useRemoveSurveyFromFolder();
  const addSurveyMutation = useAddSurveyToFolder();

  const [showAddSurveyModal, setShowAddSurveyModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showMenuFor, setShowMenuFor] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeletingFolder, setIsDeletingFolder] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const totalStarted = initialFolder.surveys.reduce(
    (sum, survey) => sum + survey.currentParticipants,
    0,
  );
  const totalCompleted = initialFolder.surveys.reduce(
    (sum, survey) => sum + survey.completedCount,
    0,
  );

  const stats = {
    totalSurveys: initialFolder.surveys.length,
    totalResponses: totalStarted,
    avgCompletion:
      totalStarted > 0 ? Math.round((totalCompleted / totalStarted) * 100) : 0,
    activeSurveys: initialFolder.surveys.filter((survey) => survey.status === "active")
      .length,
  };

  const handleDelete = () => {
    setIsDeletingFolder(true);
    deleteFolderMutation.mutate(initialFolder.id, {
      onSuccess: () => {
        router.push("/dashboard/folders");
        router.refresh();
      },
      onSettled: () => {
        setIsDeletingFolder(false);
        setShowDeleteModal(false);
      },
    });
  };

  const handleUpdate = () => {
    updateFolderMutation.mutate(
      {
        id: initialFolder.id,
        name: editName,
        description: editDescription,
      },
      {
        onSuccess: () => {
          setShowSettingsModal(false);
          router.refresh();
        },
      },
    );
  };

  const openSettings = () => {
    setEditName(initialFolder.name);
    setEditDescription(initialFolder.description || "");
    setShowSettingsModal(true);
  };

  const handleAddSurvey = (surveyId: string) => {
    addSurveyMutation.mutate(
      { folderId: initialFolder.id, surveyId },
      {
        onSuccess: () => {
          setShowAddSurveyModal(false);
          router.refresh();
        },
      },
    );
  };

  const handleRemoveSurvey = (surveyId: string) => {
    removeSurveyMutation.mutate(
      { folderId: initialFolder.id, surveyId },
      {
        onSuccess: () => {
          setShowMenuFor(null);
          router.refresh();
        },
      },
    );
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="rounded-2xl border border-gray-100 bg-white p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard/folders"
              className="rounded-lg p-2 transition-colors hover:bg-gray-100"
            >
              <ArrowLeft className="h-5 w-5 text-gray-600" />
            </Link>
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${
                  initialFolder.color || "from-gray-500 to-gray-600"
                }`}
              >
                <FolderOpen className="h-5 w-5 text-white" />
              </div>
              <h1 className="text-xl font-bold text-gray-900">
                {initialFolder.name}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {initialFolder.canEditMetadata ? (
              <button
                onClick={openSettings}
                className="flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
              >
                <Settings className="h-4 w-4" />
                Settings
              </button>
            ) : null}
            {initialFolder.canOrganizeSurveys ? (
              <button
                onClick={() => setShowAddSurveyModal(true)}
                className="flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800"
              >
                <Plus className="h-4 w-4" />
                Add survey
              </button>
            ) : null}
          </div>
        </div>
        {initialFolder.description ? (
          <p className="ml-16 mt-3 max-w-2xl text-sm text-gray-500">
            {initialFolder.description}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard icon={<MessageSquare className="h-4 w-4" />} label="Surveys" value={stats.totalSurveys} />
        <StatCard icon={<Users className="h-4 w-4" />} label="Responses" value={stats.totalResponses} />
        <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Avg. completion" value={`${stats.avgCompletion}%`} />
        <StatCard icon={<Clock className="h-4 w-4" />} label="Active" value={stats.activeSurveys} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="overflow-hidden rounded-xl border border-gray-100 bg-white">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h2 className="font-semibold text-gray-900">Surveys in folder</h2>
              <span className="text-sm text-gray-500">
                {initialFolder.surveys.length} surveys
              </span>
            </div>
            <div className="divide-y divide-gray-50">
              {initialFolder.surveys.length === 0 ? (
                <div className="bg-gray-50/30 p-8 text-center">
                  <MessageSquare className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                  <p className="mb-2 text-gray-500">No surveys yet</p>
                  {initialFolder.canOrganizeSurveys ? (
                    <button
                      onClick={() => setShowAddSurveyModal(true)}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      Add your first survey
                    </button>
                  ) : null}
                </div>
              ) : (
                initialFolder.surveys.map((survey) => (
                  <div
                    key={survey.id}
                    className="p-4 transition-colors hover:bg-gray-50/50"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                          <MessageSquare className="h-5 w-5" />
                        </div>
                        <div>
                          <Link
                            href={`/dashboard/surveys/${survey.id}`}
                            className="font-medium text-gray-900 transition-colors hover:text-blue-600"
                          >
                            {survey.title ?? "Untitled Survey"}
                          </Link>
                          <div className="mt-1 flex items-center gap-3 text-sm text-gray-500">
                            <span>{survey.currentParticipants || 0} responses</span>
                            <span>•</span>
                            <span>
                              Created{" "}
                              {formatDistanceToNow(new Date(survey.createdAt), {
                                addSuffix: true,
                              })}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                            survey.status === "active" &&
                              "bg-emerald-50 text-emerald-700",
                            survey.status === "draft" &&
                              "bg-amber-50 text-amber-700",
                            survey.status === "completed" &&
                              "bg-gray-100 text-gray-600",
                          )}
                        >
                          {survey.status === "active"
                            ? "Active"
                            : survey.status === "completed"
                              ? "Completed"
                              : "Draft"}
                        </span>

                        <div className="relative">
                          <button
                            onClick={() =>
                              setShowMenuFor(
                                showMenuFor === survey.id ? null : survey.id,
                              )
                            }
                            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>

                          {showMenuFor === survey.id ? (
                            <>
                              <div
                                className="fixed inset-0 z-40"
                                onClick={() => setShowMenuFor(null)}
                              />
                              <div className="absolute right-0 top-full z-50 mt-1 w-40 rounded-xl border border-gray-200 bg-white py-1 shadow-xl">
                                <Link
                                  href={`/dashboard/surveys/${survey.id}`}
                                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                  View survey
                                </Link>
                                <Link
                                  href={`/dashboard/surveys/${survey.id}?tab=analytics`}
                                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                >
                                  <BarChart3 className="h-4 w-4" />
                                  Analytics
                                </Link>
                                {initialFolder.canOrganizeSurveys ? (
                                  <>
                                    <div className="my-1 border-t border-gray-100" />
                                    <button
                                      onClick={() => handleRemoveSurvey(survey.id)}
                                      className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                      Remove
                                    </button>
                                  </>
                                ) : null}
                              </div>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}

              {initialFolder.canOrganizeSurveys ? (
                <button
                  onClick={() => setShowAddSurveyModal(true)}
                  className="flex w-full items-center justify-center gap-2 p-4 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
                >
                  <Plus className="h-4 w-4" />
                  Add another survey
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-gray-100 bg-white p-5">
            <h3 className="mb-4 font-semibold text-gray-900">Folder info</h3>
            <div className="space-y-3">
              <InfoRow
                label="Created"
                value={new Date(initialFolder.createdAt).toLocaleDateString()}
              />
              <InfoRow
                label="Updated"
                value={
                  initialFolder.updatedAt
                    ? new Date(initialFolder.updatedAt).toLocaleDateString()
                    : "-"
                }
              />
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Color</span>
                <div
                  className={`h-4 w-4 rounded-full bg-gradient-to-br ${
                    initialFolder.color || "bg-gray-500"
                  }`}
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-gray-900 p-5 text-white">
            <h3 className="mb-3 font-semibold">Quick actions</h3>
            <div className="space-y-2">
              <Link
                href="/dashboard/create"
                className="flex w-full items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm transition-colors hover:bg-white/20"
              >
                <Plus className="h-4 w-4" />
                Create new survey
              </Link>
            </div>
          </div>
        </div>
      </div>

      <FolderAIChat
        folder={{
          name: initialFolder.name,
          surveys: initialFolder.surveys.map((survey) => ({ id: survey.id })),
          stats: {
            totalSurveys: stats.totalSurveys,
            totalResponses: stats.totalResponses,
            avgCompletion: stats.avgCompletion,
          },
        }}
      />

      {showAddSurveyModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowAddSurveyModal(false)}
          />
          <div className="relative mx-4 w-full max-w-md animate-in zoom-in-95 rounded-2xl bg-white shadow-2xl duration-200">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Add survey to folder
              </h3>
              <button
                onClick={() => setShowAddSurveyModal(false)}
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto p-4">
              {initialAvailableSurveys.length === 0 ? (
                <div className="py-8 text-center">
                  <Check className="mx-auto mb-3 h-10 w-10 text-emerald-500" />
                  <p className="text-gray-600">
                    All available surveys are already in a folder.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {initialAvailableSurveys.map((survey) => (
                    <button
                      key={survey.id}
                      onClick={() => handleAddSurvey(survey.id)}
                      className="flex w-full items-center justify-between rounded-xl bg-gray-50 p-3 text-left transition-colors hover:bg-gray-100"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
                          <MessageSquare className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {survey.title ?? "Untitled Survey"}
                          </p>
                          <p className="text-xs text-gray-500">
                            {survey.currentParticipants || 0} responses
                          </p>
                        </div>
                      </div>
                      {addSurveyMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                      ) : (
                        <Plus className="h-5 w-5 text-gray-400" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="border-t border-gray-100 px-6 py-4">
              <button
                onClick={() => setShowAddSurveyModal(false)}
                className="w-full rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showSettingsModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowSettingsModal(false)}
          />
          <div className="relative mx-4 w-full max-w-md animate-in zoom-in-95 rounded-2xl bg-white shadow-2xl duration-200">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Folder settings
              </h3>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-6">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Folder name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  placeholder="e.g. Q4 User Research"
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-gray-300 focus:ring-2 focus:ring-gray-900/10"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Description
                </label>
                <textarea
                  value={editDescription}
                  onChange={(event) => setEditDescription(event.target.value)}
                  placeholder="Describe the objective of this folder..."
                  rows={3}
                  className="w-full resize-none rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-gray-300 focus:ring-2 focus:ring-gray-900/10"
                />
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4">
              <button
                onClick={() => setShowDeleteModal(true)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
              >
                Delete folder
              </button>
              <button
                onClick={handleUpdate}
                disabled={!editName.trim() || updateFolderMutation.isPending}
                className="rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
              >
                {updateFolderMutation.isPending ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showDeleteModal ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowDeleteModal(false)}
          />
          <div className="relative mx-4 w-full max-w-md animate-in zoom-in-95 overflow-hidden rounded-2xl bg-white shadow-2xl duration-200">
            <div className="p-6 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                <AlertTriangle className="h-8 w-8 text-red-600" />
              </div>
              <h3 className="mb-2 text-xl font-bold text-gray-900">
                Delete folder
              </h3>
              <p className="text-gray-500">
                Are you sure you want to delete{" "}
                <span className="font-semibold text-gray-900">
                  “{initialFolder.name}”
                </span>
                ? This action cannot be undone and will remove all survey
                associations.
              </p>
            </div>
            <div className="flex items-center gap-3 bg-gray-50 px-6 py-4">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                disabled={isDeletingFolder}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeletingFolder}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {isDeletingFolder ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Delete folder
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4">
      <div className="mb-2 flex items-center gap-2 text-gray-500">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm text-gray-900">{value}</span>
    </div>
  );
}
