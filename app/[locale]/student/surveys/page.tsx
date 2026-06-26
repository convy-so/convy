import { Link } from "@/i18n/routing";
import { getStudentMeData } from "@/shared/http/page-data";
import {
  ClipboardList,
  ExternalLink,
  LayoutGrid,
  CheckCircle2,
  Clock3,
  Hourglass,
  AlertCircle,
  ArrowRight,
  School,
  Sparkles,
} from "lucide-react";

type StudentSurveyItem = {
  id: string;
  title: string;
  status: string;
  isVoice: boolean;
  shareableLink: string;
  createdAt: string | null;
  latestActivityAt: string | null;
  responseStatus: "not_started" | "in_progress" | "completed";
  completedAt: string | null;
};

type StudentSurveyGroup = {
  classroomId: string;
  classroomTitle: string;
  gradeLabel: string;
  surveys: StudentSurveyItem[];
};

function formatDate(value: string | null) {
  if (!value) return "Recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return date.toLocaleDateString();
}

function sortSurveys(surveys: StudentSurveyItem[]) {
  const statusRank: Record<StudentSurveyItem["responseStatus"], number> = {
    not_started: 0,
    in_progress: 1,
    completed: 2,
  };

  return [...surveys].sort((left, right) => {
    const rankDiff = statusRank[left.responseStatus] - statusRank[right.responseStatus];
    if (rankDiff !== 0) return rankDiff;

    const leftTime = new Date(left.latestActivityAt ?? left.createdAt ?? 0).getTime();
    const rightTime = new Date(right.latestActivityAt ?? right.createdAt ?? 0).getTime();
    return rightTime - leftTime;
  });
}

function getActionCopy(status: StudentSurveyItem["responseStatus"]) {
  switch (status) {
    case "completed":
      return "Review survey";
    case "in_progress":
      return "Resume survey";
    default:
      return "Start survey";
  }
}

function responseMeta(status: StudentSurveyItem["responseStatus"]) {
  switch (status) {
    case "completed":
      return {
        label: "Completed",
        icon: CheckCircle2,
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      };
    case "in_progress":
      return {
        label: "In progress",
        icon: Clock3,
        className: "border-amber-200 bg-amber-50 text-amber-700",
      };
    default:
      return {
        label: "Not started",
        icon: Hourglass,
        className: "border-slate-200 bg-slate-50 text-slate-600",
      };
  }
}

