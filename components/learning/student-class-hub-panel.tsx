"use client";

import {
  BookMarked,
  ClipboardCheck,
  ExternalLink,
  LineChart,
  MessageSquare,
  PlayCircle,
  UserRound,
  Settings,
} from "lucide-react";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import type { LearningMeData } from "@/lib/api/learning";

export type StudentHubMembership = Extract<
  LearningMeData,
  { role: "student" }
>["student"][number];

function surveyStatusLabel(status: "not_started" | "in_progress" | "completed") {
  if (status === "completed") return "Done";
  if (status === "in_progress") return "In progress";
  return "To do";
}

export function StudentClassHubPanel({
  membership,
  selectedTopicId,
  onSelectTopic,
}: {
  membership: StudentHubMembership;
  selectedTopicId: string | null;
  onSelectTopic: (topicId: string) => void;
}) {
  const cid = membership.classroom.id;
  const pendingSurveys = membership.surveys.filter((s) => s.responseStatus !== "completed");
  const topicQuery = selectedTopicId ? `&topicId=${selectedTopicId}` : "";

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">This class</p>
          <h3 className="mt-0.5 text-lg font-semibold text-gray-900">{membership.classroom.title}</h3>
          <p className="mt-1 text-sm text-gray-600">
            Everything here helps you stay organized—open a topic, then study or ask the tutor below.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-4">
          <p className="mb-3 flex items-center gap-2 text-xs font-semibold text-gray-700">
            <PlayCircle className="h-4 w-4 text-gray-500" aria-hidden />
            Quick links
          </p>
          <ul className="space-y-2 text-sm">
            <li>
              <Link
                href={`/student/progress?classroomId=${cid}`}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-gray-700 transition-colors hover:bg-white hover:text-gray-900"
              >
                <LineChart className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                Scores &amp; progress
              </Link>
            </li>
            <li>
              <Link
                href={`/student/sessions?classroomId=${cid}${topicQuery}`}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-gray-700 transition-colors hover:bg-white hover:text-gray-900"
              >
                <MessageSquare className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                Learning sessions
              </Link>
            </li>
            <li>
              <Link
                href={`/student/profile?classroomId=${cid}`}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-gray-700 transition-colors hover:bg-white hover:text-gray-900"
              >
                <UserRound className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                Learning profile
              </Link>
            </li>
            <li>
              <Link
                href="/student/settings"
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-gray-700 transition-colors hover:bg-white hover:text-gray-900"
              >
                <Settings className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                Account settings
              </Link>
            </li>
          </ul>
        </div>

        <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-4">
          <p className="mb-3 flex items-center gap-2 text-xs font-semibold text-gray-700">
            <ClipboardCheck className="h-4 w-4 text-gray-500" aria-hidden />
            Check-ins &amp; assignments
            {pendingSurveys.length > 0 && (
              <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                {pendingSurveys.length} open
              </span>
            )}
          </p>
          {membership.surveys.length > 0 ? (
            <ul className="max-h-48 space-y-2 overflow-y-auto pr-1 text-sm custom-scrollbar">
              {membership.surveys.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/s/${s.shareableLink}/respond`}
                    className="flex items-start justify-between gap-2 rounded-lg border border-transparent bg-white px-3 py-2 transition-colors hover:border-gray-200"
                  >
                    <span className="min-w-0 font-medium leading-snug text-gray-900">{s.title}</span>
                    <span className="flex shrink-0 items-center gap-1 text-gray-400">
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </span>
                  </Link>
                  <p className="mt-0.5 px-3 text-[11px] text-gray-500">{surveyStatusLabel(s.responseStatus)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">No check-ins yet. Your teacher will post them here when ready.</p>
          )}
        </div>

        <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-4">
          <p className="mb-3 flex items-center gap-2 text-xs font-semibold text-gray-700">
            <BookMarked className="h-4 w-4 text-gray-500" aria-hidden />
            Your topics
          </p>
          {membership.topics.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {membership.topics.map((topic) => {
                const active = selectedTopicId === topic.id;
                return (
                  <button
                    key={topic.id}
                    type="button"
                    onClick={() => onSelectTopic(topic.id)}
                    className={cn(
                      "max-w-full rounded-lg border px-3 py-1.5 text-left text-xs font-medium transition-colors",
                      active
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-200 bg-white text-gray-800 hover:border-gray-300",
                    )}
                  >
                    <span className="line-clamp-2">{topic.title}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Topics will show up when your teacher publishes them.</p>
          )}
        </div>
      </div>
    </div>
  );
}
