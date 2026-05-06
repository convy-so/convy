import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/auth/dal";
import { getPlatformRole } from "@/lib/auth/dal";

export default async function SurveysLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await getVerifiedSession(await headers()).catch(() => null);
  if (!session) redirect(`/${locale}/sign-in`);
  const role = getPlatformRole(session.user);
  if (role !== "teacher" && role !== "admin") redirect(`/${locale}/dashboard/learning`);
  return <>{children}</>;
}
