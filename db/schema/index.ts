export * from "./common";
export * from "./enums";
export * from "./auth";
export * from "./organization";
export * from "./surveys";
export * from "./voice";
export * from "./billing";
export * from "./integrations";
export * from "./relations";

// Re-export specific authSchema if needed by better-auth or others
import { users, accounts, sessions, verificationTokens } from "./auth";
import { organizations, members, invitations } from "./organization";

export const authSchema = {
  users: users,
  account: accounts,
  session: sessions,
  verification: verificationTokens,
  organization: organizations,
  member: members,
  invitation: invitations,
};
