"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
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
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingResponses, setIsLoadingResponses] = useState(false);

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

  // Fetch responses when tab changes to responses
  useEffect(() => {
    if (activeTab === "responses" && responses.length === 0) {
      const fetchResponses = async () => {
        setIsLoadingResponses(true);
        try {
          const response = await fetch(`/api/surveys/${surveyId}/responses`, {
            credentials: "include",
          });

          if (response.ok) {
            const data = await response.json();
            setResponses(data.responses || []);
          }
        } catch (error) {
          console.error("Error fetching responses:", error);
        } finally {
          setIsLoadingResponses(false);
        }
      };

      fetchResponses();
    }
  }, [activeTab, surveyId, responses.length]);

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
    if (!confirm("Are you sure you want to delete this survey?")) return;

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
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard/surveys" className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-gray-900">{survey.title}</h1>
              <span className={cn(
                "px-2.5 py-1 rounded-full text-xs font-medium capitalize",
                survey.status === "active" && "bg-emerald-50 text-emerald-700 border border-emerald-200",
                survey.status === "draft" && "bg-amber-50 text-amber-700 border border-amber-200",
                survey.status === "completed" && "bg-gray-50 text-gray-700 border border-gray-200",
                survey.status === "paused" && "bg-orange-50 text-orange-700 border border-orange-200",
                survey.status === "sample_review" && "bg-blue-50 text-blue-700 border border-blue-200"
              )}>
                {survey.status.replace('_', ' ')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={copyLink} className="flex flex-col items-center gap-0.5 px-4 py-2 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors min-w-[70px]">
              {copied ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              <span className="text-xs font-medium">{copied ? "Copied!" : "Copy Link"}</span>
            </button>

            {survey.status === "active" ? (
              <button 
                onClick={() => handleStatusUpdate("paused")}
                className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-medium hover:bg-orange-600 transition-colors"
                title="Pause Survey"
              >
                <Pause className="w-4 h-4" />
                Pause
              </button>
            ) : survey.status === "paused" ? (
              <button 
                onClick={() => handleStatusUpdate("active")}
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-medium hover:bg-emerald-600 transition-colors"
                title="Resume Survey"
              >
                <Play className="w-4 h-4" />
                Resume
              </button>
            ) : null}

            <button 
              onClick={handleDelete}
              className="p-2.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
              title="Delete Survey"
            >
              <div className="w-5 h-5 flex items-center justify-center">
                <span className="text-xl">×</span>
              </div>
            </button>

            <a href={survey.shareableUrl || '#'} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors">
              <ExternalLink className="w-4 h-4" />
              Preview
            </a>
          </div>
        </div>
        <p className="text-gray-500 mt-3 ml-14 text-sm">{survey.additionalContext || survey.objective?.description || 'No description'}</p>
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
              <p className="text-2xl font-bold text-gray-900">{stats?.avgDuration || '~3 min'}</p>
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
                <div key={response.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={cn("w-2 h-2 rounded-full", response.sentiment === "positive" && "bg-emerald-500", response.sentiment === "neutral" && "bg-amber-500", response.sentiment === "negative" && "bg-red-500", !response.sentiment && "bg-gray-300")} />
                    <span className="text-sm text-gray-700">{response.completedAt ? new Date(response.completedAt).toLocaleString() : 'In progress'}</span>
                  </div>
                  <span className="text-xs text-gray-500">{response.duration}</span>
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
            <button className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
              <Filter className="w-4 h-4" />
              Filter
            </button>
            <button className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
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
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Participant</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Completed</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Duration</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Sentiment</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Key Insights</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {responses.map((response) => (
                    <tr key={response.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="text-sm font-medium text-gray-900">{response.participantId}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-600">{response.completedAt ? new Date(response.completedAt).toLocaleString() : 'In progress'}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-600">{response.duration}</span>
                      </td>
                      <td className="px-6 py-4">
                        {response.sentiment ? (
                          <span className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium capitalize", response.sentiment === "positive" && "bg-emerald-50 text-emerald-700", response.sentiment === "neutral" && "bg-amber-50 text-amber-700", response.sentiment === "negative" && "bg-red-50 text-red-700")}>
                            {response.sentiment}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">N/A</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {response.keyInsights.slice(0, 2).map((insight, idx) => (
                            <span key={idx} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{insight}</span>
                          ))}
                          {response.keyInsights.length === 0 && <span className="text-xs text-gray-400">—</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link href={`/dashboard/surveys/${surveyId}/responses/${response.id}`} className="text-sm text-gray-500 hover:text-gray-900">View →</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Analytics Tab */}
      {activeTab === "analytics" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="font-semibold text-gray-900 mb-4">Sentiment Breakdown</h3>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-600">Positive</span>
                  <span className="text-sm font-medium text-gray-900">{analyticsData.sentimentBreakdown.positive}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${analyticsData.sentimentBreakdown.positive}%` }} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-600">Neutral</span>
                  <span className="text-sm font-medium text-gray-900">{analyticsData.sentimentBreakdown.neutral}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: `${analyticsData.sentimentBreakdown.neutral}%` }} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-600">Negative</span>
                  <span className="text-sm font-medium text-gray-900">{analyticsData.sentimentBreakdown.negative}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-red-500 rounded-full" style={{ width: `${analyticsData.sentimentBreakdown.negative}%` }} />
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="font-semibold text-gray-900 mb-4">Completion Funnel</h3>
            <div className="space-y-3">
              {analyticsData.completionFunnel.map((stage) => (
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {analyticsData.topThemes.map((theme) => (
                <div key={theme.theme} className={cn("p-4 rounded-xl border", theme.sentiment === "positive" && "bg-emerald-50/50 border-emerald-100", theme.sentiment === "neutral" && "bg-amber-50/50 border-amber-100", theme.sentiment === "negative" && "bg-red-50/50 border-red-100")}>
                  <h4 className="font-medium text-gray-900 mb-1">{theme.theme}</h4>
                  <p className="text-sm text-gray-500">{theme.mentions} mentions</p>
                  <span className={cn("inline-block mt-2 px-2 py-0.5 rounded-full text-xs font-medium capitalize", theme.sentiment === "positive" && "bg-emerald-100 text-emerald-700", theme.sentiment === "neutral" && "bg-amber-100 text-amber-700", theme.sentiment === "negative" && "bg-red-100 text-red-700")}>
                    {theme.sentiment}
                  </span>
                </div>
              ))}
            </div>
          </div>
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
                <input type="text" defaultValue={survey.title} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea defaultValue={survey.additionalContext || ''} rows={3} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 outline-none resize-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Response Limit</label>
                <input type="number" defaultValue={survey.participantLimit} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 outline-none" />
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button className="px-4 py-2.5 bg-gray-900 text-white rounded-lg font-medium text-sm hover:bg-gray-800 transition-colors">
                Save Changes
              </button>
            </div>
          </div>

          <div className="bg-red-50 rounded-xl border border-red-200 p-5">
            <h3 className="font-semibold text-red-900 mb-2">Danger Zone</h3>
            <p className="text-sm text-red-700 mb-4">Once you delete a survey, there is no going back. Please be certain.</p>
            <button className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors">
              Delete Survey
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
