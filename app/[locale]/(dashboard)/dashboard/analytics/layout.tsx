import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  getVerifiedSession,
  isInvalidAccountStateError,
  requirePlatformRole,
  type PlatformRole,
} from "@/features/auth/public-server";
import {
  getLocalizedAuthIssuePath,
  getLocalizedSignedInHomePath,
} from "@/features/auth/public-server";
import { normalizeAppLocale } from "@/shared/i18n/config";

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
