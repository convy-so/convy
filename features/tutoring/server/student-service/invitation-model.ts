export const PENDING_INVITE_STATUS = "pending";

export type StudentInviteResult = {
  id: string;
  classroomId: string;
  email: string;
  inviteStatus: string;
};

export type InvitationValidationError = {
  email: string;
  reason: "self" | "staff_account" | "already_member" | "already_invited";
};

export function normalizeStudentInviteInput(input: { email: string }) {
  return {
    normalizedEmail: input.email.trim().toLowerCase(),
  };
}
