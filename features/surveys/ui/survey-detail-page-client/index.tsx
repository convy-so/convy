"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle,
  Copy,
  Loader2,
  MessageSquare,
  Mic,
  Pause,
  Play,
  Settings,
  Share2,
  Sparkles,
  Trash2,
  TrendingUp,
  Users,
} from "lucide-react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";

import { Link, useRouter } from "@/i18n/routing";
import {
  clearSurveyCustomSlugAction,
  confirmSurveyAction,
  deactivateSurveyAction,
  deleteSurveyAction,
  reactivateSurveyAction,
  setSurveyCustomSlugAction,
  setSurveyStatusAction,
  updateSurveyAction,
} from "@/app/actions/survey";
import {
  fetchSurveyDetails,
  fetchSurveyResponses,
  type SurveyDetailsResponse,
  SurveyApiError,
} from "@/features/surveys/client/api/surveys-api";
import { getFriendlyActionError } from "@/shared/http/friendly-action-error";
import { queryKeys } from "@/shared/http/query-keys";
import { type AppLocale, appLocales } from "@/shared/i18n/config";
import { cn } from "@/shared/ui/tailwind-class-utils";
import { DeleteSurveyModal } from "./delete-survey-modal";
import { SurveyOverviewTab } from "./overview-tab";
import { SurveyResponsesTab } from "./responses-tab";
import { SurveySettingsTab } from "./settings-tab";
import { PublishSurveyModal } from "../publish-survey-modal";
import { SurveyDetailAccessRequiredState } from "./access-required-state";

interface ResponseRecord {
  id: string;
  participantId: string;
  status: "completed" | "abandoned";
  completedAt: string | null;
  createdAt: string | null;
  duration: string;
  sentiment: "positive" | "neutral" | "negative" | null;
  keyInsights: string[];
  messageCount: number;
  summary?: string;
}

type TabType = "overview" | "responses" | "settings";

function isTabType(value: string | null): value is TabType {
  return value === "overview" || value === "responses" || value === "settings";
}

