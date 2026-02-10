"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  Calendar,
  ArrowUpRight,
  Play,
  AlertTriangle,
  Mic,
} from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import { deleteSurveyAction, duplicateSurveyAction } from "@/app/actions/survey";
import { fetchSurveys } from "@/lib/api/surveys";
import { queryKeys } from "@/lib/query-keys";

interface Survey {
  id: string;
  title: string;
  description: string;
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

const statusConfig: Record<string, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
  active: { label: "Published", color: "text-emerald-700", bgColor: "bg-emerald-50 border-emerald-200", icon: <Globe className="w-3 h-3" /> },
  draft: { label: "Draft", color: "text-amber-700", bgColor: "bg-amber-50 border-amber-200", icon: <FileEdit className="w-3 h-3" /> },
  creating: { label: "Creating", color: "text-blue-700", bgColor: "bg-blue-50 border-blue-200", icon: <Sparkles className="w-3 h-3" /> },
  completed: { label: "Completed", color: "text-gray-600", bgColor: "bg-gray-100 border-gray-200", icon: <Check className="w-3 h-3" /> },
  paused: { label: "Paused", color: "text-orange-700", bgColor: "bg-orange-50 border-orange-200", icon: <Clock className="w-3 h-3" /> },
};

type FilterTab = "all" | "published" | "unpublished";

