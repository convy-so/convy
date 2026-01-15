"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  Filter,
  Eye,
  Edit,
  Trash2,
  Copy,
  BarChart3,
  MessageSquare,
  Users,
  Mic,
  MoreVertical,
  ExternalLink,
  TrendingUp,
  Clock,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Mock data - replace with real data from your API
const yourSurveys = [
  {
    id: "1",
    title: "Customer Satisfaction Survey",
    description: "Measuring customer happiness and service quality",
    status: "active",
    responses: 45,
    completionRate: 87,
    createdAt: "2024-01-10",
    lastResponse: "2 hours ago",
    isOwner: true,
    isVoice: false,
  },
  {
    id: "2",
    title: "Product Feedback Collection",
    description: "Gathering insights on new product features",
    status: "draft",
    responses: 0,
    completionRate: 0,
    createdAt: "2024-01-08",
    lastResponse: "Never",
    isOwner: true,
    isVoice: true,
  },
  {
    id: "3",
    title: "Employee Engagement Survey",
    description: "Understanding workplace satisfaction and culture",
    status: "completed",
    responses: 128,
    completionRate: 94,
    createdAt: "2024-01-05",
    lastResponse: "1 week ago",
    isOwner: true,
    isVoice: false,
  },
];

const sharedSurveys = [
  {
    id: "4",
    title: "Website Usability Study",
    description: "Evaluating user experience on our website",
    status: "active",
    responses: 23,
    completionRate: 76,
    createdAt: "2024-01-03",
    lastResponse: "1 day ago",
    isOwner: false,
    sharedBy: "John Doe",
    role: "viewer",
    isVoice: false,
  },
  {
    id: "5",
    title: "Brand Awareness Research",
    description: "Market perception and brand recognition study",
    status: "paused",
    responses: 67,
    completionRate: 82,
    createdAt: "2023-12-28",
    lastResponse: "3 days ago",
    isOwner: false,
    sharedBy: "Sarah Wilson",
    role: "editor",
    isVoice: true,
  },
];

const statusColors = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  draft: "bg-amber-50 text-amber-700 border-amber-200",
  completed: "bg-gray-100 text-gray-600 border-gray-200",
  paused: "bg-orange-50 text-orange-700 border-orange-200",
};

