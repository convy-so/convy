import { apiError } from "@/shared/http/api-error";
import { getVerifiedSession, isExpert } from "@/features/auth/public-server";

export async function requireExpertSession() {
  const session = await getVerifiedSession();
  if (!isExpert(session.user)) {
    return { error: apiError("UNAUTHORIZED", "Expert or admin access required") } as const;
  }

  return { session } as const;
}