export default function SurveysPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [showMenuFor, setShowMenuFor] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [surveyToDelete, setSurveyToDelete] = useState<{ id: string; title: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  // Fetch surveys using React Query
  const { data: surveys = [], isLoading } = useQuery<Survey[]>({
    queryKey: queryKeys.surveys.all,
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
        // Invalidate queries to refetch surveys list
        queryClient.invalidateQueries({ queryKey: queryKeys.surveys.all });
        toast.success("Survey deleted successfully");
        setSurveyToDelete(null);
      } else {
        toast.error(result.error || "Failed to delete survey");
      }
    } catch (error) {
      toast.error("Failed to delete survey");
    } finally {
      setIsDeleting(null);
    }
  };

  // Continue creating survey
  const handleContinue = (surveyId: string) => {
    setShowMenuFor(null);
    router.push(`/dashboard/create?surveyId=${surveyId}`);
  };

  // Duplicate survey (creates a copy)
  const handleDuplicate = async (survey: Survey) => {
    setShowMenuFor(null);
    const loadingToast = toast.loading("Duplicating survey...");

    try {
      const result = await duplicateSurveyAction(survey.id);

      if (result.success) {
        toast.success("Survey duplicated!", { id: loadingToast });
        // Invalidate queries to refetch surveys list
        queryClient.invalidateQueries({ queryKey: queryKeys.surveys.all });
      } else {
        toast.error(result.error || "Failed to duplicate survey", { id: loadingToast });
      }
    } catch (error) {
      toast.error("Failed to duplicate survey", { id: loadingToast });
    }
  };



  const handleCopyLink = async (shareableLink: string) => {
    const baseUrl = window.location.origin;
    const url = `${baseUrl}/s/${shareableLink}`;

    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(shareableLink);
      toast.success("Link copied to clipboard!");
      setTimeout(() => setCopiedLink(null), 2000);
    } catch (error) {
      toast.error("Failed to copy link");
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
        s.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return result;
  }, [surveys, filterTab, searchQuery]);

  const filterTabs: { id: FilterTab; label: string; count: number }[] = [
    { id: "all", label: "All Surveys", count: counts.all },
    { id: "published", label: "Published", count: counts.published },
    { id: "unpublished", label: "Unpublished", count: counts.unpublished },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Surveys</h1>
          <p className="text-gray-500 mt-1">Manage and monitor your conversational surveys</p>
        </div>
        <Link
          href="/dashboard/create"
          className="flex items-center justify-center gap-2 px-5 py-3 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
        >
          <Plus className="w-5 h-5" />
          Create Survey
        </Link>
      </div>

      {/* Filter Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-6">
          {filterTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterTab(tab.id)}
              className={cn(
                "py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2",
                filterTab === tab.id
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              )}
            >
              {tab.id === "published" && <Globe className="w-4 h-4" />}
              {tab.id === "unpublished" && <FileEdit className="w-4 h-4" />}
              {tab.id === "all" && <MessageSquare className="w-4 h-4" />}
              {tab.label}
              <span className={cn(
                "px-2 py-0.5 rounded-full text-xs font-medium",
                filterTab === tab.id ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"
              )}>
                {tab.count}
              </span>
            </button>
          ))}
        </nav>
      </div>

      {/* Search Bar */}
      <div className="flex items-center gap-4">
        <div className="flex-1 max-w-md relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search surveys..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 outline-none transition-all text-sm"
          />
        </div>
      </div>

      {/* Loading State */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Loading your surveys...</p>
          </div>
        </div>
      ) : (
        <>
          {/* Surveys List */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {filteredSurveys.map((survey, index) => {
              const config = statusConfig[survey.status] || statusConfig.draft;

              return (
                <div
                  key={survey.id}
                  className={cn(
                    "group flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-gray-50/50 transition-colors",
                    index !== filteredSurveys.length - 1 ? "border-b border-gray-100" : ""
                  )}
                >
                  <div className="flex items-start sm:items-center gap-4 flex-1 min-w-0">
                    {/* Icon Container */}
                    <div className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105",
                      config.bgColor
                    )}>
                       <div className={cn(config.color)}>
                          {survey.status === 'active' ? <Globe className="w-6 h-6" /> :
                           survey.status === 'draft' ? <FileEdit className="w-6 h-6" /> :
                           survey.status === 'creating' ? <Sparkles className="w-6 h-6" /> :
                           survey.status === 'completed' ? <Check className="w-6 h-6" /> :
                           <Clock className="w-6 h-6" />}
                       </div>
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
                        {survey.description || "No description provided"}
                      </p>
                    </div>
                  </div>

                  {/* Metrics & Meta */}
                  <div className="flex items-center gap-6 mt-4 sm:mt-0 sm:ml-6 flex-shrink-0">
                     <div className="flex flex-col items-end min-w-[80px]">
                        <span className="text-sm font-medium text-gray-900">{survey.responses}</span>
                        <span className="text-xs text-gray-400">Responses</span>
                     </div>
                     
                     <div className="hidden md:flex flex-col items-end min-w-[100px]">
                        <span className="text-sm font-medium text-gray-900">{survey.createdAt}</span>
                        <span className="text-xs text-gray-400">Created</span>
                     </div>

                     <div className={cn(
                        "px-2.5 py-1 rounded-full text-xs font-medium border hidden md:flex items-center gap-1.5",
                        config.bgColor,
                        config.color
                      )}>
                        {config.label}
                      </div>

                     {/* Actions */}
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
                               {/* Continue button for creating surveys */}
                               {survey.status === "creating" && (
                                <>
                                  <button
                                    onClick={() => handleContinue(survey.id)}
                                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-emerald-600 hover:bg-emerald-50 font-medium"
                                  >
                                    <Play className="w-4 h-4" />
                                    Continue Creating
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
                                View Details
                              </Link>
                              
                              {survey.status === "active" && (
                                <Link
                                  href={`/dashboard/surveys/${survey.id}?tab=analytics`}
                                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                  onClick={() => setShowMenuFor(null)}
                                >
                                  <BarChart3 className="w-4 h-4 text-gray-400" />
                                  Analytics
                                </Link>
                              )}
                              
                              <Link
                                href={`/dashboard/surveys/${survey.id}?tab=settings`}
                                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                onClick={() => setShowMenuFor(null)}
                              >
                                <Edit className="w-4 h-4 text-gray-400" />
                                Edit
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
                                    Copy Link
                                  </button>
                               )}

                              <button
                                onClick={() => handleDuplicate(survey)}
                                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                              >
                                <Copy className="w-4 h-4 text-gray-400" />
                                Duplicate
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
                                Delete
                              </button>
                            </div>
                          </>
                        )}
                     </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Empty State */}
          {filteredSurveys.length === 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              {searchQuery ? (
                <>
                  <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No matching surveys</h3>
                  <p className="text-gray-500 mb-4">Try adjusting your search criteria</p>
                  <button
                    onClick={() => setSearchQuery("")}
                    className="text-sm font-medium text-gray-600 hover:text-gray-900"
                  >
                    Clear search
                  </button>
                </>
              ) : filterTab === "published" ? (
                <>
                  <Globe className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No published surveys</h3>
                  <p className="text-gray-500 mb-6">Create a survey and publish it to start collecting responses</p>
                  <Link
                    href="/dashboard/create"
                    className="inline-flex items-center gap-2 px-5 py-3 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                    Create Survey
                  </Link>
                </>
              ) : filterTab === "unpublished" ? (
                <>
                  <FileEdit className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No drafts or creating surveys</h3>
                  <p className="text-gray-500">All your surveys are published!</p>
                </>
              ) : (
                <>
                  <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No surveys yet</h3>
                  <p className="text-gray-500 mb-6">Get started by creating your first conversational survey</p>
                  <Link
                    href="/dashboard/create"
                    className="inline-flex items-center gap-2 px-5 py-3 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                    Create Your First Survey
                  </Link>
                </>
              )}
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
              <h3 className="text-xl font-bold text-gray-900 mb-2">Delete Survey</h3>
              <p className="text-gray-500">
                Are you sure you want to delete <span className="font-semibold text-gray-900">"{surveyToDelete.title}"</span>?
                This action cannot be undone and will permanently remove all responses.
              </p>
            </div>

            <div className="px-6 py-4 bg-gray-50 flex items-center gap-3">
              <button
                onClick={() => setSurveyToDelete(null)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                disabled={isDeleting !== null}
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteSurvey}
                disabled={isDeleting !== null}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-medium text-sm hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Delete Survey
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