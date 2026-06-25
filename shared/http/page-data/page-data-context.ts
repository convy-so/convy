import { getVerifiedSession } from "@/features/auth/public-server";

export type VerifiedSession = Awaited<ReturnType<typeof getVerifiedSession>>;
export type QueryAuthContext = { session: VerifiedSession };

export async function resolveQuerySession(authContext?: QueryAuthContext) {
  return authContext?.session ?? getVerifiedSession();
}