export default function SurveysPage() {
  const [activeTab, setActiveTab] = useState<"yours" | "shared">("yours");
  const [showMenuFor, setShowMenuFor] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const currentSurveys = activeTab === "yours" ? yourSurveys : sharedSurveys;

  const filteredSurveys = currentSurveys.filter(survey => {
    const matchesSearch = survey.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === "all" || survey.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

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
          className="flex items-center justify-center gap-2 px-5 py-3 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Create Survey
        </Link>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-6">
          <button
            onClick={() => setActiveTab("yours")}
            className={cn(
              "py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2",
              activeTab === "yours"
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            )}
          >
            <MessageSquare className="w-4 h-4" />
            Your Surveys
            <span className={cn(
              "px-2 py-0.5 rounded-full text-xs font-medium",
              activeTab === "yours" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"
            )}>
              {yourSurveys.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("shared")}
            className={cn(
              "py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2",
              activeTab === "shared"
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            )}
          >
            <Users className="w-4 h-4" />
            Shared with You
            <span className={cn(
              "px-2 py-0.5 rounded-full text-xs font-medium",
              activeTab === "shared" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"
            )}>
              {sharedSurveys.length}
            </span>
          </button>
        </nav>
      </div>

      {/* Filters and Search */}
      <div className="flex items-center gap-4">
        <div className="flex-1 max-w-md relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search surveys..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 outline-none transition-all"
          />
        </div>

        <div className="relative">
          <button
            onClick={() => setShowFilterDropdown(!showFilterDropdown)}
            className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700"
          >
            <Filter className="w-4 h-4" />
            {filterStatus === "all" ? "All Status" : filterStatus.charAt(0).toUpperCase() + filterStatus.slice(1)}
            <ChevronDown className="w-4 h-4" />
          </button>

          {showFilterDropdown && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowFilterDropdown(false)} />
              <div className="absolute right-0 top-full mt-2 w-40 bg-white rounded-xl border border-gray-200 shadow-xl z-50 py-1">
                {["all", "active", "draft", "completed", "paused"].map((status) => (
                  <button
                    key={status}
                    onClick={() => {
                      setFilterStatus(status);
                      setShowFilterDropdown(false);
                    }}
                    className={cn(
                      "w-full text-left px-4 py-2 text-sm transition-colors capitalize",
                      filterStatus === status ? "bg-gray-50 text-gray-900 font-medium" : "text-gray-600 hover:bg-gray-50"
                    )}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Surveys Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredSurveys.map((survey) => (
          <div
            key={survey.id}
            className="bg-white  rounded-2xl border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all duration-300 group"
          >
            {/* Card Header */}
            <div className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "px-2 py-0.5 rounded-full text-xs font-medium border capitalize",
                    statusColors[survey.status as keyof typeof statusColors]
                  )}>
                    {survey.status}
                  </span>
                  {survey.isVoice && (
                    <span className="flex items-center gap-1 px-2 py-0.5 bg-purple-50 text-purple-600 rounded-full text-xs font-medium">
                      <Mic className="w-3 h-3" />
                      Voice
                    </span>
                  )}
                </div>

                <div className="relative">
                  <button
                    onClick={() => setShowMenuFor(showMenuFor === survey.id ? null : survey.id)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>

                  {showMenuFor === survey.id && (
                    <>
                      <div className="fixed inset-0 z-[60]" onClick={() => setShowMenuFor(null)} />
                      <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl border border-gray-200 shadow-xl z-[70] py-1">
                        <Link
                          href={`/dashboard/surveys/${survey.id}`}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <Eye className="w-4 h-4" />
                          View Details
                        </Link>
                        <Link
                          href={`/dashboard/surveys/${survey.id}?tab=analytics`}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <BarChart3 className="w-4 h-4" />
                          Analytics
                        </Link>
                        {(survey.isOwner || (survey as any).role === 'editor') && (
                          <Link
                            href={`/dashboard/surveys/${survey.id}?tab=settings`}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            onClick={() => setShowMenuFor(null)}
                          >
                            <Edit className="w-4 h-4" />
                            Edit
                          </Link>
                        )}
                        <button className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                          <Copy className="w-4 h-4" />
                          Duplicate
                        </button>
                        {survey.isOwner && (
                          <>
                            <div className="border-t border-gray-100 my-1" />
                            <button className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                              <Trash2 className="w-4 h-4" />
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <Link href={`/dashboard/surveys/${survey.id}`}>
                <h3 className="font-semibold text-gray-900 mb-1 group-hover:text-blue-600 transition-colors">
                  {survey.title}
                </h3>
              </Link>
              <p className="text-sm text-gray-500 line-clamp-2">
                {survey.description}
              </p>

              {/* Shared By (for shared surveys) */}
              {!survey.isOwner && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs text-gray-400">Shared by</span>
                  <span className="text-xs font-medium text-gray-600">{(survey as any).sharedBy}</span>
                  <span className={cn(
                    "px-1.5 py-0.5 rounded text-xs font-medium capitalize",
                    (survey as any).role === "editor" ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-600"
                  )}>
                    {(survey as any).role}
                  </span>
                </div>
              )}
            </div>

            {/* Card Footer */}
            <div className="border-t border-gray-50 px-5 py-3 bg-gray-50/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1.5 text-gray-600">
                    <Users className="w-4 h-4" />
                    <span className="font-medium">{survey.responses}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-gray-600">
                    <TrendingUp className="w-4 h-4" />
                    <span className="font-medium">{survey.completionRate}%</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                  <Clock className="w-3.5 h-3.5" />
                  {survey.lastResponse}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {filteredSurveys.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          {searchQuery || filterStatus !== "all" ? (
            <>
              <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No matching surveys</h3>
              <p className="text-gray-500 mb-4">Try adjusting your search or filter criteria</p>
              <button
                onClick={() => {
                  setSearchQuery("");
                  setFilterStatus("all");
                }}
                className="text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                Clear filters
              </button>
            </>
          ) : activeTab === "yours" ? (
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
          ) : (
            <>
              <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No shared surveys</h3>
              <p className="text-gray-500">Surveys shared with you by team members will appear here</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}