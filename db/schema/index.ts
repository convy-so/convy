export * from "./common";
export * from "./domain-embeddings";
export * from "./enums";
export * from "./auth";
export * from "./organization";
export * from "./vectors";
export * from "./voice";
export * from "./collaboration";
export * from "./notifications";
export * from "./surveys";
export * from "./relations";
export * from "./billing";

// Re-export specific authSchema if needed by better-auth or others
import { users, accounts, sessions, verificationTokens } from "./auth";
import { organizations, members, invitations } from "./organization";
import { notifications } from "./notifications";

export const authSchema = {
  users: users,
  account: accounts,
  session: sessions,
  verification: verificationTokens,
  organization: organizations,
  member: members,
  invitation: invitations,
  notification: notifications,
};
