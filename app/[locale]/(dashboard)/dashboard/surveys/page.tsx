"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "@/i18n/routing";
import { Suspense } from "react";

import {
  Plus,
  Search,
  Eye,
  Edit,
  Trash2,
  Copy,
  BarChart3,
  MessageSquare,
  MoreVertical,
  Clock,
  Loader2,
  Check,
  Link as LinkIcon,
  Globe,
  FileEdit,
  Sparkles,
  Play,
  AlertTriangle,
  Mic,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import { deleteSurveyAction, duplicateSurveyAction } from "@/app/actions/survey";
import { fetchSurveys } from "@/lib/api/surveys";
import { queryKeys } from "@/lib/query-keys";
import { useAuth } from "@/components/providers/auth-provider";

import { useTranslations } from "next-intl";
import { getClientTranslation } from "@/app/actions/translate";


interface Survey {
  id: string;
  title: string;
  expertState?: any;
  status: string;
  shareableLink?: string;
  responses: number;
  completionRate: number;
  createdAt: string;
  lastResponse: string;
  isOwner: boolean;
  isVoice: boolean;
  sharedBy?: string;
  role?: string;
}

type FilterTab = "all" | "published" | "unpublished";

function SurveysContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [showMenuFor, setShowMenuFor] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [surveyToDelete, setSurveyToDelete] = useState<{ id: string; title: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const t = useTranslations("SurveysPage");


  const { session } = useAuth();
  const activeOrgId = session?.activeOrganizationId || null;

  // Fetch surveys using React Query
  const { data: surveys = [], isLoading } = useQuery<Survey[]>({
    queryKey: queryKeys.surveys.all(activeOrgId),
    queryFn: fetchSurveys,
  });

  // Delete survey click handler
  const handleDelete = (survey: { id: string; title: string }) => {
    setSurveyToDelete(survey);
    setShowMenuFor(null);
  };

  // Confirm delete handler
  const confirmDeleteSurvey = async () => {
    if (!surveyToDelete) return;

    setIsDeleting(surveyToDelete.id);

    try {
      const result = await deleteSurveyAction(surveyToDelete.id);

      if (result.success) {
        queryClient.invalidateQueries({ queryKey: queryKeys.surveys.all(activeOrgId) });
        toast.success(t("Card.Toasts.Deleted") || "Survey deleted successfully.");
        setSurveyToDelete(null);
      } else {
        toast.error(t("Card.Toasts.DeleteFailed") || "Failed to delete survey.");
      }
    } catch (error) {
      const errorMsg = await getClientTranslation("An error occurred while deleting.");
      toast.error(errorMsg);
    } finally {
      setIsDeleting(null);
    }
  };

  // Continue creating survey
  const handleContinue = (surveyId: string) => {
    setShowMenuFor(null);
    router.push(`/dashboard/create?surveyId=${surveyId}`);
  };

  // Duplicate survey
  const handleDuplicate = async (survey: Survey) => {
    setShowMenuFor(null);
    try {
      const result = await duplicateSurveyAction(survey.id);

      if (result.success) {
        toast.success(t("Card.Toasts.Duplicated") || "Survey duplicated successfully.");
        queryClient.invalidateQueries({ queryKey: queryKeys.surveys.all(activeOrgId) });
      } else {
        toast.error(t("Card.Toasts.DuplicateFailed") || "Failed to delete survey.");
      }
    } catch (error) {
      toast.error(t("Card.Toasts.DuplicateFailed") || "An error occurred during duplication.");
    }
  };

  const handleCopyLink = async (shareableLink: string) => {
    try {
      await navigator.clipboard.writeText(shareableLink);
      setCopiedLink(shareableLink);
      toast.success(t("Card.Toasts.LinkCopied") || "Link copied to clipboard!");
      setTimeout(() => setCopiedLink(null), 2000);
    } catch (error) {
      toast.error(t("Card.Toasts.CopyFailed") || "Failed to copy link.");
    }
  };

  // Computed counts
  const counts = useMemo(() => {
    const published = surveys.filter(s => s.status === "active").length;
    const unpublished = surveys.filter(s => s.status !== "active").length;
    return { all: surveys.length, published, unpublished };
  }, [surveys]);

  // Filtered surveys
  const filteredSurveys = useMemo(() => {
    let result = surveys;

    if (filterTab === "published") {
      result = result.filter(s => s.status === "active");
    } else if (filterTab === "unpublished") {
      result = result.filter(s => s.status !== "active");
    }

    if (searchQuery) {
      result = result.filter(s =>
        s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.expertState?.objective?.goal?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return result;
  }, [surveys, filterTab, searchQuery]);


  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{t("Header.Title")}</h1>
          <p className="text-gray-500 mt-1">{t("Header.Description")}</p>
        </div>
        <Link
          href="/dashboard/create"
          className="flex items-center justify-center gap-2 px-5 py-3 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
        >
          <Plus className="w-5 h-5" />
          {t("Header.CreateButton")}
        </Link>
      </div>

      {/* Filter Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-6">

          <button
            onClick={() => setFilterTab("all")}
            className={cn(
              "py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2",
              filterTab === "all" ? "border-gray-900 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            )}
          >
            <MessageSquare className="w-4 h-4" />
            {t("Tabs.All")}
            <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", filterTab === "all" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600")}>
              {counts.all}
            </span>
          </button>
          <button
            onClick={() => setFilterTab("published")}
            className={cn(
              "py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2",
              filterTab === "published" ? "border-gray-900 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            )}
          >
            <Globe className="w-4 h-4" />
            {t("Tabs.Published")}
            <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", filterTab === "published" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600")}>
              {counts.published}
            </span>
          </button>
          <button
            onClick={() => setFilterTab("unpublished")}
            className={cn(
              "py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2",
              filterTab === "unpublished" ? "border-gray-900 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            )}
          >
            <FileEdit className="w-4 h-4" />
            {t("Tabs.Unpublished")}
            <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", filterTab === "unpublished" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600")}>
              {counts.unpublished}
            </span>
          </button>
        </nav>
      </div>

      {/* Search Bar and Page Size */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex-1 w-full max-w-md relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder={t("Search.Placeholder")}
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 outline-none transition-all text-sm"
          />
        </div>

        <div className="flex items-center gap-4">
          <p className="hidden md:block text-sm text-gray-500 whitespace-nowrap">
            {t('Pagination.Showing', { 
              start: (currentPage - 1) * pageSize + 1, 
              end: Math.min(currentPage * pageSize, filteredSurveys.length), 
              total: filteredSurveys.length 
            })}
          </p>

          <div className="relative">
            <button
              onClick={() => setIsPageSizeOpen(!isPageSizeOpen)}
              className="flex items-center gap-2 px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all "
            >
              <span>{pageSize} {t('Pagination.PerPage')}</span>
              <ChevronDown className={cn("w-4 h-4 transition-transform", isPageSizeOpen && "rotate-180")} />
            </button>
            
            {isPageSizeOpen && (
              <>
                <div className="fixed inset-0 z-[60]" onClick={() => setIsPageSizeOpen(false)} />
                <div className="absolute top-full right-0 mt-2 w-40 bg-white rounded-xl border border-gray-100 shadow-xl z-[70] py-1.5 animate-in fade-in slide-in-from-top-2 duration-200 overflow-hidden">
                  {[10, 20, 50, 100].map((size) => (
                    <button
                      key={size}
                      onClick={() => handlePageSizeChange(size)}
                      className={cn(
                        "w-full text-left px-4 py-2 text-sm transition-colors hover:bg-gray-50",
                        pageSize === size ? "text-gray-900 font-semibold bg-gray-50" : "text-gray-600"
                      )}
                    >
                      {size} {t('Pagination.PerPage')}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400 mx-auto mb-3" />
            <p className="text-sm text-gray-500">{t("Loading")}</p>
          </div>
        </div>
      ) : (
        <>

          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {filteredSurveys.map((survey, index) => (
              <div
                key={survey.id}
                className={cn(
                  "group flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-gray-50/50 transition-colors",
                  index !== filteredSurveys.length - 1 ? "border-b border-gray-100" : ""
                )}
              >
                <div className="flex items-start sm:items-center gap-4 flex-1 min-w-0">
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105",
                    survey.status === 'active' ? "bg-emerald-50 text-emerald-600" :
                      survey.status === 'draft' ? "bg-amber-50 text-amber-600" :
                        survey.status === 'creating' ? "bg-blue-50 text-blue-600" :
                          "bg-gray-100 text-gray-600"
                  )}>
                    {survey.status === 'active' ? <Globe className="w-6 h-6" /> :
                      survey.status === 'draft' ? <FileEdit className="w-6 h-6" /> :
                        survey.status === 'creating' ? <Sparkles className="w-6 h-6" /> :
                          survey.status === 'completed' ? <Check className="w-6 h-6" /> :
                            <Clock className="w-6 h-6" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Link href={`/dashboard/surveys/${survey.id}`} className="block">
                        <h3 className="text-base font-semibold text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                          {survey.title}
                        </h3>
                      </Link>
                      {survey.isVoice && (
                        <div className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-50 text-indigo-600" title="Voice Survey">
                          <Mic className="w-3 h-3" />
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 truncate max-w-md">
                      {survey.expertState?.objective?.goal || "No description provided"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-6 mt-4 sm:mt-0 sm:ml-6 flex-shrink-0">
                  <div className="flex flex-col items-end min-w-[80px]">
                    <span className="text-sm font-medium text-gray-900">{survey.responses}</span>
                    <span className="text-xs text-gray-400">{t("Card.Responses")}</span>
                  </div>

                  <div className="hidden md:flex flex-col items-end min-w-[100px]">
                    <span className="text-sm font-medium text-gray-900">{survey.createdAt}</span>
                    <span className="text-xs text-gray-400">{t("Card.Created")}</span>
                  </div>

                  <div className={cn(
                    "px-2.5 py-1 rounded-full text-xs font-medium border hidden md:flex items-center gap-1.5",
                    survey.status === 'active' ? "bg-emerald-50 text-emerald-600 border-emerald-200" :
                      survey.status === 'draft' ? "bg-amber-50 text-amber-600 border-amber-200" :
                        "bg-gray-100 text-gray-600 border-gray-200"
                  )}>
                    {t(`Status.${survey.status === 'active' ? 'Published' : survey.status.charAt(0).toUpperCase() + survey.status.slice(1)}`)}
                  </div>

                  <div className="relative ml-2">
                    <button
                      onClick={() => setShowMenuFor(showMenuFor === survey.id ? null : survey.id)}
                      className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                      <MoreVertical className="w-5 h-5" />
                    </button>

                    {showMenuFor === survey.id && (
                      <>
                        <div className="fixed inset-0 z-[60]" onClick={() => setShowMenuFor(null)} />
                        <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl border border-gray-100 shadow-xl z-[70] py-1.5 animate-in fade-in zoom-in-95 duration-200">
                          {survey.status === "creating" && (
                            <>
                              <button
                                onClick={() => handleContinue(survey.id)}
                                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-emerald-600 hover:bg-emerald-50 font-medium"
                              >
                                <Play className="w-4 h-4" />
                                {t("Card.Menu.Continue")}
                              </button>
                              <div className="border-t border-gray-100 my-1" />
                            </>
                          )}

                          <Link
                            href={`/dashboard/surveys/${survey.id}`}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            onClick={() => setShowMenuFor(null)}
                          >
                            <Eye className="w-4 h-4 text-gray-400" />
                            {t("Card.Menu.ViewDetails")}
                          </Link>

                          <Link
                            href={`/dashboard/surveys/${survey.id}?tab=settings`}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            onClick={() => setShowMenuFor(null)}
                          >
                            <Edit className="w-4 h-4 text-gray-400" />
                            {t("Card.Menu.Edit")}
                          </Link>

                          <div className="border-t border-gray-100 my-1" />

                          {survey.shareableLink && survey.status === "active" && (
                            <button
                              onClick={() => {
                                handleCopyLink(survey.shareableLink!);
                                setShowMenuFor(null);
                              }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              <LinkIcon className="w-4 h-4 text-gray-400" />
                              {t("Card.Menu.CopyLink")}
                            </button>
                          )}

                          <button
                            onClick={() => handleDuplicate(survey)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            <Copy className="w-4 h-4 text-gray-400" />
                            {t("Card.Menu.Duplicate")}
                          </button>

                          <div className="border-t border-gray-100 my-1" />

                          <button
                            onClick={() => handleDelete({ id: survey.id, title: survey.title })}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                          >
                            {isDeleting === survey.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                            {t("Card.Menu.Delete")}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>


          {filteredSurveys.length === 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">{t("Empty.NoSurveys.Title")}</h3>
              <p className="text-gray-500 mb-6">{t("Empty.NoSurveys.Description")}</p>
              <Link
                href="/dashboard/create"
                className="inline-flex items-center gap-2 px-5 py-3 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-colors"
              >
                <Plus className="w-5 h-5" />
                {t("Empty.NoSurveys.Button")}
              </Link>
            </div>
          )}
        </>
      )}

      {/* Delete Confirmation Modal */}
      {surveyToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setSurveyToDelete(null)}
          />

          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">{t("DeleteModal.Title")}</h3>
              <p className="text-gray-500">
                {t("DeleteModal.Description", { title: surveyToDelete.title })}
              </p>
            </div>

            <div className="px-6 py-4 bg-gray-50 flex items-center gap-3">
              <button
                onClick={() => setSurveyToDelete(null)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                disabled={isDeleting !== null}
              >
                {t("DeleteModal.Cancel")}
              </button>
              <button
                onClick={confirmDeleteSurvey}
                disabled={isDeleting !== null}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-medium text-sm hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isDeleting ? (
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

export default function SurveysPage() {
  return (
    <Suspense>
      <SurveysContent />
    </Suspense>
  );
}