export function SurveyDetailPageClient({
  surveyId,
  initialSurveyData,
  initialErrorStatus = null,
}: {
  surveyId: string;
  initialSurveyData: SurveyDetailsResponse | null;
  initialErrorStatus?: number | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const t = useTranslations("Survey.Detail");

  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [copied, setCopied] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [searchPlaceholder, setSearchPlaceholder] = useState(
    "Search responses...",
  );
  const [settingsForm, setSettingsForm] = useState({
    title: "",
    participantLimit: 50,
    language: "en" as AppLocale,
    isVoice: false,
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [customSlug, setCustomSlug] = useState("");
  const [isSavingSlug, setIsSavingSlug] = useState(false);
  const [isLifecyclePending, setIsLifecyclePending] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeletingSurvey, setIsDeletingSurvey] = useState(false);

  const itemsPerPage = 10;

  useEffect(() => {
    setSearchPlaceholder(
      t("Responses.SearchPlaceholder") || "Search responses...",
    );
  }, [t]);

  const detailQuery = useQuery<
    Awaited<ReturnType<typeof fetchSurveyDetails>>,
    SurveyApiError
  >({
    queryKey: queryKeys.surveys.detail(surveyId),
    queryFn: () => fetchSurveyDetails(surveyId),
    enabled: !!surveyId && initialErrorStatus === null,
    initialData: initialSurveyData ?? undefined,
    staleTime: 30_000,
  });

  const survey = detailQuery.data?.survey || null;
  const stats = detailQuery.data?.stats || null;

  useEffect(() => {
    if (!survey) {
      return;
    }

    setSettingsForm({
      title: survey.title,
      participantLimit: survey.participantLimit,
      language: (
        survey.language && appLocales.includes(survey.language as AppLocale)
          ? survey.language
          : "en"
      ) as AppLocale,
      isVoice: survey.isVoice || false,
    });
    setCustomSlug(survey.customSlug || "");
  }, [survey]);

  const responsesQuery = useQuery({
    queryKey: queryKeys.surveys.responses(surveyId, currentPage, statusFilter),
    queryFn: () =>
      fetchSurveyResponses(surveyId, currentPage, itemsPerPage, statusFilter),
    enabled: !!surveyId && activeTab === "responses",
  });

  const responses: ResponseRecord[] = responsesQuery.data?.responses ?? [];
  const totalPages = responsesQuery.data?.pagination?.totalPages || 1;

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (isTabType(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  async function refreshSurveyDetail() {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.surveys.detail(surveyId),
    });
  }

  async function handleSaveSettings() {
    setIsSavingSettings(true);
    const loadingToast = toast.loading("Saving settings...");
    try {
      const result = await updateSurveyAction({
        id: surveyId,
        ...settingsForm,
      });

      if (result.success) {
        toast.success(
          t("Toasts.SettingsSaved") || "Settings saved successfully",
          { id: loadingToast },
        );
        await refreshSurveyDetail();
      } else {
        toast.error(
          getFriendlyActionError(result.error, t("Toasts.SettingsFailed")),
          { id: loadingToast },
        );
      }
    } catch (error) {
      console.error("[handleSaveSettings] Failed:", error);
      toast.error(t("Toasts.Error") || "An unexpected error occurred", {
        id: loadingToast,
      });
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function handleStatusUpdate(newStatus: "active" | "paused") {
    try {
      const result = await setSurveyStatusAction({
        surveyId,
        status: newStatus,
      });

      if (result.success) {
        await refreshSurveyDetail();
        toast.success(
          t("Toasts.StatusUpdated", {
            status: newStatus === "active" ? "resumed" : "paused",
          }),
        );
      } else {
        toast.error(getFriendlyActionError(result.error, t("Toasts.StatusFailed")));
      }
    } catch (error) {
      console.error("[handleStatusUpdate] Failed:", error);
      toast.error(t("Toasts.Error"));
    }
  }

  async function handleConfirmSurvey() {
    setIsLifecyclePending(true);
    try {
      const result = await confirmSurveyAction(surveyId);
      if (!result.success) {
        toast.error(
          getFriendlyActionError(result.error, "Failed to activate survey"),
        );
        return;
      }
      await refreshSurveyDetail();
      toast.success("Survey activated");
    } catch (error) {
      console.error("[handleConfirmSurvey] Failed:", error);
      toast.error("Failed to activate survey");
    } finally {
      setIsLifecyclePending(false);
    }
  }

  async function handleDeactivateSurvey() {
    setIsLifecyclePending(true);
    try {
      const result = await deactivateSurveyAction(surveyId);
      if (!result.success) {
        toast.error(
          getFriendlyActionError(result.error, "Failed to close survey"),
        );
        return;
      }
      await refreshSurveyDetail();
      toast.success("Survey closed");
    } catch (error) {
      console.error("[handleDeactivateSurvey] Failed:", error);
      toast.error("Failed to close survey");
    } finally {
      setIsLifecyclePending(false);
    }
  }

  async function handleReactivateSurvey() {
    setIsLifecyclePending(true);
    try {
      const result = await reactivateSurveyAction(surveyId);
      if (!result.success) {
        toast.error(
          getFriendlyActionError(result.error, "Failed to reactivate survey"),
        );
        return;
      }
      await refreshSurveyDetail();
      toast.success("Survey reactivated");
    } catch (error) {
      console.error("[handleReactivateSurvey] Failed:", error);
      toast.error("Failed to reactivate survey");
    } finally {
      setIsLifecyclePending(false);
    }
  }

  async function handleSaveSlug() {
    const nextSlug = customSlug.trim();
    if (!nextSlug) {
      toast.error("Enter a custom URL slug first");
      return;
    }

    setIsSavingSlug(true);
    try {
      const result = await setSurveyCustomSlugAction({
        surveyId,
        slug: nextSlug,
      });
      if (!result.success) {
        toast.error(getFriendlyActionError(result.error, "Failed to save custom URL"));
        return;
      }
      await refreshSurveyDetail();
      setCustomSlug(result.data.customSlug);
      toast.success("Custom URL updated");
    } catch (error) {
      console.error("[handleSaveSlug] Failed:", error);
      toast.error("Failed to save custom URL");
    } finally {
      setIsSavingSlug(false);
    }
  }

  async function handleClearSlug() {
    setIsSavingSlug(true);
    try {
      const result = await clearSurveyCustomSlugAction(surveyId);
      if (!result.success) {
        toast.error(getFriendlyActionError(result.error, "Failed to clear custom URL"));
        return;
      }
      await refreshSurveyDetail();
      setCustomSlug("");
      toast.success("Custom URL cleared");
    } catch (error) {
      console.error("[handleClearSlug] Failed:", error);
      toast.error("Failed to clear custom URL");
    } finally {
      setIsSavingSlug(false);
    }
  }

  async function handleDelete() {
    setIsDeletingSurvey(true);
    try {
      const result = await deleteSurveyAction(surveyId);

      if (result.success) {
        toast.success(t("Toasts.Deleted") || "Survey deleted successfully");
        router.push("/dashboard/surveys");
      } else {
        toast.error(
          getFriendlyActionError(
            result.error,
            t("Toasts.DeleteFailed") || "Failed to delete survey",
          ),
        );
      }
    } catch (error) {
      console.error("[handleDelete] Failed:", error);
      toast.error(t("Toasts.Error") || "An unexpected error occurred");
    } finally {
      setIsDeletingSurvey(false);
      setShowDeleteModal(false);
    }
  }

  async function copyLink() {
    if (!survey?.shareableUrl) {
      return;
    }
    await navigator.clipboard.writeText(survey.shareableUrl);
    setCopied(true);
    toast.success(t("Toasts.LinkCopied") || "Link copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }

  const tabs: { id: TabType; label: string | React.ReactNode; icon: React.ReactNode }[] = [
    {
      id: "overview",
      label: t("Tabs.Overview"),
      icon: <MessageSquare className="h-4 w-4" />,
    },
    {
      id: "responses",
      label: t("Tabs.Responses"),
      icon: <Users className="h-4 w-4" />,
    },
    {
      id: "settings",
      label: t("Tabs.Settings"),
      icon: <Settings className="h-4 w-4" />,
    },
  ];

  if (detailQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (initialErrorStatus === 403 || detailQuery.error?.status === 403) {
    return <SurveyDetailAccessRequiredState translations={t} />;
  }

  if (!survey) {
    return (
      <div className="py-24 text-center">
        <h2 className="mb-2 text-xl font-semibold text-gray-900">
          {t("NotFound")}
        </h2>
        <Link
          href="/dashboard/surveys"
          className="text-gray-500 hover:text-gray-700"
        >
          {t("BackToSurveys")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <Link
              href="/dashboard/surveys"
              className="self-start rounded-lg p-2 transition-colors hover:bg-gray-100 sm:self-auto"
            >
              <ArrowLeft className="h-5 w-5 text-gray-600" />
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="max-w-[200px] break-words text-xl font-bold text-gray-900 sm:max-w-md">
                {survey.title}
              </h1>
              <span
                className={cn(
                  "whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium capitalize",
                  survey.status === "active" &&
                    "border border-emerald-200 bg-emerald-50 text-emerald-700",
                  (survey.status === "draft" || survey.status === "creating") &&
                    "border border-amber-200 bg-amber-50 text-amber-700",
                  survey.status === "completed" &&
                    "border border-gray-200 bg-gray-50 text-gray-700",
                  survey.status === "paused" &&
                    "border border-orange-200 bg-orange-50 text-orange-700",
                  survey.status === "sample_review" &&
                    "border border-blue-200 bg-blue-50 text-blue-700",
                )}
              >
                {survey.status === "draft" || survey.status === "creating"
                  ? t("Status.Draft")
                  : survey.status === "sample_review"
                    ? t("Status.SampleReview")
                    : t(
                        `Status.${survey.status.charAt(0).toUpperCase()}${survey.status.slice(1)}`,
                      )}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                void copyLink();
              }}
              className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-gray-600 transition-colors hover:bg-gray-50"
            >
              {copied ? (
                <CheckCircle className="h-4 w-4 text-emerald-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              <span className="text-sm font-medium">
                {copied ? t("Header.Copied") : t("Header.CopyLink")}
              </span>
            </button>

            <Link
              href={`/dashboard/surveys/${surveyId}/analytics`}
              className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-gray-600 transition-colors hover:bg-gray-50"
            >
              <TrendingUp className="h-4 w-4" />
              <span className="text-sm font-medium">Analytics</span>
            </Link>

            {survey.status === "active" ? (
              <button
                onClick={() => {
                  void handleStatusUpdate("paused");
                }}
                className="flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-medium text-orange-700 transition-colors hover:bg-orange-100"
              >
                <Pause className="h-4 w-4" />
                <span className="hidden sm:inline">{t("Header.Pause")}</span>
              </button>
            ) : survey.status === "paused" ? (
              <button
                onClick={() => {
                  void handleStatusUpdate("active");
                }}
                className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
              >
                <Play className="h-4 w-4" />
                <span className="hidden sm:inline">{t("Header.Resume")}</span>
              </button>
            ) : null}

            {survey.status === "active" ? (
              <button
                onClick={() => {
                  void handleDeactivateSurvey();
                }}
                disabled={isLifecyclePending}
                className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50"
              >
                <Pause className="h-4 w-4" />
                <span className="hidden sm:inline">Close Survey</span>
              </button>
            ) : null}

            {survey.status === "completed" ? (
              <button
                onClick={() => {
                  void handleReactivateSurvey();
                }}
                disabled={isLifecyclePending}
                className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50"
              >
                <Play className="h-4 w-4" />
                <span className="hidden sm:inline">Reactivate</span>
              </button>
            ) : null}

            {survey.status === "draft" ||
            survey.status === "creating" ||
            survey.status === "sample_review" ? (
              <Link
                href={`/dashboard/create?id=${survey.id}`}
                className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 shadow-sm transition-colors hover:bg-indigo-100"
              >
                <Sparkles className="h-4 w-4" />
                <span>{t("Header.Continue")}</span>
              </Link>
            ) : null}

            {survey.status === "draft" || survey.status === "sample_review" ? (
              <>
                <button
                  onClick={() => setShowPublishModal(true)}
                  className="flex items-center gap-2 rounded-xl border border-gray-900 bg-gray-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-black"
                >
                  <Share2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Publish</span>
                </button>
                <button
                  onClick={() => {
                    void handleConfirmSurvey();
                  }}
                  disabled={isLifecyclePending}
                  className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-50"
                >
                  <CheckCircle className="h-4 w-4" />
                  <span className="hidden sm:inline">Quick Activate</span>
                </button>
              </>
            ) : null}

            <button
              onClick={() => setShowDeleteModal(true)}
              className="rounded-xl border border-transparent p-2.5 text-gray-400 transition-all hover:border-red-100 hover:bg-red-50 hover:text-red-600"
              title="Delete Survey"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          </div>
        </div>

        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-gray-500 sm:ml-12">
          {survey.description ||
            survey.coreObjective ||
            survey.brief?.researchGoal ||
            survey.brief?.learningContext ||
            t("Header.NoDescription")}
        </p>
      </div>

      {survey.status === "sample_review" ? (
        <div className="group relative mb-6 overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-700 p-6 text-white shadow-lg">
          <div className="absolute right-0 top-0 p-8 opacity-10 transition-transform duration-500 group-hover:scale-110">
            <Mic className="h-32 w-32" />
          </div>
          <div className="relative z-10">
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm">
                {t("SampleReview.Badge")}
              </span>
              <Sparkles className="h-4 w-4" />
            </div>
            <h2 className="mb-2 text-2xl font-bold">{t("SampleReview.Title")}</h2>
            <p className="mb-6 max-w-xl text-blue-100">
              {t("SampleReview.Description")}
            </p>
            <Link
              href={`/dashboard/surveys/${surveyId}/sample-review`}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 font-bold text-blue-700 shadow-md transition-all hover:-translate-y-0.5 hover:bg-blue-50 hover:shadow-xl"
            >
              <Play className="h-4 w-4 fill-current" />
              {t("SampleReview.Button")}
            </Link>
          </div>
        </div>
      ) : null}

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700",
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === "overview" ? (
        <SurveyOverviewTab
          survey={survey}
          stats={stats}
          responses={responses}
          copyLink={() => {
            void copyLink();
          }}
          setResponsesTab={() => setActiveTab("responses")}
          t={t}
        />
      ) : null}

      {activeTab === "responses" ? (
        <SurveyResponsesTab
          surveyId={surveyId}
          responses={responses}
          currentPage={currentPage}
          totalPages={totalPages}
          statusFilter={statusFilter}
          isFilterOpen={isFilterOpen}
          isLoadingResponses={responsesQuery.isLoading}
          searchPlaceholder={searchPlaceholder}
          setIsFilterOpen={setIsFilterOpen}
          setStatusFilter={setStatusFilter}
          setCurrentPage={setCurrentPage}
          t={t}
        />
      ) : null}

      {activeTab === "settings" ? (
        <SurveySettingsTab
          surveyId={surveyId}
          survey={survey}
          settingsForm={settingsForm}
          customSlug={customSlug}
          isSavingSlug={isSavingSlug}
          isSavingSettings={isSavingSettings}
          setSettingsForm={setSettingsForm}
          setCustomSlug={setCustomSlug}
          handleSaveSlug={() => {
            void handleSaveSlug();
          }}
          handleClearSlug={() => {
            void handleClearSlug();
          }}
          handleSaveSettings={() => {
            void handleSaveSettings();
          }}
          t={t}
        />
      ) : null}

      <PublishSurveyModal
        isOpen={showPublishModal}
        onClose={() => setShowPublishModal(false)}
        surveyId={surveyId}
        initialTitle={survey.title}
        initialIsVoice={survey.isVoice || false}
        onPublished={() => {
          setShowPublishModal(false);
          void refreshSurveyDetail();
        }}
      />

      <DeleteSurveyModal
        open={showDeleteModal}
        title={survey.title}
        isDeleting={isDeletingSurvey}
        onClose={() => setShowDeleteModal(false)}
        onDelete={() => {
          void handleDelete();
        }}
        t={t}
      />
    </div>
  );
}
