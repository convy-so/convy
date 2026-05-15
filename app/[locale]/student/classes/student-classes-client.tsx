"use client";

import { useStudentLearningWorkspace } from "@/components/learning/hooks/use-student-learning-workspace";
import { StudentInvitationCard } from "@/components/learning/student-invitation-card";
import { StudentCourseCard } from "@/components/student/student-course-card";
import { Sparkles, CheckCircle2, GraduationCap } from "lucide-react";
import type { LearningMeData } from "@/lib/api/learning";

type StudentLearningMeData = Extract<LearningMeData, { role: "student" }>;

export function StudentClassesClient({
  initialLearningMe,
  initialPatterns,
}: {
  initialLearningMe: StudentLearningMeData;
  initialPatterns: unknown;
}) {
  const { memberships, invitations, acceptInvitationMutation, rejectInvitationMutation } =
    useStudentLearningWorkspace({
      learningMe: initialLearningMe,
      initialPatterns,
    });

  return (
    <div className="space-y-10 pb-20">
      {invitations.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 px-1">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-gray-900">Invites for you</h2>
            <span className="ml-auto rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-900">
              {invitations.length} new
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {invitations.map((invitation) => (
              <StudentInvitationCard
                key={invitation.id}
                invitation={invitation}
                onAccept={() => acceptInvitationMutation.mutate(invitation.id)}
                onDecline={() => rejectInvitationMutation.mutate(invitation.id)}
                acceptPending={
                  acceptInvitationMutation.isPending && acceptInvitationMutation.variables === invitation.id
                }
                declinePending={
                  rejectInvitationMutation.isPending && rejectInvitationMutation.variables === invitation.id
                }
              />
            ))}
          </div>
        </div>
      )}

      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2 px-1">
          <CheckCircle2 className="h-4 w-4 text-gray-600" />
          <h2 className="text-sm font-semibold text-gray-900">Your courses</h2>
        </div>

        {memberships.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {memberships.map((membership) => (
              <StudentCourseCard key={membership.classroomStudentId} membership={membership} variant="actions" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white py-16 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-gray-100">
              <GraduationCap className="h-7 w-7 text-gray-400" />
            </div>
            <h3 className="text-base font-semibold text-gray-900">No courses yet</h3>
            <p className="mt-2 max-w-sm px-4 text-sm text-gray-600">
              Your teacher will invite you when a class is ready.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
