import { BookOpen, Calendar, CheckCircle, ChevronLeft, Clock, PlayCircle } from "lucide-react";
import { and, desc, eq, inArray } from "drizzle-orm";

import { Link } from "@/i18n/routing";
import { getVerifiedSession } from "@/features/auth/public-server";
import { getDb } from "@/shared/db";
import { classroomStudents, studentSessions } from "@/shared/db/schema/learning";

export async function StudentSessionsPageContent({
  classroomId,
}: {
  classroomId?: string;
}) {
  const session = await getVerifiedSession();
  const userId = session.user.id;

  const studentProfiles = await getDb().query.classroomStudents.findMany({
    where: eq(classroomStudents.userId, userId),
    with: {
      classroom: true,
    },
  });

  const visibleProfiles = classroomId
    ? studentProfiles.filter((profile) => profile.classroomId === classroomId)
    : studentProfiles;
  const selectedClassroom = classroomId
    ? studentProfiles.find((profile) => profile.classroomId === classroomId)
        ?.classroom ?? null
    : null;
  const studentIds = visibleProfiles.map((profile) => profile.id);

  const sessions =
    studentIds.length > 0
      ? await getDb().query.studentSessions.findMany({
          where: and(
            inArray(studentSessions.classroomStudentId, studentIds),
            eq(studentSessions.sessionType, "tutoring"),
          ),
          orderBy: [desc(studentSessions.updatedAt)],
          with: {
            lesson: true,
            classroomStudent: {
              with: {
                classroom: true,
              },
            },
          },
        })
      : [];

  return (
    <div className="space-y-8">
      <div>
        {selectedClassroom ? (
          <Link
            href="/student/classes"
            className="mb-3 inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-[#43c000] transition-colors hover:text-[#3c7f0a]"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            All courses
          </Link>
        ) : null}
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Learning Sessions
        </h1>
        <p className="mt-1 text-lg text-slate-500">
          {selectedClassroom
            ? `Review or continue your lesson sessions for ${selectedClassroom.title}.`
            : "Review your past lesson activity or continue active lessons."}
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {sessions.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {sessions.map((learningSession) => (
              <div
                key={learningSession.id}
                className="flex flex-col justify-between gap-4 p-6 transition-colors hover:bg-slate-50 sm:flex-row sm:items-center"
              >
                <div className="flex items-start gap-4 sm:items-center">
                  <div
                    className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${
                      learningSession.sessionStatus === "active"
                        ? "bg-sky-100 text-sky-600"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {learningSession.sessionStatus === "active" ? (
                      <Clock className="h-6 w-6" />
                    ) : (
                      <CheckCircle className="h-6 w-6" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">
                      {learningSession.lesson?.title || "General Learning Session"}
                    </h3>
                    <p className="mt-1 text-sm font-medium text-slate-600">
                      {learningSession.classroomStudent?.classroom.title ??
                        "Classroom"}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {new Date(learningSession.createdAt).toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span
                          className={`inline-block h-2 w-2 rounded-full ${
                            learningSession.sessionStatus === "active"
                              ? "bg-emerald-500"
                              : "bg-slate-300"
                          }`}
                        />
                        {learningSession.sessionStatus.charAt(0).toUpperCase() +
                          learningSession.sessionStatus.slice(1)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {learningSession.sessionStatus === "active" ? (
                    <Link
                      href={
                        learningSession.lessonId
                          ? `/student/classes/${learningSession.classroomStudent?.classroomId}/lessons/${learningSession.lessonId}`
                          : "/student/classes"
                      }
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 font-medium text-white transition-colors hover:bg-slate-800 sm:w-auto"
                    >
                      <PlayCircle className="h-4 w-4" />
                      Continue Lesson
                    </Link>
                  ) : null}
                  {learningSession.sessionStatus === "completed" &&
                  learningSession.summary ? (
                    <div className="hidden max-w-xs truncate text-sm italic text-slate-500 lg:block">
                      &quot;{learningSession.summary}&quot;
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center p-16 text-center">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-slate-50">
              <BookOpen className="h-10 w-10 text-slate-300" />
            </div>
            <h3 className="mb-2 text-xl font-bold text-slate-900">
              No sessions yet
            </h3>
            <p className="mx-auto max-w-sm text-slate-500">
              When your teacher activates a lesson for your class, your learning
              sessions will appear here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

