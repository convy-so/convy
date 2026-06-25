import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  PlusCircle,
  PlayCircle,
} from "lucide-react";
import { and, desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { Link } from "@/i18n/routing";
import { getVerifiedSession } from "@/features/auth/public-server";
import { getDb } from "@/shared/db";
import {
  classroomStudents,
  learningSessions,
  learningTopics,
} from "@/shared/db/schema/learning";

export async function ClassroomLessonsPageContent({
  classroomId,
  locale,
}: {
  classroomId: string;
  locale: string;
}) {
  const authHeaders = await headers();
  const session = await getVerifiedSession(authHeaders).catch(() => null);
  if (!session) {
    redirect(`/${locale}/sign-in`);
  }

  const membership = await getDb().query.classroomStudents.findFirst({
    where: and(
      eq(classroomStudents.classroomId, classroomId),
      eq(classroomStudents.userId, session.user.id),
      eq(classroomStudents.inviteStatus, "accepted"),
    ),
  });

  if (!membership) {
    notFound();
  }

  const lessons = await getDb().query.learningTopics.findMany({
    where: and(
      eq(learningTopics.classroomId, classroomId),
      eq(learningTopics.status, "active"),
    ),
    orderBy: [desc(learningTopics.createdAt)],
  });

  const tutoringSessions = await getDb().query.learningSessions.findMany({
    where: and(
      eq(learningSessions.classroomStudentId, membership.id),
      eq(learningSessions.sessionType, "tutoring"),
    ),
    orderBy: [desc(learningSessions.updatedAt)],
    with: {
      topic: true,
    },
  });

  const inProgressSessions = tutoringSessions.filter(
    (sessionRow) => sessionRow.sessionStatus === "active",
  );
  const completedSessions = tutoringSessions.filter(
    (sessionRow) => sessionRow.sessionStatus === "completed",
  );
  const notStartedLessons = lessons.filter(
    (topic) =>
      !tutoringSessions.some((sessionRow) => sessionRow.topicId === topic.id),
  );

  return (
    <div className="space-y-10 pb-16">
      {inProgressSessions.length > 0 ? (
        <div className="space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            In Progress Sessions
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {inProgressSessions.map((sessionRow) => (
              <div
                key={sessionRow.id}
                className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:border-slate-300"
              >
                <div className="space-y-2">
                  <div className="inline-flex w-fit items-center gap-2 rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-indigo-600">
                    <Clock className="h-3.5 w-3.5" />
                    Active Now
                  </div>
                  <h3 className="text-lg font-extrabold text-slate-900">
                    {sessionRow.topic?.title || "General Workspace Session"}
                  </h3>
                  <p className="line-clamp-2 text-sm text-slate-500">
                    {sessionRow.topic?.description ||
                      "Pick up where you left off with your personalized AI tutor."}
                  </p>
                </div>

                <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
                  <span className="text-xs font-semibold text-slate-400">
                    Last active: {new Date(sessionRow.updatedAt).toLocaleDateString()}
                  </span>
                  <Link
                    href={`/student/classes/${classroomId}/lessons/${sessionRow.topicId}`}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-indigo-100 transition-all hover:scale-105 hover:bg-indigo-700"
                  >
                    <PlayCircle className="h-4 w-4" />
                    Resume
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-4">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
          <span className="h-2.5 w-2.5 rounded-full bg-indigo-500" />
          Available Lessons
        </h2>
        {notStartedLessons.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {notStartedLessons.map((topic) => (
              <div
                key={topic.id}
                className="flex flex-col justify-between rounded-2xl border border-slate-100 bg-white p-6 transition-all duration-300 hover:border-slate-200 hover:shadow-lg"
              >
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                    Available
                  </div>
                  <h3 className="text-md line-clamp-1 font-bold text-slate-800">
                    {topic.title}
                  </h3>
                  <p className="line-clamp-3 text-xs leading-relaxed text-slate-500">
                    {topic.description ||
                      "Start this lesson to investigate the core concepts with custom AI tutoring support."}
                  </p>
                </div>

                <div className="mt-6 flex justify-end border-t border-slate-50 pt-4">
                  <Link
                    href={`/student/classes/${classroomId}/lessons/${topic.id}`}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-md transition-colors hover:bg-slate-800"
                  >
                    <PlusCircle className="h-3.5 w-3.5" />
                    Start Learning
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : inProgressSessions.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50">
              <BookOpen className="h-8 w-8 text-indigo-500" />
            </div>
            <h3 className="mb-1 text-lg font-bold text-slate-900">
              No new lessons
            </h3>
            <p className="mx-auto max-w-sm text-sm text-slate-500">
              You have started or completed every available classroom lesson.
            </p>
          </div>
        ) : null}
      </div>

      <div className="space-y-4">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
          <CheckCircle2 className="h-5 w-5 text-slate-400" />
          Completed Sessions
        </h2>
        {completedSessions.length > 0 ? (
          <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm divide-y divide-slate-50">
            {completedSessions.map((sessionRow) => (
              <div
                key={sessionRow.id}
                className="flex flex-col justify-between gap-4 p-5 transition-colors hover:bg-slate-50/50 sm:flex-row sm:items-center"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                    <CheckCircle2 className="h-5.5 w-5.5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900">
                      {sessionRow.topic?.title || "Topic check-in"}
                    </h3>
                    <p className="mt-0.5 text-xs font-semibold text-slate-400">
                      Completed on{" "}
                      {new Date(
                        sessionRow.completedAt || sessionRow.updatedAt,
                      ).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <Link
                  href={`/student/classes/${classroomId}/progress`}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 transition-colors hover:text-indigo-800"
                >
                  View Report
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-100 bg-white px-8 py-12 text-center text-sm font-semibold text-slate-400">
            Complete your first active session to see progress reports here.
          </div>
        )}
      </div>
    </div>
  );
}
