export * from "./schema/common";
export * from "./schema/enums";
export * from "./schema/auth";
export * from "./schema/folders";
export * from "./schema/vectors";
export * from "./schema/voice";
export * from "./schema/collaboration";
export * from "./schema/notifications";
export * from "./schema/surveys";
export * from "./schema/relations";
export * from "./schema/billing";
export * from "./schema/ai";
export * from "./schema/tutoring";
export * from "./schema/feedback";
export * from "./schema/privacy";

// Re-export specific authSchema if needed by better-auth or others.
import { users, accounts, sessions, verificationTokens } from "./schema/auth";
import { notifications } from "./schema/notifications";

export const authSchema = {
  users,
  account: accounts,
  session: sessions,
  verification: verificationTokens,
  notification: notifications,
};
