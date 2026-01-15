"use client";

import { useState } from "react";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Users,
  Clock,
  MessageSquare,
  Mic,
  Calendar,
  Download,
  ChevronDown,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Mock analytics data
const overviewStats = [
  {
    name: "Total Responses",
    value: "2,847",
    change: "+12.5%",
    changeType: "positive",
    period: "vs last month",
    icon: Users,
    color: "bg-blue-500",
  },
  {
    name: "Completion Rate",
    value: "78.3%",
    change: "+5.2%",
    changeType: "positive",
    period: "vs last month",
    icon: BarChart3,
    color: "bg-emerald-500",
  },
  {
    name: "Avg. Duration",
    value: "4:32",
    change: "-0:45",
    changeType: "positive",
    period: "faster",
    icon: Clock,
    color: "bg-purple-500",
  },
  {
    name: "Active Surveys",
    value: "8",
    change: "+3",
    changeType: "positive",
    period: "this week",
    icon: MessageSquare,
    color: "bg-amber-500",
  },
];

const surveyPerformance = [
  { name: "Customer Satisfaction", responses: 542, completion: 92, trend: "up", change: "+8%" },
  { name: "Product Feedback", responses: 387, completion: 85, trend: "up", change: "+12%" },
  { name: "Employee Engagement", responses: 256, completion: 78, trend: "down", change: "-3%" },
  { name: "Market Research", responses: 198, completion: 71, trend: "up", change: "+5%" },
  { name: "User Testing", responses: 145, completion: 68, trend: "stable", change: "0%" },
];

const responsesByDay = [
  { day: "Mon", text: 45, voice: 12, total: 57 },
  { day: "Tue", text: 52, voice: 18, total: 70 },
  { day: "Wed", text: 48, voice: 15, total: 63 },
  { day: "Thu", text: 61, voice: 22, total: 83 },
  { day: "Fri", text: 55, voice: 19, total: 74 },
  { day: "Sat", text: 28, voice: 8, total: 36 },
  { day: "Sun", text: 22, voice: 5, total: 27 },
];

const topInsights = [
  { text: "Users appreciate quick response times", count: 127, sentiment: "positive" },
  { text: "Mobile experience needs improvement", count: 89, sentiment: "negative" },
  { text: "Customer support is highly rated", count: 76, sentiment: "positive" },
  { text: "Pricing concerns among new users", count: 54, sentiment: "negative" },
];

