"use client";

import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  BarChart3,
  Check,
  ChevronRight,
  Edit,
  ExternalLink,
  FolderOpen,
  Loader2,
  MessageSquare,
  Mic,
  MoreVertical,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Link, useRouter } from "@/i18n/routing";
import { cn } from "@/shared/ui/tailwind-class-utils";
import {
  useAddSurveyToFolder,
  useCreateFolder,
  useDeleteFolder,
  useRemoveSurveyFromFolder,
  useUpdateFolder,
} from "@/features/surveys/creator/client/folder-mutations";
import { FolderFormModal } from "./folder-form-modal";

type FolderSurveySummary = {
  id: string;
  title: string | null;
  status: string;
  currentParticipants: number;
  isVoice: boolean;
  createdAt: string | Date;
};

type FolderListItem = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  createdAt: string | Date;
  surveyCount: number;
  totalResponses: number;
  canEditMetadata: boolean;
  canOrganizeSurveys: boolean;
  canDelete: boolean;
  surveys: FolderSurveySummary[];
};

type AvailableSurvey = {
  id: string;
  title: string | null;
  currentParticipants: number;
  isVoice: boolean;
};

export function FoldersPageClient({
  initialFolders,
  initialAvailableSurveys,
}: {
  initialFolders: FolderListItem[];
  initialAvailableSurveys: AvailableSurvey[];
}) {
  const router = useRouter();
  const t = useTranslations("ProjectsPage");
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderDescription, setNewFolderDescription] = useState("");
  const [expandedFolder, setExpandedFolder] = useState<string | null>(null);
  const [showMenuFor, setShowMenuFor] = useState<string | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<{ id: string; name: string } | null>(null);
  const [editingFolder, setEditingFolder] = useState<{
    id: string;
    name: string;
    description?: string | null;
  } | null>(null);
  const [showAddSurveyModal, setShowAddSurveyModal] = useState<string | null>(null);

  const createFolderMutation = useCreateFolder();
  const updateFolderMutation = useUpdateFolder();
  const deleteFolderMutation = useDeleteFolder();
  const addSurveyMutation = useAddSurveyToFolder();
  const removeSurveyMutation = useRemoveSurveyFromFolder();

  const filteredFolders = useMemo(
    () =>
      initialFolders.filter((folder) =>
        folder.name.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [initialFolders, searchQuery],
  );

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;

    const colors = [
      "from-blue-500 to-cyan-500",
      "from-purple-500 to-pink-500",
      "from-amber-500 to-orange-500",
      "from-emerald-500 to-teal-500",
      "from-rose-500 to-red-500",
    ];

    createFolderMutation.mutate(
      {
        name: newFolderName,
        description: newFolderDescription,
        color: colors[Math.floor(Math.random() * colors.length)],
      },
      {
        onSuccess: () => {
          setNewFolderName("");
          setNewFolderDescription("");
          setShowCreateModal(false);
          router.refresh();
        },
      },
    );
  };

  const confirmDeleteFolder = () => {
    if (!folderToDelete) return;

    deleteFolderMutation.mutate(folderToDelete.id, {
      onSuccess: () => {
        setFolderToDelete(null);
        router.refresh();
      },
    });
  };

  const handleUpdateFolder = () => {
    if (!editingFolder || !editingFolder.name.trim()) return;

    updateFolderMutation.mutate(
      {
        id: editingFolder.id,
        name: editingFolder.name,
        description: editingFolder.description || undefined,
      },
      {
        onSuccess: () => {
          setEditingFolder(null);
          router.refresh();
        },
      },
    );
  };

  const handleAddSurvey = (folderId: string, surveyId: string) => {
    addSurveyMutation.mutate(
      { folderId, surveyId },
      {
        onSuccess: () => {
          setShowAddSurveyModal(null);
          router.refresh();
        },
      },
    );
  };

  const handleRemoveSurvey = (folderId: string, surveyId: string) => {
    removeSurveyMutation.mutate(
      { folderId, surveyId },
      {
        onSuccess: () => {
          router.refresh();
        },
      },
    );
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            {t("Header.Title")}
          </h1>
          <p className="mt-1 text-gray-500">{t("Header.Description")}</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-5 py-3 font-medium text-white transition-colors hover:bg-gray-800"
        >
          <Plus className="h-5 w-5" />
          {t("Header.CreateButton")}
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder={t("Search.Placeholder")}
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-11 pr-4 outline-none transition-all focus:border-gray-300 focus:ring-2 focus:ring-gray-900/10"
        />
      </div>

      <div className="space-y-4">
        {filteredFolders.map((folder) => (
          <div
            key={folder.id}
            className="rounded-2xl border border-gray-100 bg-white transition-all duration-300 hover:border-gray-200"
          >
            <div
              className="cursor-pointer p-5"
              onClick={() =>
                setExpandedFolder(
                  expandedFolder === folder.id ? null : folder.id,
                )
              }
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${
                      folder.color || "from-gray-500 to-gray-600"
                    }`}
                  >
                    <FolderOpen className="h-6 w-6 text-white" />
                  </div>

                  <div>
                    <Link
                      href={`/dashboard/folders/${folder.id}`}
                      className="text-lg font-semibold text-gray-900 transition-colors hover:text-blue-600"
                    >
                      {folder.name}
                    </Link>
                    {folder.description ? (
                      <p className="mt-0.5 text-sm text-gray-500">
                        {folder.description}
                      </p>
                    ) : null}
                    <div className="mt-2 flex items-center gap-4 text-sm text-gray-500">
                      <span className="flex items-center gap-1.5">
                        <MessageSquare className="h-4 w-4" />
                        {folder.surveyCount} {t("Card.Surveys")}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <BarChart3 className="h-4 w-4" />
                        {folder.totalResponses} {t("Card.Responses")}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatDistanceToNow(new Date(folder.createdAt), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <ChevronRight
                    className={cn(
                      "h-5 w-5 text-gray-400 transition-transform",
                      expandedFolder === folder.id && "rotate-90",
                    )}
                  />

                  <div
                    className="relative"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <button
                      onClick={() =>
                        setShowMenuFor(
                          showMenuFor === folder.id ? null : folder.id,
                        )
                      }
                      className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>

                    {showMenuFor === folder.id ? (
                      <>
                        <div
                          className="fixed inset-0 z-[80]"
                          onClick={() => setShowMenuFor(null)}
                        />
                        <div className="absolute right-0 top-full z-[90] mt-1 w-44 rounded-xl border border-gray-200 bg-white py-1 shadow-xl">
                          <Link
                            href={`/dashboard/folders/${folder.id}`}
                            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            onClick={() => setShowMenuFor(null)}
                          >
                            <ExternalLink className="h-4 w-4" />
                            {t("Card.Menu.ViewDetails")}
                          </Link>
                          {folder.canOrganizeSurveys ? (
                            <button
                              onClick={() => {
                                setShowAddSurveyModal(folder.id);
                                setShowMenuFor(null);
                              }}
                              className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              <Plus className="h-4 w-4" />
                              {t("Card.Menu.AddSurvey")}
                            </button>
                          ) : null}
                          {folder.canEditMetadata ? (
                            <button
                              onClick={() => {
                                setEditingFolder({
                                  id: folder.id,
                                  name: folder.name,
                                  description: folder.description,
                                });
                                setShowMenuFor(null);
                              }}
                              className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              <Edit className="h-4 w-4" />
                              {t("Card.Menu.Edit")}
                            </button>
                          ) : null}
                          {folder.canDelete ? (
                            <>
                              <div className="my-1 border-t border-gray-100" />
                              <button
                                onClick={() => {
                                  setFolderToDelete({
                                    id: folder.id,
                                    name: folder.name,
                                  });
                                  setShowMenuFor(null);
                                }}
                                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                                {t("Card.Menu.Delete")}
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

            {expandedFolder === folder.id ? (
              <div className="border-t border-gray-100 bg-gray-50/50">
                {folder.surveys.length === 0 ? (
                  <div className="p-8 text-center">
                    <MessageSquare className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                    <p className="mb-3 text-gray-500">
                      {t("ProjectSurveys.Empty.Description")}
                    </p>
                    <button
                      onClick={() => setShowAddSurveyModal(folder.id)}
                      className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
                    >
                      <Plus className="h-4 w-4" />
                      {t("ProjectSurveys.Empty.Button")}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2 p-4">
                    {folder.surveys.map((survey) => (
                      <div
                        key={survey.id}
                        className="flex items-center justify-between rounded-xl border border-gray-100 bg-white p-3"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              "flex h-9 w-9 items-center justify-center rounded-lg",
                              survey.isVoice
                                ? "bg-purple-100 text-purple-600"
                                : "bg-blue-100 text-blue-600",
                            )}
                          >
                            {survey.isVoice ? (
                              <Mic className="h-4 w-4" />
                            ) : (
                              <MessageSquare className="h-4 w-4" />
                            )}
                          </div>
                          <div>
                            <Link
                              href={`/dashboard/surveys/${survey.id}`}
                              className="text-sm font-medium text-gray-900 transition-colors hover:text-blue-600"
                            >
                              {survey.title ?? "Untitled Survey"}
                            </Link>
                            <p className="text-xs text-gray-500">
                              {survey.currentParticipants} {t("Card.Responses")}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-xs font-medium",
                              survey.status === "active" &&
                                "bg-emerald-50 text-emerald-600",
                              survey.status === "draft" &&
                                "bg-amber-50 text-amber-600",
                              survey.status === "completed" &&
                                "bg-gray-100 text-gray-600",
                            )}
                          >
                            {survey.status === "active"
                              ? t("SurveyStatus.Active")
                              : survey.status === "completed"
                                ? t("SurveyStatus.Completed")
                                : t("SurveyStatus.Draft")}
                          </span>
                          <button
                            onClick={() =>
                              handleRemoveSurvey(folder.id, survey.id)
                            }
                            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                    <button
                      onClick={() => setShowAddSurveyModal(folder.id)}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 p-3 text-sm text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-700"
                    >
                      <Plus className="h-4 w-4" />
                      {t("ProjectSurveys.AddAnother")}
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ))}

        <button
          onClick={() => setShowCreateModal(true)}
          className="group flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 p-8 text-center transition-all hover:border-gray-300 hover:bg-gray-100/50"
        >
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gray-200 transition-transform group-hover:scale-110">
            <Plus className="h-6 w-6 text-gray-500" />
          </div>
          <p className="font-medium text-gray-700">
            {t("Empty.CreateNew.Title")}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            {t("Empty.CreateNew.Description")}
          </p>
        </button>
      </div>

      {filteredFolders.length === 0 && searchQuery ? (
        <div className="py-12 text-center">
          <FolderOpen className="mx-auto mb-4 h-12 w-12 text-gray-300" />
          <p className="text-gray-500">{t("Empty.NoMatching")}</p>
        </div>
      ) : null}

      <FolderFormModal
        open={showCreateModal}
        title={t("CreateModal.Title")}
        nameLabel={t("CreateModal.NameLabel")}
        namePlaceholder={t("CreateModal.NamePlaceholder")}
        descriptionLabel={t("CreateModal.DescriptionLabel")}
        descriptionPlaceholder={t("CreateModal.DescriptionPlaceholder")}
        confirmLabel={t("CreateModal.Confirm")}
        pendingLabel={t("CreateModal.Creating")}
        cancelLabel={t("CreateModal.Cancel")}
        name={newFolderName}
        description={newFolderDescription}
        isPending={createFolderMutation.isPending}
        onClose={() => setShowCreateModal(false)}
        onNameChange={setNewFolderName}
        onDescriptionChange={setNewFolderDescription}
        onSubmit={handleCreateFolder}
      />

      <FolderFormModal
        open={Boolean(editingFolder)}
        title={t("EditModal.Title")}
        nameLabel={t("EditModal.NameLabel")}
        namePlaceholder={t("EditModal.NamePlaceholder")}
        descriptionLabel={t("EditModal.DescriptionLabel")}
        descriptionPlaceholder={t("EditModal.DescriptionPlaceholder")}
        confirmLabel={t("EditModal.Confirm")}
        cancelLabel={t("EditModal.Cancel")}
        name={editingFolder?.name || ""}
        description={editingFolder?.description || ""}
        isPending={updateFolderMutation.isPending}
        onClose={() => setEditingFolder(null)}
        onNameChange={(value) =>
          setEditingFolder((current) =>
            current
              ? {
                  ...current,
                  name: value,
                }
              : current,
          )
        }
        onDescriptionChange={(value) =>
          setEditingFolder((current) =>
            current
              ? {
                  ...current,
                  description: value,
                }
              : current,
          )
        }
        onSubmit={handleUpdateFolder}
      />

      {showAddSurveyModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowAddSurveyModal(null)}
          />
          <div className="relative mx-4 w-full max-w-md animate-in zoom-in-95 rounded-2xl bg-white shadow-2xl duration-200">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {t("AddSurveyModal.Title")}
              </h3>
              <button
                onClick={() => setShowAddSurveyModal(null)}
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto p-4">
              {initialAvailableSurveys.length === 0 ? (
                <div className="py-8 text-center">
                  <Check className="mx-auto mb-3 h-10 w-10 text-emerald-500" />
                  <p className="text-gray-600">{t("AddSurveyModal.Empty")}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {initialAvailableSurveys.map((survey) => (
                    <button
                      key={survey.id}
                      onClick={() =>
                        handleAddSurvey(showAddSurveyModal, survey.id)
                      }
                      className="flex w-full items-center justify-between rounded-xl bg-gray-50 p-3 text-left transition-colors hover:bg-gray-100"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "flex h-9 w-9 items-center justify-center rounded-lg",
                            survey.isVoice
                              ? "bg-purple-100 text-purple-600"
                              : "bg-blue-100 text-blue-600",
                          )}
                        >
                          {survey.isVoice ? (
                            <Mic className="h-4 w-4" />
                          ) : (
                            <MessageSquare className="h-4 w-4" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {survey.title ?? "Untitled Survey"}
                          </p>
                          <p className="text-xs text-gray-500">
                            {survey.currentParticipants} {t("Card.Responses")}
                          </p>
                        </div>
                      </div>
                      {addSurveyMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
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
                onClick={() => setShowAddSurveyModal(null)}
                className="w-full rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
              >
                {t("AddSurveyModal.Cancel")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {folderToDelete ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setFolderToDelete(null)}
          />
          <div className="relative mx-4 w-full max-w-md animate-in zoom-in-95 overflow-hidden rounded-2xl bg-white shadow-2xl duration-200">
            <div className="p-6 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                <AlertTriangle className="h-8 w-8 text-red-600" />
              </div>
              <h3 className="mb-2 text-xl font-bold text-gray-900">
                {t("DeleteModal.Title")}
              </h3>
              <p className="text-gray-500">{t("DeleteModal.Description")}</p>
            </div>
            <div className="flex items-center gap-3 bg-gray-50 px-6 py-4">
              <button
                onClick={() => setFolderToDelete(null)}
                className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                {t("DeleteModal.Cancel")}
              </button>
              <button
                onClick={confirmDeleteFolder}
                disabled={deleteFolderMutation.isPending}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {deleteFolderMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("DeleteModal.Deleting")}
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    {t("DeleteModal.Confirm")}
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
