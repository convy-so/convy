"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  FileText,
  Loader2,
  Sparkles,
  ChevronDown,
  Check,
  TrendingUp,
  Activity,
  HeartPulse,
  Clock,
} from "lucide-react";

import { Link } from "@/i18n/routing";
import {
  fetchClassroomTopics,
  fetchTeacherClassrooms,
  fetchTopicReports,
} from "@/lib/api/learning";
import { queryKeys } from "@/lib/query-keys";
import { StatsCard } from "@/components/dashboard/stats-card";
import { SectionHeading } from "@/components/learning/section-heading";
import { getSubjectDisplayLabel } from "@/lib/learning/subject-packages";

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function TeacherReportsPage({
  initialClassrooms,
  initialTopics,
  initialReportsPayload,
}: {
  initialClassrooms?: Awaited<ReturnType<typeof fetchTeacherClassrooms>>;
  initialTopics?: Awaited<ReturnType<typeof fetchClassroomTopics>>;
  initialReportsPayload?: Awaited<ReturnType<typeof fetchTopicReports>>;
}) {
  const [selectedClassroomId, setSelectedClassroomId] = useState<string | null>(
    initialClassrooms?.data?.[0]?.id ?? null,
  );
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(
    initialTopics?.data?.[0]?.id ?? null,
  );
  
  const [isClassDropdownOpen, setIsClassDropdownOpen] = useState(false);
  const [isTopicDropdownOpen, setIsTopicDropdownOpen] = useState(false);
  const classDropdownRef = useRef<HTMLDivElement>(null);
  const topicDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (classDropdownRef.current && !classDropdownRef.current.contains(event.target as Node)) {
        setIsClassDropdownOpen(false);
      }
      if (topicDropdownRef.current && !topicDropdownRef.current.contains(event.target as Node)) {
        setIsTopicDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const classroomsQuery = useQuery({
    queryKey: queryKeys.learning.classrooms,
    queryFn: fetchTeacherClassrooms,
    initialData: initialClassrooms,
    staleTime: 30_000,
  });

  const classrooms = useMemo(() => classroomsQuery.data?.data ?? [], [classroomsQuery.data]);
  const accessibleClassrooms = classrooms;
  const effectiveSelectedClassroomId = accessibleClassrooms.some(
    (classroom) => classroom.id === selectedClassroomId,
  )
    ? selectedClassroomId
    : (accessibleClassrooms[0]?.id ?? null);
  const selectedClassroom =
    accessibleClassrooms.find((classroom) => classroom.id === effectiveSelectedClassroomId) ?? null;

  const topicsQuery = useQuery({
    queryKey: effectiveSelectedClassroomId
      ? queryKeys.learning.topics(effectiveSelectedClassroomId)
      : ["learningTopics", "reports-idle"],
    queryFn: async () => {
      if (!effectiveSelectedClassroomId) {
        throw new Error("Missing classroom id");
      }

      return fetchClassroomTopics(effectiveSelectedClassroomId);
    },
    enabled: Boolean(effectiveSelectedClassroomId),
    initialData:
      initialTopics &&
      effectiveSelectedClassroomId === (initialClassrooms?.data?.[0]?.id ?? null)
        ? initialTopics
        : undefined,
    staleTime: 30_000,
  });

  const topics = useMemo(() => topicsQuery.data?.data ?? [], [topicsQuery.data]);
  const effectiveSelectedTopicId = topics.some((topic) => topic.id === selectedTopicId)
    ? selectedTopicId
    : (topics[0]?.id ?? null);
  const selectedTopic =
    topics.find((topic) => topic.id === effectiveSelectedTopicId) ?? null;

  const reportsQuery = useQuery({
    queryKey: effectiveSelectedTopicId
      ? queryKeys.learning.reports(effectiveSelectedTopicId)
      : ["learningReports", "idle"],
    queryFn: async () => {
      if (!effectiveSelectedTopicId) {
        throw new Error("Missing topic id");
      }

      return fetchTopicReports(effectiveSelectedTopicId);
    },
    enabled: Boolean(effectiveSelectedTopicId),
    initialData:
      initialReportsPayload &&
      effectiveSelectedTopicId === (initialTopics?.data?.[0]?.id ?? null)
        ? initialReportsPayload
        : undefined,
    staleTime: 30_000,
  });

  const reportsPayload = reportsQuery.data?.data ?? null;
  const reports = useMemo(() => reportsPayload?.reports ?? [], [reportsPayload]);
  const summary = reportsPayload?.summary ?? null;

  return (
    <div className="min-h-screen bg-slate-50/20 pb-20 pt-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        
        {/* Header Section */}
        <div className="space-y-8">
          <div className="space-y-4 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-slate-100 text-slate-400 text-[10px] font-medium uppercase tracking-widest">
              <Sparkles className="w-3 h-3" />
              Teacher Workspace
            </div>
            <h1 className="text-3xl font-medium text-slate-900 md:text-5xl leading-tight">
              Report Center
            </h1>
            <p className="text-slate-500 text-base font-medium leading-relaxed">
              Review analytics by classroom and topic. Inspect topic evidence and act on the patterns that matter.
            </p>
          </div>
          
          {/* Control Bar */}
          <div className="flex flex-col sm:flex-row items-center gap-4 p-4 rounded-2xl bg-white border border-slate-100 ">
            {/* Classroom Dropdown */}
            <div className="relative flex-1 w-full" ref={classDropdownRef}>
              <div className="text-[10px] font-medium uppercase tracking-widest text-slate-400 px-1 mb-1.5">Selected Classroom</div>
              <button
                onClick={() => setIsClassDropdownOpen(!isClassDropdownOpen)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-200 transition-all"
              >
                <span className="truncate">{selectedClassroom?.title ?? "Select Classroom"}</span>
                <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isClassDropdownOpen ? "rotate-180" : ""}`} />
              </button>
              
              {isClassDropdownOpen && (
                <div className="absolute top-full right-0 mt-2 w-full z-50 bg-white border border-slate-100 rounded-xl overflow-hidden py-1 shadow-lg shadow-slate-200/50">
                  {classrooms.length ? classrooms.map((classroom) => (
                    <button
                      key={classroom.id}
                      onClick={() => {
                        setSelectedClassroomId(classroom.id);
                        setSelectedTopicId(null);
                        setIsClassDropdownOpen(false);
                      }}
                      className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium text-slate-500 hover:bg-slate-50 transition-colors text-left"
                    >
                      <div>
                        <div className={selectedClassroom?.id === classroom.id ? "text-sky-600" : "text-slate-700"}>{classroom.title}</div>
                        <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">{classroom.gradeLabel}</div>
                      </div>
                      {selectedClassroom?.id === classroom.id && <Check className="h-4 w-4 text-sky-500 flex-shrink-0" />}
                    </button>
                  )) : (
                    <div className="px-4 py-3 text-sm text-slate-400 italic">No classrooms yet</div>
                  )}
                </div>
              )}
            </div>

            {/* Divider for desktop */}
            <div className="hidden sm:block w-px h-12 bg-slate-100 mx-2"></div>

            {/* Topic Dropdown */}
            <div className="relative flex-1 w-full" ref={topicDropdownRef}>
              <div className="text-[10px] font-medium uppercase tracking-widest text-slate-400 px-1 mb-1.5">Selected Topic</div>
              <button
                onClick={() => setIsTopicDropdownOpen(!isTopicDropdownOpen)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-200 transition-all"
              >
                <span className="truncate">{selectedTopic?.title ?? "Select Topic"}</span>
                <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isTopicDropdownOpen ? "rotate-180" : ""}`} />
              </button>
              
              {isTopicDropdownOpen && (
                <div className="absolute top-full right-0 mt-2 w-full z-50 bg-white border border-slate-100 rounded-xl overflow-hidden py-1 shadow-lg shadow-slate-200/50">
                  {topics.length ? topics.map((topic) => (
                    <button
                      key={topic.id}
                      onClick={() => {
                        setSelectedTopicId(topic.id);
                        setIsTopicDropdownOpen(false);
                      }}
                      className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium text-slate-500 hover:bg-slate-50 transition-colors text-left"
                    >
                      <div className="truncate pr-4">
                        <div className={selectedTopic?.id === topic.id ? "text-emerald-600" : "text-slate-700 truncate"}>{topic.title}</div>
                        <div className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">
                          {topic.courseTitle ?? getSubjectDisplayLabel(null)}
                        </div>
                      </div>
                      {selectedTopic?.id === topic.id && <Check className="h-4 w-4 text-emerald-500 flex-shrink-0" />}
                    </button>
                  )) : (
                    <div className="px-4 py-3 text-sm text-slate-400 italic">No topics available</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Stats Bar */}
          <div className="grid gap-6 grid-cols-2 lg:grid-cols-4">
            <StatsCard
              title="Average Mastery"
              value={summary?.averageMasteryPercent != null ? `${Math.round(summary.averageMasteryPercent)}%` : "N/A"}
              icon={<TrendingUp className="w-6 h-6" />}
              iconColor="bg-emerald-50 text-emerald-600"
              description="Latest visible reports"
            />
            <StatsCard
              title="Needs Attention"
              value={summary ? String(summary.studentsNeedingAttention) : "0"}
              icon={<Activity className="w-6 h-6" />}
              iconColor="bg-amber-50 text-amber-600"
              description="Low mastery or flags"
            />
            <StatsCard
              title="Confidence Level"
              value={summary?.averageConfidenceScore != null ? `${summary.averageConfidenceScore}/10` : "N/A"}
              icon={<HeartPulse className="w-6 h-6" />}
              iconColor="bg-violet-50 text-violet-600"
              description="Self-reported average"
            />
            <StatsCard
              title="Latest Refresh"
              value={summary ? formatDate(summary.latestReportAt) : "Not yet"}
              icon={<Clock className="w-6 h-6" />}
              iconColor="bg-blue-50 text-blue-600"
              description="Most recent report update"
            />
          </div>
        </div>

        {/* Main Content */}
        <div className="space-y-12">
          {selectedTopic ? (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-12">
              
              {summary ? (
                <div className="grid gap-8 lg:grid-cols-3">
                  <div className="rounded-2xl border border-slate-100 bg-white p-8 space-y-4">
                    <div className="text-[10px] font-medium uppercase tracking-widest text-slate-400">
                      Common Gaps
                    </div>
                    <div className="space-y-3">
                      {summary.commonGaps.length ? (
                        summary.commonGaps.map((gap) => (
                          <div key={gap} className="text-sm font-medium leading-relaxed text-slate-700 border-l-2 border-slate-100 pl-3 py-1">
                            {gap}
                          </div>
                        ))
                      ) : (
                        <div className="text-sm font-medium italic text-slate-400">
                          No repeated conceptual gap stands out yet.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-white p-8 space-y-4">
                    <div className="text-[10px] font-medium uppercase tracking-widest text-slate-400">
                      Risk Patterns
                    </div>
                    <div className="space-y-3">
                      {summary.commonRiskFlags.length ? (
                        summary.commonRiskFlags.map((flag) => (
                          <div key={flag} className="text-sm font-medium leading-relaxed text-slate-700 border-l-2 border-slate-100 pl-3 py-1">
                            {flag}
                          </div>
                        ))
                      ) : (
                        <div className="text-sm font-medium italic text-slate-400">
                          No repeated risk signal is dominating.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-white p-8 space-y-4">
                    <div className="text-[10px] font-medium uppercase tracking-widest text-slate-400">
                      Recommended Focus
                    </div>
                    <div className="space-y-3">
                      {summary.recommendedTeacherFocus.length ? (
                        summary.recommendedTeacherFocus.map((action) => (
                          <div key={action} className="text-sm font-medium leading-relaxed text-slate-700 border-l-2 border-slate-100 pl-3 py-1">
                            {action}
                          </div>
                        ))
                      ) : (
                        <div className="text-sm font-medium italic text-slate-400">
                          Teacher follow-up recommendations will appear with more evidence.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="space-y-6">
                <SectionHeading
                  eyebrow="Student Analytics"
                  title="Session Reports"
                  description="Detailed performance breakdowns for each student in this topic."
                />

                {reportsQuery.isLoading ? (
                  <div className="flex items-center justify-center gap-3 py-20 text-sm font-medium text-slate-400 bg-white rounded-2xl border border-slate-100">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Loading analytics...
                  </div>
                ) : reports.length ? (
                  <div className="grid gap-6">
                    {reports.map((report) => {
                      const identifiedGaps = report.report.identifiedGaps ?? [];
                      const riskFlags = report.report.riskFlags ?? [];
                      const homeworkAssigned = report.report.homeworkAssigned ?? [];

                      return (
                        <div key={report.id} className="rounded-2xl border border-slate-100 bg-white p-8 space-y-8 transition-all hover:border-slate-200">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                              <Link href={`/dashboard/learning/students/${report.student.id}`} className="text-xl font-medium text-slate-900 transition-colors hover:text-sky-600 leading-tight">
                                {report.student.fullName}
                              </Link>
                              <div className="mt-1.5 text-[10px] font-medium uppercase tracking-widest text-slate-400">
                                Analyzed on {formatDate(report.updatedAt)}
                              </div>
                            </div>
                            <div className="inline-flex rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 self-start sm:self-auto">
                              {report.masteryPercent}% Mastery
                            </div>
                          </div>

                          <div className="rounded-xl bg-slate-50/50 p-6 border border-slate-100">
                            <p className="text-sm font-medium leading-relaxed text-slate-600 italic">
                              &ldquo;{report.report.studentSummary}&rdquo;
                            </p>
                          </div>

                          <div className="grid gap-6 md:grid-cols-2">
                            <div className="space-y-2">
                              <div className="text-[10px] font-medium uppercase tracking-widest text-slate-400 px-1">
                                Gap Focus
                              </div>
                              <div className="rounded-xl border border-slate-100 bg-white p-5 text-sm font-medium text-slate-900 h-full">
                                {identifiedGaps[0] ?? "No major unresolved gap flagged."}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <div className="text-[10px] font-medium uppercase tracking-widest text-slate-400 px-1">
                                Confidence Level
                              </div>
                              <div className="rounded-xl border border-slate-100 bg-white p-5 text-sm font-medium text-slate-900 h-full flex items-center gap-2">
                                <HeartPulse className="w-4 h-4 text-violet-400" />
                                {report.report.studentConfidenceScore ?? "N/A"} / 10
                              </div>
                            </div>
                          </div>

                          <div className="grid gap-6 md:grid-cols-3">
                            <div className="space-y-2">
                              <div className="text-[10px] font-medium uppercase tracking-widest text-slate-400 px-1">
                                Transfer Readiness
                              </div>
                              <div className="rounded-xl border border-slate-100 bg-white p-4 text-sm font-medium text-slate-900 capitalize h-full">
                                {(report.report.transferReadiness ?? "not_yet").replace("_", " ")}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <div className="text-[10px] font-medium uppercase tracking-widest text-slate-400 px-1">
                                Originality
                              </div>
                              <div className="rounded-xl border border-slate-100 bg-white p-4 text-sm font-medium text-slate-900 capitalize h-full">
                                {(report.report.originalityWithinConstraint ?? "low").replace("_", " ")}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <div className="text-[10px] font-medium uppercase tracking-widest text-slate-400 px-1">
                                Next Intervention
                              </div>
                              <div className="rounded-xl border border-slate-100 bg-white p-4 text-sm font-medium text-slate-900 capitalize h-full">
                                {(report.report.recommendedInterventionType ?? "none").replace("_", " ")}
                              </div>
                            </div>
                          </div>

                          {(report.report.metacognitiveMirror || riskFlags.length > 0 || homeworkAssigned.length > 0) && (
                            <div className="grid gap-6 pt-4 border-t border-slate-50">
                              {report.report.metacognitiveMirror ? (
                                <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-5">
                                  <div className="text-[10px] font-medium uppercase tracking-widest text-violet-500 mb-2">
                                    Thinking Pattern
                                  </div>
                                  <div className="text-sm font-medium leading-relaxed text-violet-900">
                                    {report.report.metacognitiveMirror}
                                  </div>
                                </div>
                              ) : null}

                              {riskFlags.length ? (
                                <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-5">
                                  <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-widest text-amber-600 mb-3">
                                    <AlertTriangle className="h-3 w-3" />
                                    AI Risk Flags
                                  </div>
                                  <div className="space-y-3">
                                    {riskFlags.map((flag) => (
                                      <div key={flag} className="text-sm font-medium leading-relaxed text-amber-900 flex items-start gap-2">
                                        <span className="text-amber-400 mt-0.5">•</span>
                                        {flag}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : null}

                              {homeworkAssigned.length ? (
                                <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-5">
                                  <div className="text-[10px] font-medium uppercase tracking-widest text-sky-600 mb-3">
                                    Homework Assigned
                                  </div>
                                  <div className="space-y-3">
                                    {homeworkAssigned.map((task) => (
                                      <div key={task} className="text-sm font-medium leading-relaxed text-sky-900 flex items-start gap-2">
                                        <span className="text-sky-400 mt-0.5">•</span>
                                        {task}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-20 text-center">
                    <div className="text-slate-400 font-medium text-lg">No reports generated yet.</div>
                    <div className="text-slate-400 font-medium text-sm mt-2">Reports will appear here once students interact with the tutor.</div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-20 text-center flex flex-col items-center justify-center min-h-[500px] border-dashed border border-slate-100 bg-white rounded-2xl">
              <div className="w-20 h-20 rounded-2xl bg-slate-50 flex items-center justify-center mb-6 border border-slate-100">
                <FileText className="w-8 h-8 text-slate-200" />
              </div>
              <h3 className="text-2xl font-medium text-slate-900 mb-3">Select a Topic</h3>
              <p className="text-slate-500 max-w-sm mx-auto text-base leading-relaxed font-medium">
                Choose a classroom and topic from the dropdowns above to dive deep into student analytics.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

