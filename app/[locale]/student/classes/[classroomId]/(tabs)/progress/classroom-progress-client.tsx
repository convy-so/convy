"use client";

import { useState } from "react";
import { Award, Sparkles, AlertCircle, Lightbulb, Map, Target, Calendar, ChevronDown, ChevronUp } from "lucide-react";
import type { KnowledgeStateNode } from "@/lib/learning/types";
import { getSubjectDisplayLabel } from "@/lib/learning/subject-packages";
import { cn } from "@/lib/utils";

type SkillMapNode = Pick<
  KnowledgeStateNode,
  "conceptKey" | "title" | "masteryLevel" | "confidence" | "evidence" | "misconceptions"
>;

type ProgressReportContent = {
    studentSummary?: string;
    identifiedGaps?: string[];
    conceptProgress?: SkillMapNode[];
};

type ReportRecord = {
    id: string;
    topicId: string;
    masteryPercent: number;
    createdAt: Date;
    topic: {
        title: string;
        subject: string | null;
        subjectKey: string | null;
    } | null;
    report: ProgressReportContent | null;
};

type LatestModel = {
    knowledgeStateModel: SkillMapNode[];
} | null;

type Props = {
    latestModel: LatestModel;
    progressReports: ReportRecord[];
};

function masteryLabelForStudent(level: string) {
    if (level === "generative") return { text: "Strong — can use this in new situations", short: "Strong", tone: "good" as const };
    if (level === "applied") return { text: "Getting there — you can use it with support", short: "Practice more", tone: "mid" as const };
    return { text: "Still building — keep studying this idea", short: "Building", tone: "low" as const };
}

