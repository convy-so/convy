"use client";

import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/routing";
import {
  ArrowLeft,
  MessageSquare,
  Sparkles,
  Users,
  Clock,
  Share2,
  Settings,
  Play,
  Pause,
  Copy,
  TrendingUp,
  Calendar,
  Mic,
  CheckCircle,
  Download,
  Filter,
  Search,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  Check,
  AlertTriangle,
  Trash2,
  Code,
} from "lucide-react";
import { ConversationCard } from "@/components/analytics/ConversationCard";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { getSurveyEmbedCodeAction } from "@/app/actions/survey";
import { fetchSurveyDetails, fetchSurveyResponses } from "@/lib/api/surveys";
import { queryKeys } from "@/lib/query-keys";

interface Survey {
  id: string;
  title: string;
  status: "active" | "draft" | "completed" | "paused" | "creating" | "sample_review";
  createdAt: string;
  updatedAt: string;
  expertState?: any;
  coreObjective?: string;
  tone?: string;
  shareableLink?: string;
  shareableUrl?: string;
  participantLimit: number;
  currentParticipants: number;
  requiredQuestions?: string[];
  metrics?: string[];
  isVoice?: boolean;
}

interface SurveyStats {
  totalResponses: number;
  completedResponses: number;
  completionRate: number;
  avgDuration: string;
}

interface Response {
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
  sentimentScore?: number;
}



interface AnalyticsTheme {
  theme: string;
  mentions: number;
  sentiment: "neutral" | "positive" | "negative";
}

interface AnalyticsData {
  sentimentBreakdown: {
    positive: number;
    neutral: number;
    negative: number;
  };
  completionFunnel: {
    stage: string;
    count: number;
    percentage: number;
  }[];
  topThemes: AnalyticsTheme[];
}

type TabType = "overview" | "responses" | "settings";

