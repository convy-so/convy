"use client";

import { useState} from "react";
import { Link } from "@/i18n/routing";
import {
  FolderOpen,
  Plus,
  MoreVertical,
  MessageSquare,
  BarChart3,
  Trash2,
  Edit,
  X,
  Loader2,
  Search,
  ChevronRight,
  Check,
  Mic,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useFolders,
  useCreateFolder,
  useUpdateFolder,
  useDeleteFolder,
  useFolder,
  useAddSurveyToFolder,
  useRemoveSurveyFromFolder,
  useAvailableSurveys
} from "@/components/dashboard/folders/hooks";
import { formatDistanceToNow } from "date-fns";
import { useTranslations } from "next-intl";

export default function FoldersPage() {
  const t = useTranslations("ProjectsPage");
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderDescription, setNewFolderDescription] = useState("");
  const [expandedFolder, setExpandedFolder] = useState<string | null>(null);
  const [showMenuFor, setShowMenuFor] = useState<string | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<{ id: string; name: string } | null>(null);
  const [editingFolder, setEditingFolder] = useState<{ id: string; name: string; description?: string | null } | null>(null);
  const [showAddSurveyModal, setShowAddSurveyModal] = useState<string | null>(null);

  const { data: folders = [], isLoading: isLoadingFolders } = useFolders();
  const createFolderMutation = useCreateFolder();
  const updateFolderMutation = useUpdateFolder();
  const deleteFolderMutation = useDeleteFolder();

  const filteredFolders = folders.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;

    const colors = [
      "from-blue-500 to-cyan-500",
      "from-purple-500 to-pink-500",
      "from-amber-500 to-orange-500",
      "from-emerald-500 to-teal-500",
      "from-rose-500 to-red-500",
    ];

    createFolderMutation.mutate({
      name: newFolderName,
      description: newFolderDescription,
      color: colors[Math.floor(Math.random() * colors.length)]
    }, {
      onSuccess: () => {
        setNewFolderName("");
        setNewFolderDescription("");
        setShowCreateModal(false);
      }
    });
  };

  const handleDeleteFolder = (folder: { id: string; name: string }) => {
    setFolderToDelete(folder);
    setShowMenuFor(null);
  };

  const confirmDeleteFolder = () => {
    if (folderToDelete) {
      deleteFolderMutation.mutate(folderToDelete.id, {
        onSuccess: () => {
          setFolderToDelete(null);
        }
      });
    }
  };

  const handleUpdateFolder = () => {
    if (!editingFolder || !editingFolder.name.trim()) return;
    updateFolderMutation.mutate({
      id: editingFolder.id,
      name: editingFolder.name,
      description: editingFolder.description || undefined
    }, {
      onSuccess: () => {
        setEditingFolder(null);
      }
    });
  };


  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{t("Header.Title")}</h1>
          <p className="text-gray-500 mt-1">
            {t("Header.Description")}
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center justify-center gap-2 px-5 py-3 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-colors"
        >
          <Plus className="w-5 h-5" />
          {t("Header.CreateButton")}
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder={t("Search.Placeholder")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-11 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 outline-none transition-all"
        />
      </div>

      {/* Folders List */}
      {isLoadingFolders ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="space-y-4">
          {filteredFolders.map((folder) => (
            <div
              key={folder.id}
              className="bg-white rounded-2xl border border-gray-100 hover:border-gray-200 transition-all duration-300 first:rounded-t-2xl last:rounded-b-2xl"
            >
              {/* Folder Header */}
              <div
                className="p-5 cursor-pointer"
                onClick={() => setExpandedFolder(expandedFolder === folder.id ? null : folder.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${folder.color || 'from-gray-500 to-gray-600'} flex items-center justify-center`}>
                      <FolderOpen className="w-6 h-6 text-white" />
                    </div>

                    <div>
                      <Link href={`/dashboard/folders/${folder.id}`} className="font-semibold text-gray-900 text-lg hover:text-blue-600 transition-colors">
                        {folder.name}
                      </Link>
                      {folder.description && (
                        <p className="text-sm text-gray-500 mt-0.5">{folder.description}</p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                        <span className="flex items-center gap-1.5">
                          <MessageSquare className="w-4 h-4" />
                          {folder.surveyCount} {t("Card.Surveys")}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <BarChart3 className="w-4 h-4" />
                          {folder.totalResponses} {t("Card.Responses")}
                        </span>
                        <span className="text-xs text-gray-400">
                          {formatDistanceToNow(new Date(folder.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <ChevronRight className={cn(
                      "w-5 h-5 text-gray-400 transition-transform",
                      expandedFolder === folder.id && "rotate-90"
                    )} />

                    <div className="relative" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setShowMenuFor(showMenuFor === folder.id ? null : folder.id)}
                        className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {showMenuFor === folder.id && (
                        <>
                          <div className="fixed inset-0 z-[80]" onClick={() => setShowMenuFor(null)} />
                          <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl border border-gray-200 shadow-xl z-[90] py-1">
                            <Link
                              href={`/dashboard/folders/${folder.id}`}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                              onClick={() => setShowMenuFor(null)}
                            >
                              <ExternalLink className="w-4 h-4" />
                              {t("Card.Menu.ViewDetails")}
                            </Link>
                            {folder.canOrganizeSurveys ? (
                              <button
                                onClick={() => {
                                  setShowAddSurveyModal(folder.id);
                                  setShowMenuFor(null);
                                }}
                                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                              >
                                <Plus className="w-4 h-4" />
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
                                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                              >
                                <Edit className="w-4 h-4" />
                                {t("Card.Menu.Edit")}
                              </button>
                            ) : null}
                            {folder.canDelete ? <div className="border-t border-gray-100 my-1" /> : null}
                            {folder.canDelete ? (
                              <button
                                onClick={() => handleDeleteFolder({ id: folder.id, name: folder.name })}
                                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                                {t("Card.Menu.Delete")}
                              </button>
                            ) : null}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Expanded Surveys List */}
              {expandedFolder === folder.id && (
                <FolderSurveysList folderId={folder.id} onAddSurvey={() => setShowAddSurveyModal(folder.id)} />
              )}
            </div>
          ))}

          {/* Create New Folder Card */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="w-full bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 p-8 flex flex-col items-center justify-center text-center hover:border-gray-300 hover:bg-gray-100/50 transition-all group"
          >
            <div className="w-12 h-12 rounded-xl bg-gray-200 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <Plus className="w-6 h-6 text-gray-500" />
            </div>
            <p className="font-medium text-gray-700">{t("Empty.CreateNew.Title")}</p>
            <p className="text-sm text-gray-500 mt-1">{t("Empty.CreateNew.Description")}</p>
          </button>
        </div>
      )}

      {/* Empty State */}
      {!isLoadingFolders && filteredFolders.length === 0 && searchQuery && (
        <div className="text-center py-12">
          <FolderOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">{t("Empty.NoMatching")}</p>
        </div>
      )}

      {/* Create Folder Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowCreateModal(false)}
          />

          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">{t("CreateModal.Title")}</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t("CreateModal.NameLabel")}
                </label>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder={t("CreateModal.NamePlaceholder")}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t("CreateModal.DescriptionLabel")}
                </label>
                <textarea
                  value={newFolderDescription}
                  onChange={(e) => setNewFolderDescription(e.target.value)}
                  placeholder={t("CreateModal.DescriptionPlaceholder")}
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all resize-none"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                {t("CreateModal.Cancel")}
              </button>
              <button
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim() || createFolderMutation.isPending}
                className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-lg font-medium text-sm hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                {createFolderMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t("CreateModal.Creating")}
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    {t("CreateModal.Confirm")}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Survey Modal */}
      {showAddSurveyModal && (
        <AddSurveyModal folderId={showAddSurveyModal} onClose={() => setShowAddSurveyModal(null)} />
      )}

      {/* Edit Folder Modal */}
      {editingFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setEditingFolder(null)}
          />

          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">{t("EditModal.Title")}</h3>
              <button
                onClick={() => setEditingFolder(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t("EditModal.NameLabel")}
                </label>
                <input
                  type="text"
                  value={editingFolder.name}
                  onChange={(e) => setEditingFolder({ ...editingFolder, name: e.target.value })}
                  placeholder={t("EditModal.NamePlaceholder")}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t("EditModal.DescriptionLabel")}
                </label>
                <textarea
                  value={editingFolder.description || ""}
                  onChange={(e) => setEditingFolder({ ...editingFolder, description: e.target.value })}
                  placeholder={t("EditModal.DescriptionPlaceholder")}
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all resize-none"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
              <button
                onClick={() => setEditingFolder(null)}
                className="px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                {t("EditModal.Cancel")}
              </button>
              <button
                onClick={handleUpdateFolder}
                disabled={!editingFolder.name.trim() || updateFolderMutation.isPending}
                className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-lg font-medium text-sm hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                {updateFolderMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {t("EditModal.Confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete Folder Modal */}
      {folderToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setFolderToDelete(null)}
          />

          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">{t("DeleteModal.Title")}</h3>
              <p className="text-gray-500">
                {t("DeleteModal.Description")}
              </p>
            </div>

            <div className="px-6 py-4 bg-gray-50 flex items-center gap-3">
              <button
                onClick={() => setFolderToDelete(null)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
              >
                {t("DeleteModal.Cancel")}
              </button>
              <button
                onClick={confirmDeleteFolder}
                disabled={deleteFolderMutation.isPending}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-medium text-sm hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleteFolderMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t("DeleteModal.Deleting")}
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    {t("DeleteModal.Confirm")}
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

function FolderSurveysList({ folderId, onAddSurvey }: { folderId: string; onAddSurvey: () => void }) {
  const { data: folder, isLoading } = useFolder(folderId);
  const removeSurveyMutation = useRemoveSurveyFromFolder();
  const t = useTranslations("ProjectsPage");

  if (isLoading) return <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>;

  // We expect the hook to return folder with surveys array
  const surveys = folder?.surveys || [];

  return (
    <div className="border-t border-gray-100 bg-gray-50/50">
      {surveys.length === 0 ? (
        <div className="p-8 text-center">
          <MessageSquare className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 mb-3">{t("ProjectSurveys.Empty.Description")}</p>
          <button
            onClick={onAddSurvey}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t("ProjectSurveys.Empty.Button")}
          </button>
        </div>
      ) : (
        <div className="p-4 space-y-2">
          {surveys.map((survey) => (
            <div
              key={survey.id}
              className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-100"
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-9 h-9 rounded-lg flex items-center justify-center",
                  survey.isVoice
                    ? "bg-purple-100 text-purple-600"
                    : "bg-blue-100 text-blue-600"
                )}>
                  {survey.isVoice ? <Mic className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
                </div>
                <div>
                  <Link href={`/dashboard/surveys/${survey.id}`} className="text-sm font-medium text-gray-900 hover:text-blue-600 transition-colors">
                    {survey.title}
                  </Link>
                  <p className="text-xs text-gray-500">{survey.currentParticipants} {t("Card.Responses")}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn(
                  "px-2 py-0.5 rounded-full text-xs font-medium",
                  survey.status === "active" && "bg-emerald-50 text-emerald-600",
                  survey.status === "draft" && "bg-amber-50 text-amber-600",
                  survey.status === "completed" && "bg-gray-100 text-gray-600"
                )}>
                  {survey.status === "active" ? t("SurveyStatus.Active") : survey.status === "completed" ? t("SurveyStatus.Completed") : t("SurveyStatus.Draft")}
                </span>
                <button
                  onClick={() => removeSurveyMutation.mutate({ folderId, surveyId: survey.id })}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          <button
            onClick={onAddSurvey}
            className="w-full flex items-center justify-center gap-2 p-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 hover:border-gray-300 hover:text-gray-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t("ProjectSurveys.AddAnother")}
          </button>
        </div>
      )}
    </div>
  );
}

function AddSurveyModal({ folderId, onClose }: { folderId: string; onClose: () => void }) {
  const { data: availableSurveys, isLoading } = useAvailableSurveys();
  const addSurveyMutation = useAddSurveyToFolder();
  const t = useTranslations("ProjectsPage");

  const handleAdd = (surveyId: string) => {
    addSurveyMutation.mutate({ folderId, surveyId }, {
      onSuccess: () => {
        onClose();
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">{t("AddSurveyModal.Title")}</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 max-h-80 overflow-y-auto">
          {isLoading ? (
            <div className="text-center py-8"><Loader2 className="w-8 h-8 animate-spin mx-auto" /></div>
          ) : !availableSurveys || availableSurveys.length === 0 ? (
            <div className="text-center py-8">
              <Check className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
              <p className="text-gray-600">{t("AddSurveyModal.Empty")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {availableSurveys.map((survey) => (
                <button
                  key={survey.id}
                  onClick={() => handleAdd(survey.id)}
                  className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-9 h-9 rounded-lg flex items-center justify-center",
                      survey.isVoice
                        ? "bg-purple-100 text-purple-600"
                        : "bg-blue-100 text-blue-600"
                    )}>
                      {survey.isVoice ? <Mic className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{survey.title}</p>
                      <p className="text-xs text-gray-500">{survey.currentParticipants} {t("Card.Responses")}</p>
                    </div>
                  </div>
                  {addSurveyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-5 h-5 text-gray-400" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {t("AddSurveyModal.Cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}



