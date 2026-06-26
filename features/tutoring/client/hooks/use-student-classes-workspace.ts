"use client";

import { useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";

import { respondToInvitationAction } from "@/app/actions/classroom";
import { useRouter } from "@/i18n/routing";
import { getFriendlyActionError } from "@/shared/http/friendly-action-error";
import type { StudentMeData } from "@/features/tutoring/public-client";

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

export function useStudentClassesWorkspace({
  studentMe,
}: {
  studentMe: StudentStudentMeData;
  initialPatterns?: unknown;
}) {
  const router = useRouter();
  const memberships = useMemo(() => studentMe.student ?? [], [studentMe.student]);
  const invitations = useMemo(() => studentMe.invitations ?? [], [studentMe.invitations]);

  const acceptInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const result = await respondToInvitationAction({
        invitationId,
        decision: "accepted",
      });
      if (!result.success) {
        throw new Error(getFriendlyActionError(result.error));
      }
      return result.data;
    },
    onSuccess: () => {
      toast.success("Invitation accepted");
      router.refresh();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to accept invitation");
    },
  });

  const rejectInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const result = await respondToInvitationAction({
        invitationId,
        decision: "rejected",
      });
      if (!result.success) {
        throw new Error(getFriendlyActionError(result.error));
      }
      return result.data;
    },
    onSuccess: () => {
      toast.success("Invitation dismissed");
      router.refresh();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to reject invitation");
    },
  });

  return {
    memberships,
    invitations,
    acceptInvitationMutation,
    rejectInvitationMutation,
  };
}

