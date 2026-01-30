"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import * as XLSX from "xlsx";
import {
  ArrowLeft,
  BarChart3,
  MessageSquare,
  Sparkles,
  Users,
  Clock,
  Share2,
  Settings,
  Play,
  Pause,
  Copy,
  ExternalLink,
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

// Types
interface Survey {
  id: string;
  title: string;
  status: "active" | "draft" | "completed" | "paused" | "creating" | "sample_review";
  createdAt: string;
  updatedAt: string;
  objective?: { description?: string };
  targetAudience?: { description?: string };
  tone?: string;
  additionalContext?: string;
  shareableLink?: string;
  shareableUrl?: string;
  participantLimit: number;
  currentParticipants: number;
  scope?: { mainTopics?: string[] };
  requiredQuestions?: string[];
  metrics?: string[];
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
}

// Mock analytics data (TODO: Integrate with real analytics API)
const analyticsData = {
  sentimentBreakdown: {
    positive: 65,
    neutral: 25,
    negative: 10,
  },
  completionFunnel: [
    { stage: "Started", count: 52, percentage: 100 },
    { stage: "25% Complete", count: 48, percentage: 92 },
    { stage: "50% Complete", count: 46, percentage: 88 },
    { stage: "75% Complete", count: 45, percentage: 87 },
    { stage: "Completed", count: 45, percentage: 87 },
  ],
  topThemes: [
    { theme: "Product Quality", mentions: 32, sentiment: "positive" as const },
    { theme: "Shipping Speed", mentions: 28, sentiment: "negative" as const },
    { theme: "Customer Support", mentions: 24, sentiment: "positive" as const },
    { theme: "Pricing", mentions: 18, sentiment: "neutral" as const },
  ],
};

type TabType = "overview" | "responses" | "analytics" | "settings";

export default function SurveyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const surveyId = params.surveyId as string;

  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [copied, setCopied] = useState(false);

  // Real data state
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [stats, setStats] = useState<SurveyStats | null>(null);
  const [responses, setResponses] = useState<Response[]>([]);
  const [analytics, setAnalytics] = useState<typeof analyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingResponses, setIsLoadingResponses] = useState(false);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const ITEMS_PER_PAGE = 10;
  const [settingsForm, setSettingsForm] = useState({
    title: "",
    additionalContext: "",
    participantLimit: 50,
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeletingSurvey, setIsDeletingSurvey] = useState(false);

  // Fetch survey details
  useEffect(() => {
    const fetchSurvey = async () => {
      try {
        const response = await fetch(`/api/surveys/${surveyId}/details`, {
          credentials: "include",
        });

        if (response.ok) {
          const data = await response.json();
          setSurvey(data.survey);
          setStats(data.stats);
          setSettingsForm({
            title: data.survey.title,
            additionalContext: data.survey.additionalContext || "",
            participantLimit: data.survey.participantLimit,
          });
        } else {
          toast.error("Failed to load survey");
        }
      } catch (error) {
        console.error("Error fetching survey:", error);
        toast.error("Failed to load survey");
      } finally {
        setIsLoading(false);
      }
    };

    fetchSurvey();
  }, [surveyId]);

  // Fetch responses when tab changes to responses or page changes
  useEffect(() => {
    if (activeTab === "responses") {
      const fetchResponses = async () => {
        setIsLoadingResponses(true);
        try {
          const response = await fetch(`/api/surveys/${surveyId}/responses?page=${currentPage}&limit=${ITEMS_PER_PAGE}&status=${statusFilter}`, {
            credentials: "include",
          });

          if (response.ok) {
            const data = await response.json();
            setResponses(data.responses || []);
            setTotalPages(data.pagination?.totalPages || 1);
          }
        } catch (error) {
          console.error("Error fetching responses:", error);
        } finally {
          setIsLoadingResponses(false);
        }
      };

      fetchResponses();
    }
  }, [activeTab, surveyId, currentPage, statusFilter]);

  const handleExport = async () => {
      const loadingToast = toast.loading("Preparing export...");
      try {
          // Fetch all data for export (high limit)
          const response = await fetch(`/api/surveys/${surveyId}/responses?limit=10000&status=${statusFilter}`, {
              credentials: "include",
          });
          
          if (!response.ok) throw new Error("Failed to fetch data");
          
          const data = await response.json();
          const responsesToExport = data.responses || [];
          
          if (responsesToExport.length === 0) {
              toast.dismiss(loadingToast);
              toast.error("No data to export");
              return;
          }

          // Format for Excel
          const exportData = responsesToExport.map((r: any) => ({
              "Participant ID": r.participantId,
              "Status": r.status,
              "Date": new Date(r.createdAt).toLocaleDateString(),
              "Time": new Date(r.createdAt).toLocaleTimeString(),
              "Duration": r.duration,
              "Message Count": r.messageCount,
              "Sentiment": r.sentiment || "N/A",
              "Key Insights": r.keyInsights.join("; ")
          }));

          // Create workbook
          const wb = XLSX.utils.book_new();
          const ws = XLSX.utils.json_to_sheet(exportData);
          XLSX.utils.book_append_sheet(wb, ws, "Responses");
          
          // Download
          XLSX.writeFile(wb, `Survey_Responses_${surveyId}_${new Date().toISOString().split('T')[0]}.xlsx`);
          
          toast.dismiss(loadingToast);
          toast.success("Export started");
      } catch (error) {
          console.error("Export failed:", error);
          toast.dismiss(loadingToast);
          toast.error("Export failed");
      }
  };

  // Fetch analytics when tab changes
  useEffect(() => {
    if (activeTab === "analytics" && !analytics) {
      const fetchAnalytics = async () => {
        setIsLoadingAnalytics(true);
        try {
          const response = await fetch(`/api/surveys/${surveyId}/analytics?format=full`, {
             credentials: "include",
          });
          if (response.ok) {
             const data = await response.json();
             if (data.status === "ready") {
                // Map API data to UI format
                const sentiment = data.executiveSummary?.overallSentiment || { score: 0 };
                // Simple mapping logic (expand as needed based on actual API return)
                const mappedAnalytics = {
                    sentimentBreakdown: {
                        positive: Math.round((sentiment.score + 1) * 50), // Rough approx from -1..1 score
                        neutral: 100 - Math.round((sentiment.score + 1) * 50) - 10,
                        negative: 10
                    },
                     completionFunnel: [
                        { stage: "Started", count: data.coreMetrics?.totalConversations || 0, percentage: 100 },
                        { stage: "Completed", count: data.coreMetrics?.completedConversations || 0, percentage: data.coreMetrics?.completionRate || 0 },
                    ],
                    topThemes: data.discoveredInsights?.emergentTopics?.map((t: any) => ({
                         theme: t.topic,
                         mentions: t.count,
                         sentiment: "neutral" // default
                    })) || []
                };
                setAnalytics(mappedAnalytics as any);
             }
          }
        } catch (error) {
           console.error("Error fetching analytics", error);
        } finally {
           setIsLoadingAnalytics(false);
        }
      };
      fetchAnalytics();
    }
  }, [activeTab, surveyId, analytics]);

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    const loadingToast = toast.loading("Saving changes...");
    try {
        const response = await fetch(`/api/surveys/${surveyId}`, {
            method: "PATCH",
             headers: { "Content-Type": "application/json" },
             body: JSON.stringify(settingsForm),
        });

        if (response.ok) {
            toast.success("Settings saved successfully", { id: loadingToast });
            // Update local survey state
            setSurvey(prev => prev ? ({ ...prev, ...settingsForm }) : null);
        } else {
            toast.error("Failed to save settings", { id: loadingToast });
        }
    } catch (error) {
        toast.error("An error occurred", { id: loadingToast });
    } finally {
        setIsSavingSettings(false);
    }
  };

  // Handle tab from URL
  useEffect(() => {
    const tabParam = searchParams.get("tab") as TabType;
    if (tabParam && ["overview", "responses", "analytics", "settings"].includes(tabParam)) {
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
        setSurvey((prev) => (prev ? { ...prev, status: newStatus } : null));
        toast.success(`Survey ${newStatus === "active" ? "resumed" : "paused"}`);
      } else {
        toast.error("Failed to update status");
      }
    } catch (error) {
      toast.error("An error occurred");
    }
  };

  const handleDelete = async () => {
    setIsDeletingSurvey(true);
    try {
      const response = await fetch(`/api/surveys/${surveyId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success("Survey deleted");
        router.push("/dashboard/surveys");
      } else {
        toast.error("Failed to delete survey");
      }
    } catch (error) {
      toast.error("An error occurred");
    } finally {
        setIsDeletingSurvey(false);
        setShowDeleteModal(false);
    }
  };

  const copyLink = () => {
    if (survey?.shareableUrl) {
      navigator.clipboard.writeText(survey.shareableUrl);
      setCopied(true);
      toast.success("Link copied!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: "overview", label: "Overview", icon: <MessageSquare className="w-4 h-4" /> },
    { id: "responses", label: "Responses", icon: <Users className="w-4 h-4" /> },
    { id: "analytics", label: "Analytics", icon: <BarChart3 className="w-4 h-4" /> },
    { id: "settings", label: "Settings", icon: <Settings className="w-4 h-4" /> },
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
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Survey not found</h2>
        <Link href="/dashboard/surveys" className="text-gray-500 hover:text-gray-700">
          ← Back to Surveys
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
              <span className="text-sm font-medium">{copied ? "Copied" : "Copy Link"}</span>
            </button>

            {survey.status === "active" ? (
              <button 
                onClick={() => handleStatusUpdate("paused")}
                className="flex items-center gap-2 px-3 py-2 bg-orange-50 text-orange-700 border border-orange-200 rounded-xl text-sm font-medium hover:bg-orange-100 transition-colors"
                title="Pause Survey"
              >
                <Pause className="w-4 h-4" />
                <span className="hidden sm:inline">Pause</span>
              </button>
            ) : survey.status === "paused" ? (
              <button 
                onClick={() => handleStatusUpdate("active")}
                className="flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-sm font-medium hover:bg-emerald-100 transition-colors"
                title="Resume Survey"
              >
                <Play className="w-4 h-4" />
                <span className="hidden sm:inline">Resume</span>
              </button>
            ) : null}
            
            {(survey.status === "draft" || survey.status === "creating" || survey.status === "sample_review") && (
              <Link
                href={`/dashboard/create?id=${survey.id}`}
                className="flex items-center gap-2 px-3 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl text-sm font-medium hover:bg-indigo-100 transition-colors shadow-sm"
              >
                <Sparkles className="w-4 h-4" />
                <span>Continue Creating</span>
              </Link>
            )}

            <button 
              onClick={() => setShowDeleteModal(true)}
              className="p-2.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all border border-transparent hover:border-red-100"
              title="Delete Survey"
            >
               <Trash2 className="w-5 h-5" />
            </button>

            <a href={survey.shareableUrl || '#'} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors shadow-sm hover:shadow">
              <ExternalLink className="w-4 h-4" />
              <span className="hidden sm:inline">Preview</span>
            </a>
          </div>
        </div>
        <p className="text-gray-500 mt-4 sm:ml-12 text-sm max-w-2xl leading-relaxed">{survey.additionalContext || survey.objective?.description || 'No description provided.'}</p>
      </div>

      {/* Sample Review Banner */}
      {survey.status === "sample_review" && (
         <div className="mb-6 p-6 bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl text-white shadow-lg overflow-hidden relative group">
            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-500">
                <Mic className="w-32 h-32" />
            </div>
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-0.5 bg-white/20 backdrop-blur-sm rounded text-[10px] font-bold uppercase tracking-wider">Required Step</span>
                <Sparkles className="w-4 h-4" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Ready for Sample Conversations</h2>
              <p className="text-blue-100 mb-6 max-w-xl">
                Your survey logic has been generated! Conduct a sample voice conversation with the AI to verify the experience before going live.
              </p>
              <Link 
                href={`/dashboard/surveys/${surveyId}/sample-review`}
                className="inline-flex items-center gap-2 px-6 py-3 bg-white text-blue-700 rounded-xl font-bold hover:bg-blue-50 transition-all shadow-md hover:shadow-xl hover:-translate-y-0.5"
              >
                <Play className="w-4 h-4 fill-current" />
                Start Sample Conversation
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
                <span className="text-sm">Responses</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{stats?.totalResponses || 0}</p>
              <p className="text-xs text-gray-400 mt-1">of {survey.participantLimit} target</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex items-center gap-2 text-gray-500 mb-2">
                <TrendingUp className="w-4 h-4" />
                <span className="text-sm">Completion</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{stats?.completionRate || 0}%</p>
              <p className="text-xs text-gray-400 mt-1">{stats?.completedResponses || 0} completed</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex items-center gap-2 text-gray-500 mb-2">
                <Clock className="w-4 h-4" />
                <span className="text-sm">Avg. Duration</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{stats?.avgDuration || '0 min'}</p>
              <p className="text-xs text-gray-400 mt-1">minutes</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex items-center gap-2 text-gray-500 mb-2">
                <Calendar className="w-4 h-4" />
                <span className="text-sm">Created</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{new Date(survey.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
              <p className="text-xs text-gray-400 mt-1">{survey.createdAt}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Share2 className="w-4 h-4" />
              Share Link
            </h3>
            <div className="flex items-center gap-2">
              <input type="text" value={survey.shareableUrl || 'Not published yet'} readOnly className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600 truncate" />
              <button onClick={copyLink} className="p-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors">
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="font-semibold text-gray-900 mb-4">Survey Configuration</h3>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-500 mb-1">Objective</p>
                <p className="text-gray-900">{survey.objective?.description || 'Not specified'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Target Audience</p>
                <p className="text-gray-900">{survey.targetAudience?.description || 'Not specified'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Conversation Tone</p>
                <p className="text-gray-900 capitalize">{survey.tone || 'casual'}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Recent Responses</h3>
              <button onClick={() => setActiveTab("responses")} className="text-sm text-gray-500 hover:text-gray-900">View all</button>
            </div>
            <div className="space-y-3">
              {responses.length > 0 ? responses.slice(0, 3).map((response) => (
                <div key={response.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-gray-50 rounded-xl gap-3 transition-colors hover:bg-gray-100/80">
                  <div className="flex items-start sm:items-center gap-3">
                    <div className={cn(
                      "w-2.5 h-2.5 rounded-full mt-1.5 sm:mt-0 shrink-0", 
                      response.status === "completed" ? "bg-emerald-500 shadow-sm shadow-emerald-200" : "bg-amber-400 shadow-sm shadow-amber-200"
                    )} />
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-gray-900">{response.participantId === 'Anonymous' ? `Participant ${response.id.slice(0,4)}` : response.participantId}</span>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span>{response.status === 'completed' ? 'Completed' : 'In Progress'}</span>
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
                <p className="text-sm text-gray-500 text-center py-4">No responses yet</p>
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
              <input type="text" placeholder="Search responses..." className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 outline-none text-sm" />
            </div>
            
            <div className="relative">
              <button
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 outline-none min-w-[160px] justify-between transition-all"
              >
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-gray-500" />
                  <span>
                    {statusFilter === "all" && "All Status"}
                    {statusFilter === "completed" && "Completed"}
                    {statusFilter === "in_progress" && "In Progress"}
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
                      { value: "all", label: "All Status" },
                      { value: "completed", label: "Completed" },
                      { value: "in_progress", label: "In Progress" }
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

            <button 
                onClick={handleExport}
                className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
 
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {isLoadingResponses ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : responses.length === 0 ? (
              <div className="text-center py-12">
                <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No responses yet</p>
              </div>
            ) : (
              <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Participant</th>
                      <th className="text-left px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="text-left px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="text-left px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Duration</th>
                      <th className="text-left px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Sentiment</th>
                      <th className="text-left px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider hidden md:table-cell">Key Insights</th>
                      <th className="text-right px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {responses.map((response) => (
                      <tr key={response.id} className="hover:bg-gray-50/50 transition-colors group">
                        <td className="px-6 py-4">
                          <span className="text-sm font-semibold text-gray-900">{response.participantId === 'Anonymous' ? `Participant ${response.id.slice(0,4)}` : response.participantId}</span>
                        </td>
                        <td className="px-6 py-4">
                            <span className={cn(
                                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium capitalize",
                                response.status === "completed" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-amber-50 text-amber-700 border border-amber-100"
                            )}>
                                <span className={cn("w-1.5 h-1.5 rounded-full", response.status === "completed" ? "bg-emerald-500" : "bg-amber-500")} />
                                {response.status === "completed" ? "Completed" : "In Progress"}
                            </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                              <span className="text-sm text-gray-700">{response.completedAt ? new Date(response.completedAt).toLocaleDateString() : new Date(response.createdAt || Date.now()).toLocaleDateString()}</span>
                              <span className="text-xs text-gray-400">{response.completedAt ? new Date(response.completedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm font-mono text-gray-600 bg-gray-50 px-2 py-1 rounded border border-gray-100">{response.duration}</span>
                        </td>
                        <td className="px-6 py-4">
                          {response.sentiment ? (
                            <span className={cn(
                                "inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold uppercase tracking-wider", 
                                response.sentiment === "positive" && "bg-emerald-100 text-emerald-700", 
                                response.sentiment === "neutral" && "bg-gray-100 text-gray-600", 
                                response.sentiment === "negative" && "bg-red-100 text-red-700"
                            )}>
                              {response.sentiment}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400 italic">Analysis Pending</span>
                          )}
                        </td>
                        <td className="px-6 py-4 hidden md:table-cell">
                          <div className="flex flex-wrap gap-1.5">
                            {response.keyInsights.slice(0, 2).map((insight, idx) => (
                              <span key={idx} className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded text-xs max-w-[150px] truncate" title={insight}>{insight}</span>
                            ))}
                            {response.keyInsights.length === 0 && <span className="text-xs text-gray-400">—</span>}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Link href={`/dashboard/surveys/${surveyId}/responses/${response.id}`} className="inline-flex items-center justify-center w-8 h-8 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-900 transition-colors">
                            <ArrowLeft className="w-4 h-4 rotate-180" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
              </table>
            )}
          </div>

          {/* Pagination Controls */}
          {responses.length > 0 && (
            <div className="flex items-center justify-between border-t border-gray-200 pt-4">
              <div className="text-sm text-gray-500">
                Page <span className="font-medium text-gray-900">{currentPage}</span> of <span className="font-medium text-gray-900">{totalPages}</span>
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

      {/* Analytics Tab */}
      {activeTab === "analytics" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {isLoadingAnalytics ? (
             <div className="col-span-3 flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>
          ) : !analytics ? (
              <div className="col-span-3 text-center py-12 text-gray-500">No analytics data available yet. Collect more responses.</div>
          ) : (
            <>
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="font-semibold text-gray-900 mb-4">Sentiment Breakdown</h3>
                <div className="space-y-3">
                  {/* Using mapped analytics data */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-600">Positive</span>
                      <span className="text-sm font-medium text-gray-900">{analytics.sentimentBreakdown.positive}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${analytics.sentimentBreakdown.positive}%` }} />
                    </div>
                  </div>
                   {/* ... Simplified for brevity, normally would map fully ... */}
                </div>
              </div>

               <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="font-semibold text-gray-900 mb-4">Completion Funnel</h3>
                <div className="space-y-3">
                  {analytics.completionFunnel.map((stage) => (
                    <div key={stage.stage} className="flex items-center gap-4">
                      <div className="w-28 text-sm text-gray-600">{stage.stage}</div>
                      <div className="flex-1 h-8 bg-gray-100 rounded-lg overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-lg flex items-center justify-end pr-3" style={{ width: `${stage.percentage}%` }}>
                          <span className="text-xs font-medium text-white">{stage.count}</span>
                        </div>
                      </div>
                      <div className="w-12 text-sm font-medium text-gray-900 text-right">{stage.percentage}%</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-3 bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="font-semibold text-gray-900 mb-4">Top Themes</h3>
                 {analytics.topThemes.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {analytics.topThemes.map((theme) => (
                        <div key={theme.theme} className={cn("p-4 rounded-xl border bg-gray-50 border-gray-100")}>
                        <h4 className="font-medium text-gray-900 mb-1">{theme.theme}</h4>
                        <p className="text-sm text-gray-500">{theme.mentions} mentions</p>
                        </div>
                    ))}
                    </div>
                 ) : (
                     <p className="text-sm text-gray-500">No themes detected yet.</p>
                 )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === "settings" && (
        <div className="max-w-2xl space-y-6">
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="font-semibold text-gray-900 mb-4">Survey Settings</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Survey Title</label>
                <input 
                    type="text" 
                    value={settingsForm.title}
                    onChange={(e) => setSettingsForm({...settingsForm, title: e.target.value})}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 outline-none" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea 
                    value={settingsForm.additionalContext}
                    onChange={(e) => setSettingsForm({...settingsForm, additionalContext: e.target.value})}
                    rows={3} 
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 outline-none resize-none" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Response Limit</label>
                <input 
                    type="number" 
                    value={settingsForm.participantLimit}
                    onChange={(e) => setSettingsForm({...settingsForm, participantLimit: Number(e.target.value)})}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 outline-none" 
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button 
                onClick={handleSaveSettings}
                disabled={isSavingSettings}
                className="px-4 py-2.5 bg-gray-900 text-white rounded-lg font-medium text-sm hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                {isSavingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Changes"}
              </button>
            </div>
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
              <h3 className="text-xl font-bold text-gray-900 mb-2">Delete Survey</h3>
              <p className="text-gray-500">
                Are you sure you want to delete <span className="font-semibold text-gray-900">"{survey.title}"</span>? 
                This action cannot be undone and will permanently remove all responses.
              </p>
            </div>

            <div className="px-6 py-4 bg-gray-50 flex items-center gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                disabled={isDeletingSurvey}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeletingSurvey}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-medium text-sm hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isDeletingSurvey ? (
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
