"use client";

import { DashboardWidget, SurveyAnalyticsData } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import {
    BarChart,
    Bar,
    PieChart,
    Pie,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
} from "recharts";
import { ArrowRight } from "lucide-react";
import { SentimentGauge } from "./SentimentGauge";
import { Link } from "@/i18n/routing";

interface NarrativeReportProps {
    data: SurveyAnalyticsData;
    surveyId: string;
}

const COLORS = ["#111827", "#374151", "#6B7280", "#9CA3AF", "#D1D5DB"];

export function NarrativeReport({ data, surveyId }: NarrativeReportProps) {
    const sortedWidgets = [...data.dashboardWidgets].sort(
        (a, b) => (a.priority || 0) - (b.priority || 0)
    );

    return (
        <div className="max-w-4xl mx-auto space-y-16 pb-20">
            {/* Executive Summary Section */}
            <section className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="flex-1 space-y-2">
                        <h2 className="text-4xl font-bold text-gray-900 tracking-tight leading-tight">
                            {data.executiveSummary.headline}
                        </h2>
                    </div>

                </div>

                <div className="prose prose-gray max-w-none">
                    <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 list-none p-0">
                        {data.executiveSummary.keyInsights.slice(0, 4).map((insight, i) => (
                            <li key={i} className="flex gap-3 m-0">
                                <span className="text-gray-300 font-mono text-sm mt-1">{(i + 1).toString().padStart(2, "0")}</span>
                                <p className="text-gray-600 text-sm leading-relaxed m-0">{insight}</p>
                            </li>
                        ))}
                    </ul>
                </div>
            </section>

            {/* Participation & Performance Breakdown */}
            <section className="space-y-8 pt-8 border-t border-gray-100">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                    <BreakdownSection
                        title="Completion Depth"
                        subtitle="How far participants progressed through the conversation"
                        items={[
                            { label: "Fully Completed", value: data.coreMetrics.completedConversations, total: data.coreMetrics.totalConversations, color: "#111827" },
                            { label: "Partial (>50%)", value: Math.round((data.coreMetrics.totalConversations - data.coreMetrics.completedConversations) * (data.coreMetrics.completionRate / 100)), total: data.coreMetrics.totalConversations, color: "#6B7280" },
                            { label: "Drop-off (<50%)", value: data.coreMetrics.totalConversations - data.coreMetrics.completedConversations - Math.round((data.coreMetrics.totalConversations - data.coreMetrics.completedConversations) * (data.coreMetrics.completionRate / 100)), total: data.coreMetrics.totalConversations, color: "#D1D5DB" }
                        ]}
                    />
                    <BreakdownSection
                        title="Response Engagement"
                        subtitle="Quality and depth of participation levels"
                        items={[
                            { label: "High Engagement", value: data.coreMetrics.responseEngagementDistribution.high, total: data.coreMetrics.totalConversations, color: "#111827" },
                            { label: "Moderate", value: data.coreMetrics.responseEngagementDistribution.medium, total: data.coreMetrics.totalConversations, color: "#6B7280" },
                            { label: "Low", value: data.coreMetrics.responseEngagementDistribution.low, total: data.coreMetrics.totalConversations, color: "#D1D5DB" }
                        ]}
                    />
                </div>
            </section>

            {/* Narrative Flow of Widgets */}
            <div className="space-y-24">
                {sortedWidgets.map((widget) => (
                    <NarrativeWidget key={widget.id} widget={widget} />
                ))}
            </div>

            {/* Recommendations Footer */}
            {data.discoveredInsights.recommendations.length > 0 && (
                <section className="pt-16 border-t border-gray-100 space-y-8">
                    <h3 className="text-2xl font-bold text-gray-900 tracking-tight">Recommended Actions</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {data.discoveredInsights.recommendations.map((rec) => (
                            <div key={rec.id} className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <div className={cn(
                                        "w-1.5 h-1.5 rounded-full",
                                        rec.priority === "high" ? "bg-black" : "bg-gray-400"
                                    )} />
                                    <h4 className="font-bold text-gray-900 text-sm italic underline decoration-gray-200 decoration-4 underline-offset-4">{rec.title}</h4>
                                </div>
                                <p className="text-sm text-gray-500 leading-relaxed pl-3">{rec.description}</p>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* CTA to Chat */}
            <div className="pt-20 flex justify-center">
                <Link
                    href={`/dashboard/surveys/${surveyId}/analytics/chat`}
                    className="group flex items-center gap-3 px-8 py-4 bg-gray-900 text-white rounded-full hover:bg-black transition-all shadow-xl shadow-gray-200 hover:shadow-black/10"
                >
                    <span className="font-bold tracking-tight">Deep Dive with AI</span>
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Link>
            </div>
        </div>
    );
}

function NarrativeWidget({ widget }: { widget: DashboardWidget }) {
    // Skip widgets that don't fit the narrative or are redundant
    const skipTypes = ["quote_carousel", "insight_quality", "goal_achievement", "insight_types"];
    if (skipTypes.includes(widget.type) || widget.id === "completion_rate") return null;

    return (
        <section className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="space-y-2">
                <h3 className="text-2xl font-bold text-gray-900 tracking-tight">{widget.title}</h3>
                {widget.description && <p className="text-gray-500 text-sm leading-relaxed max-w-2xl">{widget.description}</p>}
            </div>
            <div className="w-full">
                <NarrativeWidgetContent widget={widget} />
            </div>
        </section>
    );
}

function NarrativeWidgetContent({ widget }: { widget: DashboardWidget }) {
    const data = widget.data as any;

    switch (widget.type) {
        case "pie_chart":
            const pieData = data.segments.map((entry: any, index: number) => ({
                ...entry,
                fill: entry.color || COLORS[index % COLORS.length]
            }));
            return (
                <div className="h-64 w-full max-w-md">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={pieData}
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={4}
                                dataKey="value"
                                nameKey="label"
                                stroke="none"
                            />
                            <Tooltip
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: 'none', fontSize: '11px', fontWeight: 'bold' }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            );

        case "bar_chart":
        case "histogram":
            const rawBars = Array.isArray(data) ? data : data.bars || [];
            const bars = rawBars.map((entry: any, index: number) => ({
                ...entry,
                fill: entry.color || COLORS[index % COLORS.length]
            }));
            return (
                <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={bars} layout="vertical" margin={{ left: 40 }}>
                            <XAxis type="number" hide />
                            <YAxis
                                dataKey="label"
                                type="category"
                                axisLine={false}
                                tickLine={false}
                                fontSize={11}
                                width={120}
                                tick={{ fill: "#6B7280" }}
                            />
                            <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: 'none', fontSize: '11px' }} />
                            <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            );

        case "metric_breakdown":
        case "metric_list":
        case "insight_list":
            const items = data.insights || data.values || data;
            return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {items.slice(0, 6).map((item: any, i: number) => (
                        <div key={i} className="flex items-start gap-4 p-4 rounded-2xl bg-gray-50/50">
                            <div className="w-1.5 h-1.5 rounded-full bg-gray-300 mt-2 flex-shrink-0" />
                            <p className="text-sm text-gray-600 leading-relaxed font-medium">
                                {item.text || item.label || item.value}
                            </p>
                        </div>
                    ))}
                </div>
            );

        case "hypothesis_card":
            return (
                <div className="p-8 rounded-[2.5rem] bg-[#F2F5F8] space-y-4">
                    <div className={cn(
                        "inline-flex px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest",
                        data.status === 'validated' ? "bg-black text-white" : "bg-gray-200 text-gray-600"
                    )}>
                        Hypothesis {data.status}
                    </div>
                    <p className="text-xl font-bold text-gray-900 leading-tight">{data.hypothesis}</p>
                    <p className="text-sm text-gray-600 leading-relaxed">{data.summary}</p>
                </div>
            );

        case "coverage_matrix":
            return (
                <div className="space-y-4">
                    {data.slice(0, 4).map((item: any, i: number) => (
                        <div key={i} className="flex items-center gap-6">
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-gray-900 truncate">{item.question}</p>
                                <div className="w-full h-1 bg-gray-100 rounded-full mt-2 overflow-hidden">
                                    <div className="h-full bg-gray-900 rounded-full" style={{ width: `${item.coverageRate}%` }} />
                                </div>
                            </div>
                            <div className="text-xl font-black text-gray-900">{Math.round(item.coverageRate)}%</div>
                        </div>
                    ))}
                </div>
            );

        default:
            return null;
    }
}

function BreakdownSection({ title, subtitle, items }: { title: string; subtitle: string; items: any[] }) {
    return (
        <div className="space-y-6">
            <div className="space-y-1">
                <h4 className="text-sm font-bold text-gray-900 uppercase tracking-widest">{title}</h4>
                <p className="text-xs text-gray-400">{subtitle}</p>
            </div>
            <div className="space-y-4">
                {items.map((item, i) => {
                    const percentage = Math.round((item.value / (item.total || 1)) * 100);
                    return (
                        <div key={i} className="space-y-1.5">
                            <div className="flex justify-between items-end">
                                <span className="text-xs font-bold text-gray-600 truncate mr-2">{item.label}</span>
                                <span className="text-sm font-black text-gray-900">{percentage}%</span>
                            </div>
                            <div className="w-full h-2.5 bg-gray-50 rounded-full overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all duration-1000"
                                    style={{ width: `${percentage}%`, backgroundColor: item.color }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