export default async function StudentSurveysPage() {
  const studentMe = await getStudentMeData();

  if (studentMe.role !== "student") {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-50">
            <AlertCircle className="h-8 w-8 text-slate-300" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Student surveys</h1>
          <p className="mx-auto mt-3 max-w-md text-sm font-medium leading-6 text-slate-500">
            This page is available to student accounts only.
          </p>
        </div>
      </div>
    );
  }

  const groups = studentMe.student.flatMap((membership): StudentSurveyGroup[] => {
    const surveys = membership.surveys ?? [];
    if (surveys.length === 0) return [];

    return [
      {
        classroomId: membership.classroom.id,
        classroomTitle: membership.classroom.title,
        gradeLabel: membership.classroom.gradeLabel,
        surveys: sortSurveys(surveys),
      },
    ];
  });

  const totalSurveys = groups.reduce((count, group) => count + group.surveys.length, 0);
  const completedSurveys = groups.reduce(
    (count, group) =>
      count +
      group.surveys.filter((survey) => survey.responseStatus === "completed").length,
    0,
  );
  const inProgressSurveys = groups.reduce(
    (count, group) =>
      count +
      group.surveys.filter((survey) => survey.responseStatus === "in_progress").length,
    0,
  );
  const notStartedSurveys = groups.reduce(
    (count, group) =>
      count +
      group.surveys.filter((survey) => survey.responseStatus === "not_started").length,
    0,
  );

  return (
    <div className="space-y-8 max-w-6xl">
      <div className="overflow-hidden rounded-[2rem] border border-[#d8eac7] bg-[radial-gradient(circle_at_top_left,_#ffffff_0%,_#f7fbe8_45%,_#eef7d8_100%)] p-6 shadow-[0_18px_40px_-28px_rgba(60,127,10,0.45)] sm:p-8">
        <div className="space-y-4">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#cfe7b5] bg-white/85 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#3c7f0a]">
            <ClipboardList className="h-3.5 w-3.5 text-[#58cc02]" />
            Student surveys
          </div>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl space-y-2">
              <h1 className="text-3xl font-extrabold tracking-tight text-[#243114] sm:text-4xl">
                Classroom surveys
              </h1>
              <p className="text-[15px] font-medium leading-relaxed text-[#5d6b4f]">
                Surveys sent inside your classrooms appear here with their class name, response status, and the right action to take next.
              </p>
            </div>
            {totalSurveys > 0 ? (
              <div className="inline-flex items-center gap-2 rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-sm font-bold text-[#2f4812] shadow-sm">
                <Sparkles className="h-4 w-4 text-[#58cc02]" />
                {notStartedSurveys > 0
                  ? `${notStartedSurveys} waiting for your response`
                  : "All assigned surveys have been opened"}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-slate-400">
            Assigned surveys
          </p>
          <div className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900">
            {totalSurveys}
          </div>
        </div>
        <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-slate-400">
            In progress
          </p>
          <div className="mt-3 text-3xl font-extrabold tracking-tight text-amber-600">
            {inProgressSurveys}
          </div>
        </div>
        <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-slate-400">
            Waiting to start
          </p>
          <div className="mt-3 text-3xl font-extrabold tracking-tight text-sky-600">
            {notStartedSurveys}
          </div>
        </div>
        <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-slate-400">
            Completed
          </p>
          <div className="mt-3 text-3xl font-extrabold tracking-tight text-emerald-600">
            {completedSurveys}
          </div>
        </div>
      </div>

      {groups.length > 0 ? (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.classroomId} className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-slate-900">
                    {group.classroomTitle}
                  </h2>
                  <p className="text-sm font-medium text-slate-500">{group.gradeLabel}</p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-600">
                  <LayoutGrid className="h-3.5 w-3.5" />
                  {group.surveys.length} survey{group.surveys.length === 1 ? "" : "s"}
                </div>
                <Link
                  href={`/student/classes/${group.classroomId}/lessons`}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
                >
                  <School className="h-3.5 w-3.5" />
                  Open class
                </Link>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {group.surveys.map((survey) => {
                  const status = responseMeta(survey.responseStatus);
                  const StatusIcon = status.icon;
                  const actionCopy = getActionCopy(survey.responseStatus);
                  const lastActivityLabel =
                    survey.responseStatus === "completed"
                      ? "Completed"
                      : survey.responseStatus === "in_progress"
                        ? "Last activity"
                        : "Assigned";
                  const lastActivityValue =
                    survey.responseStatus === "completed"
                      ? formatDate(survey.completedAt)
                      : formatDate(survey.latestActivityAt ?? survey.createdAt);

                  return (
                    <article
                      key={survey.id}
                      className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${status.className}`}
                            >
                              <StatusIcon className="h-3.5 w-3.5" />
                              {status.label}
                            </span>
                            {survey.isVoice ? (
                              <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
                                Voice survey
                              </span>
                            ) : null}
                          </div>
                          <h3 className="text-lg font-extrabold tracking-tight text-slate-900">
                            {survey.title}
                          </h3>
                          <p className="text-sm font-medium text-slate-500">
                            Sent in {group.classroomTitle} on {formatDate(survey.createdAt)}
                          </p>
                        </div>

                        <Link
                          href={`/s/${survey.shareableLink}/respond`}
                          className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-slate-800"
                        >
                          {actionCopy}
                          {survey.responseStatus === "completed" ? (
                            <ExternalLink className="h-4 w-4" />
                          ) : (
                            <ArrowRight className="h-4 w-4" />
                          )}
                        </Link>
                      </div>

                      <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-slate-400">
                            Classroom
                          </p>
                          <p className="mt-1 font-bold text-slate-800">{group.classroomTitle}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-slate-400">
                            {lastActivityLabel}
                          </p>
                          <p className="mt-1 font-bold text-slate-800">
                            {lastActivityValue}
                          </p>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-50">
            <ClipboardList className="h-8 w-8 text-slate-300" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            No classroom surveys yet
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm font-medium leading-6 text-slate-500">
            When a teacher sends a survey to one of your classrooms, it will appear here with the classroom name so you know where it came from.
          </p>
        </div>
      )}
    </div>
  );
}

