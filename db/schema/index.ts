export * from "./common";
export * from "./enums";
export * from "./auth";
export * from "./folders";
export * from "./vectors";
export * from "./voice";
export * from "./collaboration";
export * from "./notifications";
export * from "./surveys";
export * from "./relations";
export * from "./billing";
export * from "./ai";
export * from "./learning";
export * from "./feedback";
export * from "./privacy";

// Re-export specific authSchema if needed by better-auth or others
import { users, accounts, sessions, verificationTokens } from "./auth";
import { notifications } from "./notifications";

export const authSchema = {
  users: users,
  account: accounts,
  session: sessions,
  verification: verificationTokens,
  notification: notifications,
};
