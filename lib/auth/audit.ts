import "server-only";

type AuthAuditEvent =
  | "invalid_auth_intent"
  | "invalid_account_state_detected"
  | "role_assignment_applied"
  | "role_assignment_rejected"
  | "invite_email_mismatch"
  | "staff_invitation_blocked"
  | "unsafe_redirect_target"
  | "invite_acceptance_replay";

export function logAuthAuditEvent(
  event: AuthAuditEvent,
  details: Record<string, unknown>,
) {
  console.warn(
    JSON.stringify({
      scope: "auth_audit",
      event,
      timestamp: new Date().toISOString(),
      ...details,
    }),
  );
}
