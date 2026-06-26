"use client";

import {
  Sparkles,
  UserCircle,
  GraduationCap,
  BookOpen,
  CheckCircle2,
  Clock,
  Bell,
  PlayCircle,
} from "lucide-react";
import { Link } from "@/i18n/routing";
import { useStudentClassesWorkspace } from "@/features/tutoring/client/hooks/use-student-classes-workspace";
import type { StudentMeData } from "@/features/tutoring/public-client";
import { StudentInvitationCard } from "@/features/tutoring/ui/student-invitation-card";
import { StatsCard } from "@/shared/ui/workspace/workspace-stat-card";
import { useAuth } from "@/features/auth/public-ui";
import type { getMyPatternSummaries } from "@/shared/http/page-data";

type StudentStudentMeData = Extract<StudentMeData, { role: "student" }> & {
  invitations?: Array<{
    id: string;
    classroomId: string;
    classroomTitle: string;
    invitedEmail: string;
    status: string;
    expiresAt: string | null;
  }>;
};

type StudentDashboardSession = {
  id: string;
  classroomStudentId: string;
  lessonId: string | null;
  sessionStatus: string;
  updatedAt: string;
  lesson?: {
    title?: string | null;
    description?: string | null;
  } | null;
  classroomStudent?: {
    classroom?: {
      classroomId?: string;
      title?: string | null;
    } | null;
    classroomId?: string;
  } | null;
};

function firstNameFromDisplayName(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] ?? null;
}

