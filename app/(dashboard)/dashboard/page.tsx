"use client";

import Link from "next/link";
import {
  MessageSquare,
  Users,
  BarChart3,
  TrendingUp,
  Plus,
  ArrowUpRight,
  Mic,
  Clock,
  Sparkles,
  FolderOpen,
  Plug,
} from "lucide-react";
import { StatsCard } from "@/components/dashboard/stats-card";
import { SurveyCard } from "@/components/dashboard/survey-card";
import { ActivityFeed } from "@/components/dashboard/activity-feed";

// This would come from API/database
const stats = [
  {
    name: "Total Surveys",
    value: "12",
    change: "+2 this week",
    changeType: "positive" as const,
    icon: MessageSquare,
    iconColor: "bg-blue-50 text-blue-600",
  },
  {
    name: "Total Responses",
    value: "1,247",
    change: "+18% from last month",
    changeType: "positive" as const,
    icon: Users,
    iconColor: "bg-purple-50 text-purple-600",
  },
  {
    name: "Completion Rate",
    value: "87%",
    change: "+5% improvement",
    changeType: "positive" as const,
    icon: BarChart3,
    iconColor: "bg-emerald-50 text-emerald-600",
  },
  {
    name: "Avg. Duration",
    value: "3.2 min",
    change: "12% faster",
    changeType: "positive" as const,
    icon: TrendingUp,
    iconColor: "bg-amber-50 text-amber-600",
  },
];

const recentSurveys = [
  {
    id: "1",
    title: "Customer Satisfaction Survey",
    status: "active" as const,
    responses: 45,
    maxResponses: 50,
    lastActivity: "2 hours ago",
    createdAt: "2 days ago",
    isVoice: false,
    projectName: "Q1 Research",
  },
  {
    id: "2",
    title: "Product Feedback Collection",
    status: "draft" as const,
    responses: 0,
    maxResponses: 100,
    lastActivity: "Never",
    createdAt: "1 week ago",
    isVoice: true,
  },
  {
    id: "3",
    title: "Employee Engagement Survey",
    status: "completed" as const,
    responses: 128,
    maxResponses: 128,
    lastActivity: "1 week ago",
    createdAt: "2 weeks ago",
    isVoice: false,
    projectName: "HR Insights",
  },
];

const activities = [
  {
    id: "1",
    type: "new_response" as const,
    title: "New response received",
    description: "Customer Satisfaction Survey",
    time: "2m ago",
  },
  {
    id: "2",
    type: "survey_created" as const,
    title: "Survey created",
    description: "Product Feedback Collection",
    time: "1h ago",
  },
  {
    id: "3",
    type: "analytics_ready" as const,
    title: "Analytics report ready",
    description: "Weekly summary generated",
    time: "3h ago",
  },
  {
    id: "4",
    type: "team_joined" as const,
    title: "Team member joined",
    description: "John Doe accepted invitation",
    time: "5h ago",
  },
  {
    id: "5",
    type: "voice_session" as const,
    title: "Voice session completed",
    description: "Employee Engagement Survey",
    time: "1d ago",
  },
];

const quickActions = [
  {
    title: "Create Survey",
    description: "Build AI-powered forms",
    icon: Sparkles,
    href: "/dashboard/create",
    color: "from-blue-500 to-cyan-500",
  },
  {
    title: "View Analytics",
    description: "Insights & reports",
    icon: BarChart3,
    href: "/dashboard/analytics",
    color: "from-purple-500 to-pink-500",
  },
  {
    title: "Manage Projects",
    description: "Organize your surveys",
    icon: FolderOpen,
    href: "/dashboard/projects",
    color: "from-amber-500 to-orange-500",
  },
  {
    title: "Integrations",
    description: "Connect your tools",
    icon: Plug,
    href: "/dashboard/integrations",
    color: "from-emerald-500 to-teal-500",
  },
];

export default function DashboardPage() {
  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
            Welcome back! 👋
          </h1>
          <p className="text-gray-500 mt-1">
            Here's what's happening with your surveys today.
          </p>
        </div>
        <Link
          href="/dashboard/create"
          className="flex items-center justify-center gap-2 px-5 py-3 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-colors group w-full sm:w-auto"
        >
          <Plus className="w-5 h-5" />
          Create Survey
          <ArrowUpRight className="w-4 h-4 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {stats.map((stat) => (
          <StatsCard
            key={stat.name}
            title={stat.name}
            value={stat.value}
            change={stat.change}
            changeType={stat.changeType}
            icon={stat.icon}
            iconColor={stat.iconColor}
          />
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {quickActions.map((action) => (
          <Link
            key={action.title}
            href={action.href}
            className="group bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-lg hover:border-gray-200 transition-all duration-300"
          >
            <div
              className={`w-11 h-11 rounded-xl bg-gradient-to-br ${action.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}
            >
              <action.icon className="w-5 h-5 text-white" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-1">{action.title}</h3>
            <p className="text-sm text-gray-500">{action.description}</p>
          </Link>
        ))}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Surveys - Takes 2 columns */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Recent Surveys</h2>
            <Link
              href="/surveys"
              className="text-sm font-medium text-gray-500 hover:text-gray-900 flex items-center gap-1 transition-colors"
            >
              View all
              <ArrowUpRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-4">
            {recentSurveys.map((survey) => (
              <SurveyCard key={survey.id} {...survey} />
            ))}
          </div>

          {/* Empty state for when there are no surveys */}
          {recentSurveys.length === 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No surveys yet</h3>
              <p className="text-gray-500 mb-6 max-w-sm mx-auto">
                Get started by creating your first AI-powered survey
              </p>
              <Link
                href="/surveys/create"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create Your First Survey
              </Link>
            </div>
          )}
        </div>

        {/* Activity Feed - Takes 1 column */}
        <div className="lg:col-span-1">
          <ActivityFeed activities={activities} />
        </div>
      </div>
    </div>
  );
}