export default function SurveyDetailPage() {
  const t = useTranslations("Survey.Detail");
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const surveyId = params.surveyId as string;
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [copied, setCopied] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const ITEMS_PER_PAGE = 10;
  const [settingsForm, setSettingsForm] = useState({
    title: "",
    participantLimit: 50,
    isVoice: false,
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeletingSurvey, setIsDeletingSurvey] = useState(false);

  const [embedCodes, setEmbedCodes] = useState<{
    iframeCode: string;
    inlineScriptSnippet: string;
    popoverScriptSnippet: string;
    sideTabScriptSnippet: string;
    url: string;
  } | null>(null);
  const [embedError, setEmbedError] = useState<string | null>(null);
  const [isLoadingEmbed, setIsLoadingEmbed] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState<'iframe' | 'inline' | 'popover' | 'sidetab' | null>(null);
  const [selectedEmbedType, setSelectedEmbedType] = useState<'inline' | 'popover' | 'sidetab' | 'iframe'>('inline');
  const [embedOptions, setEmbedOptions] = useState({
    color: '#4F46E5',
    text: 'Feedback',
    position: 'right' as 'left' | 'right'
  });

  // Fetch survey details using React Query
  const { data: surveyData, isLoading } = useQuery({
    queryKey: queryKeys.surveys.detail(surveyId),
    queryFn: () => fetchSurveyDetails(surveyId),
    enabled: !!surveyId,
  });

  // Derive survey and stats from the data
  const survey = surveyData?.survey || null;
  const stats = surveyData?.stats || null;

  // Update settings form when survey data loads
  useEffect(() => {
    if (survey) {
      setSettingsForm({
        title: survey.title,
        participantLimit: survey.participantLimit,
        isVoice: survey.isVoice || false,
      });
    }
  }, [survey]);

  // Fetch responses using React Query (conditional on activeTab)
  const { data: responsesData, isLoading: isLoadingResponses } = useQuery({
    queryKey: queryKeys.surveys.responses(surveyId, currentPage, statusFilter),
    queryFn: () => fetchSurveyResponses(surveyId, currentPage, ITEMS_PER_PAGE, statusFilter),
    enabled: !!surveyId && activeTab === "responses",
  });

  const responses = responsesData?.responses || [];
  const totalPages = responsesData?.pagination?.totalPages || 1;




  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    const loadingToast = toast.loading(t("Settings.Saving"));
    try {
      const response = await fetch(`/api/surveys/${surveyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settingsForm),
      });

      if (response.ok) {
        toast.success(t("Toasts.SettingsSaved"), { id: loadingToast });
        // Invalidate survey query to refetch updated data
        queryClient.invalidateQueries({ queryKey: queryKeys.surveys.detail(surveyId) });
      } else {
        toast.error(t("Toasts.SettingsFailed"), { id: loadingToast });
      }
    } catch (_) {
      toast.error(t("Toasts.Error"), { id: loadingToast });
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Handle tab from URL
  useEffect(() => {
    const tabParam = searchParams.get("tab") as TabType;
    if (tabParam && ["overview", "responses", "settings"].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  const handleStatusUpdate = async (newStatus: "active" | "paused") => {
    try {
      const response = await fetch(`/api/surveys/${surveyId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        // Invalidate survey query to refetch updated data
        queryClient.invalidateQueries({ queryKey: queryKeys.surveys.detail(surveyId) });
        toast.success(t("Toasts.StatusUpdated", { status: newStatus === "active" ? "resumed" : "paused" }));
      } else {
        toast.error(t("Toasts.StatusFailed"));
      }
    } catch (_) {
      toast.error(t("Toasts.Error"));
    }
  };

  const handleDelete = async () => {
    setIsDeletingSurvey(true);
    try {
      const response = await fetch(`/api/surveys/${surveyId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success(t("Toasts.Deleted"));
        router.push("/dashboard/surveys");
      } else {
        toast.error(t("Toasts.DeleteFailed"));
      }
    } catch (_) {
      toast.error(t("Toasts.Error"));
    } finally {
      setIsDeletingSurvey(false);
      setShowDeleteModal(false);
    }
  };

  const copyLink = () => {
    if (survey?.shareableUrl) {
      navigator.clipboard.writeText(survey.shareableUrl);
      setCopied(true);
      toast.success(t("Toasts.LinkCopied"));
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const generateEmbedCode = async () => {
    setIsLoadingEmbed(true);
    setEmbedError(null);

    const result = await getSurveyEmbedCodeAction(surveyId);

    if (result.success) {
      setEmbedCodes(result.data as any);
      // toast.success(t("Toasts.EmbedGenerated")); // Remove toast for auto-generation
    } else {
      setEmbedError(result.error || t("Toasts.EmbedFailed"));
      // toast.error(result.error || t("Toasts.EmbedFailed"));
    }

    setIsLoadingEmbed(false);
  };

  // Auto-generate embed code on mount or when status becomes active
  useEffect(() => {
    if (survey?.status === 'active' && !embedCodes && activeTab === 'settings') {
      generateEmbedCode();
    }
  }, [survey?.status, activeTab]);

  const copyEmbedCode = (type: 'iframe' | 'inline' | 'popover' | 'sidetab') => {
    if (!embedCodes) return;

    let code = '';
    switch (type) {
      case 'iframe': code = embedCodes.iframeCode; break;
      case 'inline': code = embedCodes.inlineScriptSnippet; break;
      case 'popover':
        code = embedCodes.popoverScriptSnippet.replace('#4F46E5', embedOptions.color);
        break;
      case 'sidetab':
        code = embedCodes.sideTabScriptSnippet
          .replace('#4F46E5', embedOptions.color)
          .replace('Feedback', embedOptions.text)
          .replace('side-tab"', `side-tab" data-convy-position="${embedOptions.position}"`);
        break;
    }

    navigator.clipboard.writeText(code);
    setCopiedEmbed(type);
    toast.success(t("Toasts.CodeCopied"));
    setTimeout(() => setCopiedEmbed(null), 2000);
  };

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: "overview", label: t("Tabs.Overview"), icon: <MessageSquare className="w-4 h-4" /> },
    { id: "responses", label: t("Tabs.Responses"), icon: <Users className="w-4 h-4" /> },
    { id: "settings", label: t("Tabs.Settings"), icon: <Settings className="w-4 h-4" /> },
  ];

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  // Survey not found
  if (!survey) {
    return (
      <div className="text-center py-24">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">{t("NotFound.Title")}</h2>
        <Link href="/dashboard/surveys" className="text-gray-500 hover:text-gray-700">
          {t("NotFound.Back")}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <Link href="/dashboard/surveys" className="self-start sm:self-auto p-2 rounded-lg hover:bg-gray-100 transition-colors">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-bold text-gray-900 break-words max-w-[200px] sm:max-w-md">{survey.title}</h1>
              <span className={cn(
                "px-2.5 py-1 rounded-full text-xs font-medium capitalize whitespace-nowrap",
                survey.status === "active" && "bg-emerald-50 text-emerald-700 border border-emerald-200",
                (survey.status === "draft" || survey.status === "creating") && "bg-amber-50 text-amber-700 border border-amber-200",
                survey.status === "completed" && "bg-gray-50 text-gray-700 border border-gray-200",
                survey.status === "paused" && "bg-orange-50 text-orange-700 border border-orange-200",
                survey.status === "sample_review" && "bg-blue-50 text-blue-700 border border-blue-200"
              )}>
                {survey.status === "draft" || survey.status === "creating" ? "Not Completed" : survey.status.replace('_', ' ')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={copyLink} className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors">
              {copied ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              <span className="text-sm font-medium">{copied ? t("Header.Copied") : t("Header.CopyLink")}</span>
            </button>

            {survey.status === "active" ? (
              <button
                onClick={() => handleStatusUpdate("paused")}
                className="flex items-center gap-2 px-3 py-2 bg-orange-50 text-orange-700 border border-orange-200 rounded-xl text-sm font-medium hover:bg-orange-100 transition-colors"
                title={t("Header.Pause")}
              >
                <Pause className="w-4 h-4" />
                <span className="hidden sm:inline">{t("Header.Pause")}</span>
              </button>
            ) : survey.status === "paused" ? (
              <button
                onClick={() => handleStatusUpdate("active")}
                className="flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-sm font-medium hover:bg-emerald-100 transition-colors"
                title={t("Header.Resume")}
              >
                <Play className="w-4 h-4" />
                <span className="hidden sm:inline">{t("Header.Resume")}</span>
              </button>
            ) : null}

            {(survey.status === "draft" || survey.status === "creating" || survey.status === "sample_review") && (
              <Link
                href={`/dashboard/create?id=${survey.id}`}
                className="flex items-center gap-2 px-3 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl text-sm font-medium hover:bg-indigo-100 transition-colors shadow-sm"
              >
                <Sparkles className="w-4 h-4" />
                <span>{t("Header.Continue")}</span>
              </Link>
            )}

            <button
              onClick={() => setShowDeleteModal(true)}
              className="p-2.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all border border-transparent hover:border-red-100"
              title="Delete Survey"
            >
              <Trash2 className="w-5 h-5" />
            </button>


          </div>
        </div>
        <p className="text-gray-500 mt-4 sm:ml-12 text-sm max-w-2xl leading-relaxed">{survey.coreObjective || survey.expertState?.objective?.goal || t("Header.NoDescription")}</p>
      </div>

      {/* Sample Review Banner */}
      {survey.status === "sample_review" && (
        <div className="mb-6 p-6 bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl text-white shadow-lg overflow-hidden relative group">
          <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-500">
            <Mic className="w-32 h-32" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 bg-white/20 backdrop-blur-sm rounded text-[10px] font-bold uppercase tracking-wider">{t("SampleReview.Badge")}</span>
              <Sparkles className="w-4 h-4" />
            </div>
            <h2 className="text-2xl font-bold mb-2">{t("SampleReview.Title")}</h2>
            <p className="text-blue-100 mb-6 max-w-xl">
              {t("SampleReview.Description")}
            </p>
            <Link
              href={`/dashboard/surveys/${surveyId}/sample-review`}
              className="inline-flex items-center gap-2 px-6 py-3 bg-white text-blue-700 rounded-xl font-bold hover:bg-blue-50 transition-all shadow-md hover:shadow-xl hover:-translate-y-0.5"
            >
              <Play className="w-4 h-4 fill-current" />
              {t("SampleReview.Button")}
            </Link>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 py-3 px-1 border-b-2 text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex items-center gap-2 text-gray-500 mb-2">
                <Users className="w-4 h-4" />
                <span className="text-sm">{t("Overview.Responses.Title")}</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{stats?.totalResponses || 0}</p>
              <p className="text-xs text-gray-400 mt-1">{t("Overview.Responses.Target", { limit: survey.participantLimit })}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex items-center gap-2 text-gray-500 mb-2">
                <TrendingUp className="w-4 h-4" />
                <span className="text-sm">{t("Overview.Completion.Title")}</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{stats?.completionRate || 0}%</p>
              <p className="text-xs text-gray-400 mt-1">{t("Overview.Completion.Completed", { count: stats?.completedResponses || 0 })}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex items-center gap-2 text-gray-500 mb-2">
                <Clock className="w-4 h-4" />
                <span className="text-sm">{t("Overview.Duration.Title")}</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{stats?.avgDuration || '0s'}</p>
              <p className="text-xs text-gray-400 mt-1">{t("Overview.Duration.Unit")}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex items-center gap-2 text-gray-500 mb-2">
                <Calendar className="w-4 h-4" />
                <span className="text-sm">{t("Overview.Created.Title")}</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{survey.createdAt ? new Date(survey.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}</p>
              <p className="text-xs text-gray-400 mt-1">{survey.createdAt ? new Date(survey.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : ''}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Share2 className="w-4 h-4" />
              {t("Overview.ShareLink")}
            </h3>
            <div className="flex items-center gap-2">
              <input type="text" value={survey.shareableUrl || 'Not published yet'} readOnly className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600 truncate" />
              <button onClick={copyLink} className="p-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors">
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="font-semibold text-gray-900 mb-4">{t("Overview.Configuration.Title")}</h3>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-500 mb-1">{t("Overview.Configuration.Objective")}</p>
                <p className="text-gray-900">{survey.coreObjective || survey.expertState?.objective?.goal || t("Overview.Configuration.NotSpecified")}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">{t("Overview.Configuration.TargetAudience")}</p>
                <p className="text-gray-900">{survey.expertState?.targetAudience?.description || t("Overview.Configuration.NotSpecified")}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">{t("Overview.Configuration.Tone")}</p>
                <p className="text-gray-900 capitalize">{survey.tone || survey.expertState?.tone || 'casual'}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">{t("Overview.RecentResponses.Title")}</h3>
              <button onClick={() => setActiveTab("responses")} className="text-sm text-gray-500 hover:text-gray-900">{t("Overview.RecentResponses.ViewAll")}</button>
            </div>
            <div className="space-y-3">
              {responses.length > 0 ? responses.slice(0, 3).map((response: Response) => (
                <div key={response.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-gray-50 rounded-xl gap-3 transition-colors hover:bg-gray-100/80">
                  <div className="flex items-start sm:items-center gap-3">
                    <div className={cn(
                      "w-2.5 h-2.5 rounded-full mt-1.5 sm:mt-0 shrink-0",
                      response.status === "completed" ? "bg-emerald-500 shadow-sm shadow-emerald-200" : "bg-amber-400 shadow-sm shadow-amber-200"
                    )} />
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-gray-900">{response.participantId === 'Anonymous' ? t("Responses.Table.Anonymous") : t("Responses.Table.Participant", { id: response.id.slice(0, 4) })}</span>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span>{response.status === 'completed' ? t("Responses.Table.Status.Completed") : t("Responses.Table.Status.InProgress")}</span>
                        <span>•</span>
                        <span>{response.completedAt ? new Date(response.completedAt).toLocaleDateString() : new Date(response.createdAt || Date.now()).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 ml-5 sm:ml-0">
                    {response.sentiment && (
                      <span className={cn(
                        "px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider",
                        response.sentiment === "positive" && "bg-emerald-100 text-emerald-700",
                        response.sentiment === "neutral" && "bg-gray-200 text-gray-700",
                        response.sentiment === "negative" && "bg-red-100 text-red-700"
                      )}>
                        {response.sentiment}
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-xs font-medium text-gray-600 bg-white px-2 py-1 rounded-md border border-gray-200 shadow-sm">
                      <Clock className="w-3 h-3" />
                      {response.duration}
                    </span>
                  </div>
                </div>
              )) : (
                <p className="text-sm text-gray-500 text-center py-4">{t("Overview.RecentResponses.NoResponses")}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Responses Tab */}
      {activeTab === "responses" && (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1 max-w-md relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" placeholder={t("Responses.SearchPlaceholder")} className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 outline-none text-sm" />
            </div>

            <div className="relative">
              <button
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 outline-none min-w-[160px] justify-between transition-all"
              >
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-gray-500" />
                  <span>
                    {statusFilter === "all" && t("Responses.Filter.All")}
                    {statusFilter === "completed" && t("Responses.Filter.Completed")}
                    {statusFilter === "in_progress" && t("Responses.Filter.InProgress")}
                  </span>
                </div>
                <ChevronDown className={cn("w-4 h-4 text-gray-400 transition-transform", isFilterOpen && "rotate-180")} />
              </button>

              {isFilterOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setIsFilterOpen(false)}
                  />
                  <div className="absolute top-full mt-2 right-0 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-20 animate-in fade-in zoom-in-95 duration-200">
                    {[
                      { value: "all", label: t("Responses.Filter.All") },
                      { value: "completed", label: t("Responses.Filter.Completed") },
                      { value: "in_progress", label: t("Responses.Filter.InProgress") }
                    ].map((option) => (
                      <button
                        key={option.value}
                        onClick={() => {
                          setStatusFilter(option.value);
                          setCurrentPage(1);
                          setIsFilterOpen(false);
                        }}
                        className={cn(
                          "w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors hover:bg-gray-50",
                          statusFilter === option.value ? "text-gray-900 font-medium bg-gray-50/50" : "text-gray-600"
                        )}
                      >
                        {option.label}
                        {statusFilter === option.value && <Check className="w-4 h-4 text-gray-900" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

          </div>

          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {isLoadingResponses ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : responses.length === 0 ? (
              <div className="text-center py-12">
                <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">{t("Responses.Table.Empty")}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                {responses.map((response: Response) => {
                  // Map response data to card props
                  // Calculate duration minutes from string "Xm Ys" or just use 5 if invalid
                  let durationMinutes = 0;
                  if (response.duration) {
                    const match = response.duration.match(/(\d+)m/);
                    if (match) durationMinutes = parseInt(match[1]);
                  }

                  // Map sentiment string to score if score is missing (approximate)
                  let sentimentScore = response.sentimentScore ?? 0;
                  if (response.sentiment === 'positive' && !response.sentimentScore) sentimentScore = 0.8;
                  if (response.sentiment === 'negative' && !response.sentimentScore) sentimentScore = -0.8;

                  return (
                    <ConversationCard
                      key={response.id}
                      id={response.id}
                      surveyId={surveyId}
                      summary={response.summary || response.keyInsights?.[0] || t("Responses.Table.Summary")}
                      sentimentScore={sentimentScore}
                      durationMinutes={durationMinutes}
                      messageCount={response.messageCount || 0}
                      isCompleted={response.status === 'completed'}
                      createdAt={response.createdAt || new Date().toISOString()}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Pagination Controls */}
          {responses.length > 0 && (
            <div className="flex items-center justify-between border-t border-gray-200 pt-4">
              <div className="text-sm text-gray-500">
                {t.rich("Responses.Pagination.Page", {
                  current: currentPage,
                  total: totalPages,
                  span: (chunks) => <span className="font-medium text-gray-900">{chunks}</span>
                })}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1 || isLoadingResponses}
                  className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="First Page"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1 || isLoadingResponses}
                  className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Previous Page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages || isLoadingResponses}
                  className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Next Page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages || isLoadingResponses}
                  className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Last Page"
                >
                  <ChevronsRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}



      {/* Settings Tab */}
      {activeTab === "settings" && (
        <div className="max-w-2xl space-y-6">
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="font-semibold text-gray-900 mb-4">{t("Settings.Title")}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t("Settings.Fields.Title")}</label>
                <input
                  type="text"
                  value={settingsForm.title}
                  onChange={(e) => setSettingsForm({ ...settingsForm, title: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t("Settings.Fields.Limit")}</label>
                <input
                  type="number"
                  value={settingsForm.participantLimit}
                  onChange={(e) => setSettingsForm({ ...settingsForm, participantLimit: Number(e.target.value) })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 outline-none"
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                <div>
                  <h4 className="font-medium text-gray-900 mb-1">{t("Settings.VoiceMode.Title")}</h4>
                  <p className="text-sm text-gray-500">{t("Settings.VoiceMode.Description")}</p>
                </div>
                <button
                  onClick={() => setSettingsForm({ ...settingsForm, isVoice: !settingsForm.isVoice })}
                  className={cn(
                    "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2",
                    settingsForm.isVoice ? "bg-indigo-600" : "bg-gray-200"
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                      settingsForm.isVoice ? "translate-x-5" : "translate-x-0"
                    )}
                  />
                </button>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={handleSaveSettings}
                disabled={isSavingSettings}
                className="px-4 py-2.5 bg-gray-900 text-white rounded-lg font-medium text-sm hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                {isSavingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : t("Settings.Save")}
              </button>
            </div>
          </div>

          {/* Embed Widget Section */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Code className="w-5 h-5 text-gray-700" />
              <h3 className="font-semibold text-gray-900">{t("Embed.Title")}</h3>
            </div>

            {survey.status !== "active" ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-amber-900 mb-1">{t("Embed.ActiveWarning.Title")}</p>
                    <p className="text-sm text-amber-700">{t("Embed.ActiveWarning.Description")}</p>
                  </div>
                </div>
              </div>
            ) : !embedCodes ? (
              <div className="text-center py-6">
                <p className="text-gray-500 mb-4">{t("Embed.Generate.Description")}</p>
                <button
                  onClick={generateEmbedCode}
                  disabled={isLoadingEmbed}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl font-medium text-sm hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                  {isLoadingEmbed ? <Loader2 className="w-4 h-4 animate-spin" /> : <Code className="w-4 h-4" />}
                  {isLoadingEmbed ? t("Embed.Generate.Generating") : t("Embed.Generate.Button")}
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Embed Type Selector */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { id: 'inline', label: 'Inline', icon: <Code className="w-4 h-4" /> },
                    { id: 'popover', label: 'Popover', icon: <MessageSquare className="w-4 h-4" /> },
                    { id: 'sidetab', label: 'Side Tab', icon: <ChevronRight className="w-4 h-4" /> },
                    { id: 'iframe', label: 'Iframe', icon: <Copy className="w-4 h-4" /> },
                  ].map((type) => (
                    <button
                      key={type.id}
                      onClick={() => setSelectedEmbedType(type.id as any)}
                      className={cn(
                        "flex flex-col items-center gap-2 p-3 rounded-xl border text-sm font-medium transition-all",
                        selectedEmbedType === type.id
                          ? "bg-gray-900 text-white border-gray-900 shadow-md"
                          : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                      )}
                    >
                      {type.icon}
                      {type.label}
                    </button>
                  ))}
                </div>

                {/* Customization Options */}
                {(selectedEmbedType === 'popover' || selectedEmbedType === 'sidetab') && (
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Theme Color</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={embedOptions.color}
                          onChange={(e) => setEmbedOptions({ ...embedOptions, color: e.target.value })}
                          className="w-10 h-10 rounded-lg cursor-pointer border-0 p-0"
                        />
                        <input
                          type="text"
                          value={embedOptions.color}
                          onChange={(e) => setEmbedOptions({ ...embedOptions, color: e.target.value })}
                          className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                        />
                      </div>
                    </div>
                    {selectedEmbedType === 'sidetab' && (
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Tab Text</label>
                        <input
                          type="text"
                          value={embedOptions.text}
                          onChange={(e) => setEmbedOptions({ ...embedOptions, text: e.target.value })}
                          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                        />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Position</label>
                      <div className="flex bg-white p-1 rounded-lg border border-gray-200">
                        <button
                          onClick={() => setEmbedOptions({ ...embedOptions, position: 'left' })}
                          className={cn("flex-1 py-1 px-3 rounded-md text-xs transition-colors", embedOptions.position === 'left' ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50")}
                        >
                          Left
                        </button>
                        <button
                          onClick={() => setEmbedOptions({ ...embedOptions, position: 'right' })}
                          className={cn("flex-1 py-1 px-3 rounded-md text-xs transition-colors", embedOptions.position === 'right' ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50")}
                        >
                          Right
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Code Display */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700 capitalize">
                      {selectedEmbedType} Script
                    </label>
                    <button
                      onClick={() => copyEmbedCode(selectedEmbedType)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      {copiedEmbed === selectedEmbedType ? (
                        <>
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-600">{t("Embed.Options.Copied")}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          {t("Embed.Options.Copy")}
                        </>
                      )}
                    </button>
                  </div>
                  <div className="bg-gray-900 rounded-xl p-4 overflow-x-auto border border-gray-800 shadow-inner">
                    <pre className="text-xs text-emerald-400 font-mono whitespace-pre-wrap break-all">
                      {selectedEmbedType === 'inline' && embedCodes.inlineScriptSnippet}
                      {selectedEmbedType === 'popover' && embedCodes.popoverScriptSnippet.replace('#4F46E5', embedOptions.color)}
                      {selectedEmbedType === 'sidetab' && embedCodes.sideTabScriptSnippet
                        .replace('#4F46E5', embedOptions.color)
                        .replace('Feedback', embedOptions.text)
                        .replace('side-tab"', `side-tab" data-convy-position="${embedOptions.position}"`)
                      }
                      {selectedEmbedType === 'iframe' && embedCodes.iframeCode}
                    </pre>
                  </div>
                </div>

                {/* Usage Instructions */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <h4 className="font-medium text-blue-900 mb-2 flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    {selectedEmbedType === 'iframe' ? t("Embed.Instructions.Title") : "Installation Guide"}
                  </h4>
                  <ul className="text-sm text-blue-800 space-y-1.5 list-disc list-inside">
                    {selectedEmbedType === 'iframe' ? (
                      <>
                        <li>{t("Embed.Instructions.Step1")}</li>
                        <li>{t("Embed.Instructions.Step2")}</li>
                        <li>{t("Embed.Instructions.Step3")}</li>
                        <li>{t("Embed.Instructions.Step4")}</li>
                      </>
                    ) : (
                      <>
                        <li>Copy the script above and paste it into your website's HTML.</li>
                        <li>{selectedEmbedType === 'inline' ? "The survey will load inside the <div> container wherever you place it." : `A ${selectedEmbedType} button will appear automatically on your page.`}</li>
                        <li>The widget uses Shadow DOM to ensure no style conflicts with your site.</li>
                        <li>Microphone and camera permissions are automatically requested when needed.</li>
                      </>
                    )}
                  </ul>
                </div>

                {/* Survey URL */}
                <div className="pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-500 mb-1">{t("Embed.DirectLink")}</p>
                  <p className="text-sm text-gray-700 font-mono bg-gray-50 px-3 py-2 rounded-lg border border-gray-200 break-all">{embedCodes.url}</p>
                </div>
              </div>
            )}

            {embedError && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="text-sm text-red-800">{embedError}</p>
              </div>
            )}
          </div>
        </div>
      )}

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
              <h3 className="text-xl font-bold text-gray-900 mb-2">{t("DeleteModal.Title")}</h3>
              <p className="text-gray-500">
                {t.rich("DeleteModal.Description", {
                  title: survey.title,
                  span: (chunks) => <span className="font-semibold text-gray-900">"{chunks}"</span>
                })}
              </p>
            </div>

            <div className="px-6 py-4 bg-gray-50 flex items-center gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                disabled={isDeletingSurvey}
              >
                {t("DeleteModal.Cancel")}
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeletingSurvey}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-medium text-sm hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isDeletingSurvey ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t("DeleteModal.Deleting")}
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    {t("DeleteModal.Delete")}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )
      }
    </div >
  );
}
