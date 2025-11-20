import "server-only";

import { headers } from "next/headers";

import { auth, type AuthSessionWithUser } from "@/lib/auth";

const cloneRequestHeaders = async () => {
  const incomingHeaders = await headers();
  const result = new Headers();

  incomingHeaders.forEach((value, key) => {
    result.append(key, value);
  });

  return result;
};

export async function getCurrentSession(): Promise<AuthSessionWithUser | null> {
  return auth.api.getSession({
    headers: await cloneRequestHeaders(),
  });
}

export async function getVerifiedSession(): Promise<AuthSessionWithUser> {
  const session = await getCurrentSession();

  if (!session) {
    throw new Error("UNAUTHENTICATED");
  }

  if (!session.user.emailVerified) {
    throw new Error("EMAIL_NOT_VERIFIED");
  }

  return session;
}