export function StudentClassesHome({
  studentMe,
  initialPatterns,
  initialStudentSessions = [],
}: {
  studentMe: StudentStudentMeData;
  initialPatterns?: Awaited<ReturnType<typeof getMyPatternSummaries>>;
  initialStudentSessions?: StudentDashboardSession[];
}) {
  const { user } = useAuth();
  const {
    memberships,
    invitations,
    acceptInvitationMutation,
    rejectInvitationMutation,
  } = useStudentClassesWorkspace({
    studentMe,
    initialPatterns,
  });

  const greetingFirstName =
    firstNameFromDisplayName(studentMe.student[0]?.fullName) ??
    firstNameFromDisplayName(user?.name) ??
    firstNameFromDisplayName(user?.email?.split("@")[0]) ??
    "there";

  // Calculate statistics
  const enrolledClassesCount = memberships.length;
  const activeSessions = initialStudentSessions.filter((s) => s.sessionStatus === "active");
  const activeSessionsCount = activeSessions.length;
  const completedSessionsCount = initialStudentSessions.filter((s) => s.sessionStatus === "completed").length;

  let notStartedLessonCount = 0;
  for (const membership of memberships) {
    for (const lesson of membership.lessons) {
      const hasSession = initialStudentSessions.some(
        (s) => s.classroomStudentId === membership.classroomStudentId && s.lessonId === lesson.id,
      );
      if (!hasSession) {
        notStartedLessonCount += 1;
      }
    }
  }

  const quickActions = [
    {
      title: "My Classes",
      description: "View lessons, class activity, and materials",
      icon: GraduationCap,
      href: "/student/classes",
      color: "from-blue-600 to-indigo-600",
    },
    {
      title: "View My Progress",
      description: "See your visual skill map and assessment logs",
      icon: CheckCircle2,
      href: "/student/classes", // User selects a class to view details
      color: "from-purple-500 to-pink-500",
    },
    {
      title: "My Profile",
      description: "Manage your customized AI profile details",
      icon: UserCircle,
      href: "/student/profile",
      color: "from-amber-500 to-orange-500",
    },
  ];

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* Modern Greeting Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border-2 border-slate-100 bg-white px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-slate-500">
            <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
            Student Workspace
          </div>
          <h1 className="text-2xl lg:text-3xl font-extrabold text-[#111111] tracking-tight mt-3">
            Hi, {greetingFirstName}!
          </h1>
          <p className="text-[#666666] mt-1 lg:mt-2 text-sm lg:text-base font-semibold leading-relaxed">
            Welcome to your AI-powered learning dashboard. Monitor your performance and continue active lessons.
          </p>
        </div>
      </div>

      {/* Premium Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <StatsCard
          title="Enrolled Classes"
          value={enrolledClassesCount.toString()}
          description="Active classrooms"
          icon={<GraduationCap className="w-5 h-5" />}
          iconColor="bg-sky-50 text-sky-600 border border-sky-100"
        />

        <StatsCard
          title="Not Started Lessons"
          value={notStartedLessonCount.toString()}
          description="Available lessons"
          icon={<BookOpen className="w-5 h-5" />}
          iconColor="bg-indigo-50 text-indigo-600 border border-indigo-100"
        />

        <StatsCard
          title="Active Lessons"
          value={activeSessionsCount.toString()}
          description="Awaiting completion"
          icon={<Clock className="w-5 h-5" />}
          iconColor="bg-emerald-50 text-emerald-600 border border-emerald-100"
        />

        <StatsCard
          title="Completed Lessons"
          value={completedSessionsCount.toString()}
          description="Assessment reports"
          icon={<CheckCircle2 className="w-5 h-5" />}
          iconColor="bg-amber-50 text-amber-600 border border-amber-100"
        />
      </div>

      {/* Interactive Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {quickActions.map((action) => (
          <Link
            key={action.title}
            href={action.href}
            className="group bg-white rounded-3xl border border-slate-100 p-6 hover:shadow-lg hover:border-slate-200 transition-all duration-300"
          >
            <div
              className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${action.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 shadow-md`}
            >
              <action.icon className="w-6 h-6 text-white" />
            </div>
            <h3 className="font-extrabold text-slate-800 tracking-tight mb-1 text-lg">{action.title}</h3>
            <p className="text-sm font-semibold text-slate-400">{action.description}</p>
          </Link>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Invitations & Active Sessions */}
        <div className="lg:col-span-2 space-y-6">
          {/* 1. Invitations (If any exist) */}
          {invitations.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 px-1">
                <Sparkles className="h-4 w-4 text-amber-500 animate-pulse" />
                Class Invitations
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {invitations.map((invitation) => (
                  <StudentInvitationCard
                    key={invitation.id}
                    invitation={invitation}
                    onAccept={() => acceptInvitationMutation.mutate(invitation.id)}
                    onDecline={() => rejectInvitationMutation.mutate(invitation.id)}
                    acceptPending={
                      acceptInvitationMutation.isPending &&
                      acceptInvitationMutation.variables === invitation.id
                    }
                    declinePending={
                      rejectInvitationMutation.isPending &&
                      rejectInvitationMutation.variables === invitation.id
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {/* 2. Active / In-Progress Sessions list */}
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 px-1">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
              Continue Lessons
            </h2>
            {activeSessions.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {activeSessions.map((s) => (
                  <div
                    key={s.id}
                    className="bg-white rounded-3xl border border-slate-100 p-6 flex flex-col justify-between hover:shadow-md hover:border-slate-200 transition-all duration-300"
                  >
                    <div className="space-y-2">
                      <span className="text-xs font-extrabold uppercase tracking-widest text-slate-400">
                        {s.classroomStudent?.classroom?.title ?? "Learning"}
                      </span>
                      <h3 className="text-lg font-bold text-slate-800 line-clamp-1">
                        {s.lesson?.title || "General check-in"}
                      </h3>
                      <p className="text-slate-500 text-sm line-clamp-2 leading-relaxed">
                        {s.lesson?.description || "Continue your lesson with personalized learning support."}
                      </p>
                    </div>
                    
                    <div className="mt-6 pt-4 border-t border-slate-50 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-400">
                        Last Active: {new Date(s.updatedAt).toLocaleDateString()}
                      </span>
                      <Link
                        href={`/student/classes/${s.classroomStudent?.classroomId}/lessons/${s.lessonId}`}
                        className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl shadow-md shadow-indigo-100 transition-all hover:scale-105"
                      >
                        <PlayCircle className="h-4 w-4" />
                        Continue Lesson
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-3xl border border-slate-100 p-12 text-center shadow-sm">
                <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto mb-4">
                  <Clock className="h-8 w-8 text-slate-400" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">No active lessons</h3>
                <p className="text-slate-500 max-w-xs mx-auto text-sm font-semibold leading-relaxed">
                  Go to <Link href="/student/classes" className="text-indigo-600 font-extrabold hover:underline">My Classes</Link> to start a lesson or review your progress.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column - Notifications */}
        <div className="lg:col-span-1 space-y-4">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 px-1">
            <Bell className="h-5 w-5 text-slate-400" />
            Recent Activity
          </h2>
          <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm min-h-[300px] flex flex-col justify-between">
            {/* Standard notifications container */}
            <div className="space-y-4 divide-y divide-slate-50">
              <div className="pt-2 text-sm font-bold text-slate-400 uppercase tracking-widest text-center py-12">
                No recent notifications
              </div>
            </div>
            
            <div className="text-xs font-bold text-slate-300 text-center tracking-widest mt-auto">
              UPDATED LIVE
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


