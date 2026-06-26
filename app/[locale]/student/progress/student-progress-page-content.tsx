import {
  AlertCircle,
  Award,
  ChevronLeft,
  Lightbulb,
  Map,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { desc, eq } from "drizzle-orm";

import { Link } from "@/i18n/routing";
import { getVerifiedSession } from "@/features/auth/public-server";
import { getSubjectDisplayLabel } from "@/features/tutoring/server/subject-packages";
import { getDb } from "@/shared/db";
import {
  classroomStudents,
  studentLessonReports,
} from "@/shared/db/schema/learning";
import { cn } from "@/shared/ui/tailwind-class-utils";

function masteryLabelForStudent(level: string) {
  if (level === "generative") {
    return {
      text: "Strong - can use this in new situations",
      short: "Strong",
      tone: "good" as const,
    };
  }
  if (level === "applied") {
    return {
      text: "Getting there - you can use it with support",
      short: "Practice more",
      tone: "mid" as const,
    };
  }
  return {
    text: "Still building - keep studying this idea",
    short: "Building",
    tone: "low" as const,
  };
}

export async function StudentProgressPageContent({
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

  const selectedProfile = classroomId
    ? studentProfiles.find((profile) => profile.classroomId === classroomId) ??
      null
    : studentProfiles.length === 1
      ? studentProfiles[0]
      : null;
  const shouldChooseClass = !selectedProfile && studentProfiles.length > 1;
  const studentId = selectedProfile?.id;

  const progressReports = studentId
    ? await getDb().query.studentLessonReports.findMany({
        where: eq(studentLessonReports.classroomStudentId, studentId),
        orderBy: [desc(studentLessonReports.createdAt)],
        with: {
          lesson: {
            with: {
              course: true,
            },
          },
        },
      })
    : [];

  const latestReport = progressReports[0] ?? null;
  const latestModel = latestReport?.report
    ? {
        knowledgeStateModel: latestReport.report.conceptProgress ?? [],
      }
    : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          {classroomId ? (
            <Link
              href="/student/classes"
              className="mb-3 inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-[#43c000] transition-colors hover:text-[#3c7f0a]"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              All courses
            </Link>
          ) : null}
          <div className="mb-2 inline-flex w-fit items-center gap-2 rounded-full border-2 border-[#bceb9c] bg-[#eefbd6] px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide text-[#3c7f0a]">
            <Award className="h-3.5 w-3.5 text-[#58cc02]" />
            Progress
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-[#3c3c3c] sm:text-4xl">
            {selectedProfile ? selectedProfile.classroom.title : "My progress"}
          </h1>
          <p className="mt-2 max-w-xl text-[15px] font-medium leading-relaxed text-[#777777]">
            Mastery scores and your understanding map update as you learn.
          </p>
        </div>
        {studentProfiles.length > 1 && !classroomId ? (
          <div className="flex items-center gap-2 rounded-2xl border-2 border-[#ffd875] bg-[#fff4d4] px-4 py-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 text-[#9a6b00]" />
            <span className="text-[11px] font-extrabold uppercase tracking-wide text-[#9a6b00]">
              Pick a class from My classes for details
            </span>
          </div>
        ) : null}
      </div>

      {shouldChooseClass ? (
        <div className="grid gap-4 md:grid-cols-2">
          {studentProfiles.map((profile) => (
            <Link
              key={profile.id}
              href={`/student/progress?classroomId=${profile.classroomId}`}
              className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-colors hover:border-gray-300"
            >
              <h2 className="text-lg font-semibold text-gray-900">
                {profile.classroom.title}
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                {profile.classroom.gradeLabel}
              </p>
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          <div className="space-y-6">
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-6 flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                  <Map className="h-5 w-5" aria-hidden />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Your skill map
                  </h2>
                  <p className="mt-1 text-sm text-gray-600">
                    A simple picture of how well you know each main idea. It
                    updates as you learn and answer questions.
                  </p>
                </div>
              </div>

              {latestModel?.knowledgeStateModel?.length ? (
                <div className="space-y-6">
                  {latestModel.knowledgeStateModel.map((node) => {
                    const percent =
                      node.masteryLevel === "generative"
                        ? 100
                        : node.masteryLevel === "applied"
                          ? 66
                          : 33;
                    const label = masteryLabelForStudent(
                      String(node.masteryLevel),
                    );

                    return (
                      <div
                        key={node.conceptKey}
                        className="space-y-3 rounded-xl border border-gray-100 bg-gray-50/50 p-4"
                      >
                        <div className="flex items-start justify-between gap-2 text-sm">
                          <span className="flex items-start gap-2 font-medium text-gray-900">
                            <Lightbulb
                              className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
                              aria-hidden
                            />
                            <span>{node.title}</span>
                          </span>
                          <span
                            className={cn(
                              "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                              label.tone === "good" &&
                                "border-emerald-200 bg-emerald-50 text-emerald-800",
                              label.tone === "mid" &&
                                "border-sky-200 bg-sky-50 text-sky-800",
                              label.tone === "low" &&
                                "border-gray-200 bg-white text-gray-600",
                            )}
                          >
                            {label.short}
                          </span>
                        </div>
                        <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-500",
                              label.tone === "good"
                                ? "bg-emerald-500"
                                : label.tone === "mid"
                                  ? "bg-sky-500"
                                  : "bg-gray-400",
                            )}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <p className="text-xs leading-relaxed text-gray-600">
                          {label.text}
                        </p>
                        {node.misconceptions?.length ? (
                          <p className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50/80 p-2 text-xs text-amber-900">
                            <AlertCircle
                              className="mt-0.5 h-3.5 w-3.5 shrink-0"
                              aria-hidden
                            />
                            <span>
                              <span className="font-semibold">Tip: </span>
                              {node.misconceptions[0]}
                            </span>
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-4 py-10 text-center">
                  <Sparkles
                    className="mx-auto mb-3 h-9 w-9 text-violet-400"
                    aria-hidden
                  />
                  <p className="text-sm font-semibold text-gray-900">
                    We&apos;re still learning about your skills
                  </p>
                  <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-gray-600">
                    After a few lessons or quizzes, a map of your strengths will
                    appear here so you can see what you&apos;ve mastered and what to
                    review next.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex items-center justify-between px-1">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <Award className="h-4 w-4 text-amber-500" aria-hidden />
                Quiz &amp; lesson results
              </h2>
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium tabular-nums text-gray-600">
                {progressReports.length}
              </span>
            </div>

            {progressReports.length > 0 ? (
              <div className="grid gap-4">
                {progressReports.map((report) => (
                  <div
                    key={report.id}
                    className="group rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-colors hover:border-gray-300"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 space-y-1">
                        <span className="text-xs font-medium text-gray-500">
                          {report.lesson?.course?.title ||
                            getSubjectDisplayLabel(null)}
                        </span>
                        <h3 className="text-lg font-semibold text-gray-900 transition-colors group-hover:text-gray-700">
                          {report.lesson?.title || "Lesson check-in"}
                        </h3>
                        <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                          <Target className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          <span>Assessment</span>
                          <span className="text-gray-300">Â·</span>
                          <span>
                            {new Date(report.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end">
                        <div className="flex h-16 w-16 flex-col items-center justify-center rounded-xl border border-gray-200 bg-gray-50">
                          <span className="text-xl font-bold tracking-tight tabular-nums text-gray-900">
                            {report.masteryPercent}
                            <span className="text-sm font-semibold">%</span>
                          </span>
                        </div>
                        <span className="mt-1.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">
                          Score
                        </span>
                      </div>
                    </div>

                    {report.report?.studentSummary ? (
                      <div className="mt-5 border-t border-gray-100 pt-5">
                        <div className="flex items-start gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                            <Sparkles className="h-4 w-4" aria-hidden />
                          </div>
                          <p className="text-sm leading-relaxed text-gray-700">
                            <span className="font-medium text-gray-900">
                              In plain words:{" "}
                            </span>
                            {report.report.studentSummary}
                          </p>
                        </div>
                      </div>
                    ) : null}

                    {report.report?.identifiedGaps?.length ? (
                      <div className="mt-5 rounded-xl border border-amber-100 bg-amber-50/40 p-4">
                        <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold text-amber-900">
                          <AlertCircle
                            className="h-3.5 w-3.5 shrink-0"
                            aria-hidden
                          />
                          Good lessons to review next
                        </h4>
                        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
                          {report.report.identifiedGaps.map((gap, index) => (
                            <li
                              key={`${report.id}-${index}`}
                              className="flex items-start gap-2 rounded-lg border border-amber-100/60 bg-white/80 px-3 py-2 text-xs text-amber-950"
                            >
                              <span
                                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
                                aria-hidden
                              />
                              {gap}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 px-6 py-16 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-gray-200 bg-white">
                  <TrendingUp className="h-7 w-7 text-gray-300" aria-hidden />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">
                  No scores yet
                </h3>
                <p className="mx-auto mt-2 max-w-sm text-sm text-gray-600">
                  Complete a lesson or assigned check-in. Your results
                  will show up here with a short explanation.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

