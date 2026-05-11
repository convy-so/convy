import { apiError } from "@/lib/api/error-contract";
import { getVerifiedSession, isExpert } from "@/lib/auth/dal";

export async function requireExpertSession() {
  const session = await getVerifiedSession();
  if (!isExpert(session.user)) {
    return { error: apiError("UNAUTHORIZED", "Expert or admin access required") } as const;
  }

  return { session } as const;
}
