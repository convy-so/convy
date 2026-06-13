import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  getVerifiedSession,
  isInvalidAccountStateError,
  requirePlatformRole,
  type PlatformRole,
} from "@/lib/auth/dal";
import {
  getLocalizedAuthIssuePath,
  getLocalizedSignedInHomePath,
} from "@/lib/auth/redirect";
import { normalizeAppLocale } from "@/lib/i18n/config";

export default async function SurveysLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const appLocale = normalizeAppLocale(locale);
  const session = await getVerifiedSession(await headers()).catch(() => null);
  if (!session) redirect(`/${locale}/sign-in`);
  let role: PlatformRole;
  try {
    role = requirePlatformRole(session.user);
  } catch (error) {
    if (isInvalidAccountStateError(error)) {
      redirect(getLocalizedAuthIssuePath(appLocale));
    }
    throw error;
  }
  if (role !== "teacher" && role !== "admin") {
    redirect(getLocalizedSignedInHomePath(appLocale, role));
  }
  return <>{children}</>;
}