export function ClassroomProgressClient({ latestModel, progressReports }: Props) {
    const [expandedReportId, setExpandedReportId] = useState<string | null>(null);

    const toggleReport = (reportId: string) => {
        setExpandedReportId(expandedReportId === reportId ? null : reportId);
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-16">
            {/* Skill Map Panel */}
            <div className="lg:col-span-1 space-y-6">
                <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
                    <div className="mb-6 flex items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
                            <Map className="h-5.5 w-5.5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">Your Skill Map</h2>
                            <p className="mt-1 text-slate-500 text-xs font-semibold leading-relaxed">
                                A live view of your understanding across main ideas. Updates as you complete tutoring sessions.
                            </p>
                        </div>
                    </div>

                    {latestModel && latestModel.knowledgeStateModel && latestModel.knowledgeStateModel.length > 0 ? (
                        <div className="space-y-4">
                            {latestModel.knowledgeStateModel.map((node) => {
                                const pct = node.masteryLevel === 'generative' ? 100 : node.masteryLevel === 'applied' ? 66 : 33;
                                const label = masteryLabelForStudent(String(node.masteryLevel));
                                return (
                                    <div key={node.conceptKey} className="space-y-3 rounded-2xl border border-slate-50 bg-slate-50/30 p-4">
                                        <div className="flex items-start justify-between gap-2 text-xs">
                                            <span className="flex items-start gap-1.5 font-bold text-slate-800">
                                                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                                                <span>{node.title}</span>
                                            </span>
                                            <span className={cn(
                                                "shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                                                label.tone === "good" && "border-emerald-200 bg-emerald-50 text-emerald-800",
                                                label.tone === "mid" && "border-sky-200 bg-sky-50 text-sky-800",
                                                label.tone === "low" && "border-slate-200 bg-white text-slate-500",
                                            )}>
                                                {label.short}
                                            </span>
                                        </div>
                                        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                                            <div 
                                                className={cn(
                                                    "h-full rounded-full transition-all duration-500",
                                                    label.tone === "good" ? "bg-emerald-500" : label.tone === "mid" ? "bg-sky-500" : "bg-slate-400"
                                                )}
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                        <p className="text-[11px] font-semibold leading-relaxed text-slate-500">{label.text}</p>
                                        {node.misconceptions?.length > 0 && (
                                            <div className="flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50/60 p-3 text-[11px] leading-relaxed text-amber-900">
                                                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                                                <span><span className="font-bold">Misconception Alert:</span> {node.misconceptions[0]}</span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/30 px-4 py-12 text-center">
                            <Sparkles className="mx-auto mb-3 h-8 w-8 text-indigo-400 animate-pulse" />
                            <p className="text-sm font-bold text-slate-900">Personalized calibration forming</p>
                            <p className="mx-auto mt-2 max-w-[200px] text-xs font-semibold leading-relaxed text-slate-500">
                                As you complete tutoring chats, a interactive map of your core competencies will populate here.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Quiz & Lesson Reports Panel */}
            <div className="lg:col-span-2 space-y-6">
                <div className="flex items-center justify-between px-1">
                    <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                        <Award className="h-5 w-5 text-amber-500" />
                        Tutoring Session Reports
                    </h2>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold tabular-nums text-slate-600">
                        {progressReports.length}
                    </span>
                </div>

                {progressReports.length > 0 ? (
                    <div className="space-y-4">
                        {progressReports.map((report) => {
                            const isExpanded = expandedReportId === report.id;
                            return (
                                <div 
                                    key={report.id} 
                                    className={cn(
                                        "rounded-3xl border bg-white shadow-sm overflow-hidden transition-all duration-300",
                                        isExpanded ? "border-slate-300 ring-1 ring-slate-300" : "border-slate-100 hover:border-slate-200"
                                    )}
                                >
                                    {/* Header Panel */}
                                    <div 
                                        onClick={() => toggleReport(report.id)}
                                        className="p-6 flex items-center justify-between gap-4 cursor-pointer select-none"
                                    >
                                        <div className="min-w-0 space-y-1">
                                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                                                {report.topic?.subject || getSubjectDisplayLabel(report.topic?.subjectKey)}
                                            </span>
                                            <h3 className="text-lg font-extrabold text-slate-800 tracking-tight leading-snug">
                                                {report.topic?.title || "Topic assessment"}
                                            </h3>
                                            <div className="flex items-center gap-4 text-xs font-semibold text-slate-500 mt-1">
                                                <span className="flex items-center gap-1">
                                                    <Calendar className="h-3.5 w-3.5" />
                                                    {new Date(report.createdAt).toLocaleDateString()}
                                                </span>
                                                <span className="h-1.5 w-1.5 rounded-full bg-slate-200" />
                                                <span className="flex items-center gap-1">
                                                    <Target className="h-3.5 w-3.5" />
                                                    Score: {report.masteryPercent}%
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4 shrink-0">
                                            <div className="h-12 w-12 flex items-center justify-center rounded-2xl bg-slate-50 border border-slate-100 font-extrabold text-slate-800 tracking-tight">
                                                {report.masteryPercent}%
                                            </div>
                                            {isExpanded ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
                                        </div>
                                    </div>

                                    {/* Expandable Report Content */}
                                    {isExpanded && (
                                        <div className="px-6 pb-6 border-t border-slate-100 pt-5 space-y-5 bg-slate-50/30 animate-in fade-in duration-300">
                                            {report.report?.studentSummary && (
                                                <div className="flex gap-3">
                                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                                                        <Sparkles className="h-4.5 w-4.5" />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-violet-600">
                                                            In Plain Words
                                                        </span>
                                                        <p className="text-sm font-semibold leading-relaxed text-slate-700">
                                                            {report.report.studentSummary}
                                                        </p>
                                                    </div>
                                                </div>
                                            )}

                                            {report.report?.identifiedGaps && report.report.identifiedGaps.length > 0 && (
                                                <div className="rounded-2xl border border-amber-100 bg-amber-50/40 p-4">
                                                    <h4 className="mb-3 flex items-center gap-2 text-xs font-bold text-amber-900">
                                                        <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                                                        Good concepts to review next
                                                    </h4>
                                                    <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                                        {report.report.identifiedGaps.map((gap: string, idx: number) => (
                                                            <li 
                                                                key={idx} 
                                                                className="flex items-start gap-2 rounded-xl border border-amber-100/60 bg-white px-3.5 py-2.5 text-xs font-semibold text-amber-950 shadow-sm"
                                                            >
                                                                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                                                                {gap}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center rounded-3xl border border-slate-100 bg-white py-20 text-center shadow-sm">
                        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 border border-slate-100">
                            <Award className="h-7 w-7 text-slate-300" />
                        </div>
                        <h3 className="text-base font-bold text-slate-900 mb-1">No reports prepared</h3>
                        <p className="mt-1 max-w-xs px-4 text-xs font-semibold leading-relaxed text-slate-500">
                            When you finish a tutoring session, a detailed AI mastery assessment report will appear here.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