const responseTypes = [
  { type: "Text", count: 1842, percentage: 65, color: "bg-blue-500" },
  { type: "Voice", count: 1005, percentage: 35, color: "bg-purple-500" },
];

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState("30d");
  const [showDateDropdown, setShowDateDropdown] = useState(false);

  const dateRanges = [
    { value: "7d", label: "Last 7 days" },
    { value: "30d", label: "Last 30 days" },
    { value: "90d", label: "Last 90 days" },
    { value: "1y", label: "Last year" },
  ];

  const maxTotal = Math.max(...responsesByDay.map(d => d.total));

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Analytics</h1>
          <p className="text-gray-500 mt-1">
            Track performance and insights across all your surveys
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Date Range Selector */}
          <div className="relative">
            <button
              onClick={() => setShowDateDropdown(!showDateDropdown)}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Calendar className="w-4 h-4 text-gray-500" />
              {dateRanges.find(d => d.value === dateRange)?.label}
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>

            {showDateDropdown && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowDateDropdown(false)} />
                <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl border border-gray-200 shadow-xl z-50 py-1">
                  {dateRanges.map((range) => (
                    <button
                      key={range.value}
                      onClick={() => {
                        setDateRange(range.value);
                        setShowDateDropdown(false);
                      }}
                      className={cn(
                        "w-full text-left px-4 py-2.5 text-sm transition-colors",
                        dateRange === range.value
                          ? "bg-gray-50 text-gray-900 font-medium"
                          : "text-gray-600 hover:bg-gray-50"
                      )}
                    >
                      {range.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Export Button */}
          <button className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors">
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {overviewStats.map((stat) => (
          <div
            key={stat.name}
            className="bg-white rounded-2xl border border-gray-100 p-5 hover:border-gray-200 transition-all duration-300"
          >
            <div className="flex items-start justify-between mb-3">
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center",
                stat.color
              )}>
                <stat.icon className="w-5 h-5 text-white" />
              </div>
              <div className={cn(
                "flex items-center gap-1 text-sm font-medium",
                stat.changeType === "positive" ? "text-emerald-600" : "text-red-600"
              )}>
                {stat.changeType === "positive" ? (
                  <ArrowUpRight className="w-4 h-4" />
                ) : (
                  <ArrowDownRight className="w-4 h-4" />
                )}
                {stat.change}
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900 mb-1">{stat.value}</p>
            <p className="text-sm text-gray-500">{stat.name}</p>
          </div>
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Responses by Day - Large Chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-base font-semibold text-gray-900">Responses by Day</h3>
              <p className="text-sm text-gray-500">Weekly response distribution</p>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <span className="text-gray-600">Text</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-purple-500" />
                <span className="text-gray-600">Voice</span>
              </div>
            </div>
          </div>

          {/* Modern Stacked Bar Chart - Image 5 Style */}
          <div className="relative">
            {/* Y-axis labels */}
            <div className="absolute left-0 top-0 bottom-8 w-8 flex flex-col justify-between text-xs text-gray-400">
              <span>200</span>
              <span>175</span>
              <span>150</span>       
              <span>125</span>
              <span>100</span>
              <span>75</span>
              <span>50</span>
              <span>25</span>
              <span>0</span>
            </div>

            {/* Grid lines */}
            <div className="ml-10 relative">
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                {[0, 1, 2, 3, 4,5,6,7,8,9].map((i) => (
                  <div key={i} className="border-t border-gray-100" />
                ))}
              </div>

              {/* Stacked Pill Bars */}
              <div className="flex items-end justify-between gap-3 h-80 pt-2">
                {responsesByDay.map((day) => {
                  const totalHeight = (day.total / 100) * 100;
                  const voicePercentage = (day.voice / day.total) * 100;

                  return (
                    <div key={day.day} className="flex-1 flex flex-col items-center group h-full justify-end">
                      {/* Tooltip */}
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity mb-2 bg-gray-900 text-white text-xs px-3 py-1.5 rounded-lg whitespace-nowrap shadow-lg z-10">
                        <div className="flex flex-col gap-0.5">
                          <span>Total: {day.total}</span>
                          <span className="text-blue-300">Text: {day.text}</span>
                          <span className="text-purple-300">Voice: {day.voice}</span>
                        </div>
                      </div>

                      {/* Stacked Bar - Pill Style */}
                      <div className="w-10 h-full flex items-end justify-center max-h-[90%]">
                        <div
                          className="w-full rounded-full overflow-hidden bg-blue-200 transition-all duration-300 hover:scale-105 relative"
                          style={{ height: `${totalHeight}%` }}
                        >
                          {/* Inner bar (Voice) */}
                          <div
                            className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-purple-600 to-purple-500 rounded-full transition-all"
                            style={{ height: `${voicePercentage}%` }}
                          />
                          {/* Outer bar (Text) - fills remaining */}
                          <div
                            className="absolute top-0 left-0 right-0 bg-gradient-to-b from-blue-500 to-blue-400 rounded-t-full"
                            style={{ height: `${100 - voicePercentage}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-sm font-medium text-gray-600 mt-3">{day.day}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Response Types Breakdown */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <div className="mb-6">
            <h3 className="text-base font-semibold text-gray-900">Response Types</h3>
            <p className="text-sm text-gray-500">Text vs Voice distribution</p>
          </div>

          {/* Donut Chart Visualization */}
          <div className="relative flex items-center justify-center mb-6">
            <div className="relative w-40 h-40">
              <svg viewBox="0 0 100 100" className="transform -rotate-90">
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="#E5E7EB"
                  strokeWidth="12"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="#3B82F6"
                  strokeWidth="12"
                  strokeDasharray={`${65 * 2.51} ${100 * 2.51}`}
                  strokeLinecap="round"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="#8B5CF6"
                  strokeWidth="12"
                  strokeDasharray={`${35 * 2.51} ${100 * 2.51}`}
                  strokeDashoffset={`${-65 * 2.51}`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900">2,847</p>
                  <p className="text-xs text-gray-500">Total</p>
                </div>
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="space-y-3">
            {responseTypes.map((type) => (
              <div key={type.type} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn("w-3 h-3 rounded-full", type.color)} />
                  <span className="text-sm font-medium text-gray-700">{type.type}</span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-semibold text-gray-900">{type.count.toLocaleString()}</span>
                  <span className="text-sm text-gray-500 ml-2">({type.percentage}%)</span>
                </div>
              </div>
            ))}
          </div>

          {/* Quick insight */}
          <div className="mt-6 p-3 bg-blue-50 rounded-xl">
            <p className="text-sm text-blue-700">
              <span className="font-medium">Voice responses</span> have 23% higher completion rates
            </p>
          </div>
        </div>
      </div>

      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Survey Performance Table */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-base font-semibold text-gray-900">Survey Performance</h3>
            <p className="text-sm text-gray-500">Detailed breakdown by survey</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Survey
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Responses
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Completion
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Trend
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {surveyPerformance.map((survey, index) => (
                  <tr key={index} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-gray-900">{survey.name}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-semibold text-gray-900">{survey.responses}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              survey.completion >= 80
                                ? "bg-emerald-500"
                                : survey.completion >= 60
                                  ? "bg-blue-500"
                                  : "bg-amber-500"
                            )}
                            style={{ width: `${survey.completion}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium text-gray-600 w-10">{survey.completion}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className={cn(
                        "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
                        survey.trend === "up" && "bg-emerald-50 text-emerald-700",
                        survey.trend === "down" && "bg-red-50 text-red-700",
                        survey.trend === "stable" && "bg-gray-100 text-gray-600"
                      )}>
                        {survey.trend === "up" && <TrendingUp className="w-3 h-3" />}
                        {survey.trend === "down" && <TrendingDown className="w-3 h-3" />}
                        {survey.trend === "stable" && <Minus className="w-3 h-3" />}
                        {survey.change}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Insights */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <div className="mb-5">
            <h3 className="text-base font-semibold text-gray-900">Top Insights</h3>
            <p className="text-sm text-gray-500">AI-extracted themes</p>
          </div>
          <div className="space-y-3">
            {topInsights.map((insight, index) => (
              <div
                key={index}
                className={cn(
                  "p-4 rounded-xl border",
                  insight.sentiment === "positive"
                    ? "bg-emerald-50/50 border-emerald-100"
                    : "bg-red-50/50 border-red-100"
                )}
              >
                <p className="text-sm text-gray-700 mb-2 leading-relaxed">{insight.text}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">{insight.count} mentions</span>
                  <span
                    className={cn(
                      "text-xs font-medium px-2 py-0.5 rounded-full capitalize",
                      insight.sentiment === "positive"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-red-100 text-red-700"
                    )}
                  >
                    {insight.sentiment}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
