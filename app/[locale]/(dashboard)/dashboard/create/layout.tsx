import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/auth/session";
import { getEffectiveAppRole } from "@/lib/auth/effective-role";

export default async function SurveysLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await getVerifiedSession(await headers()).catch(() => null);
  if (!session) redirect(`/${locale}/sign-in`);
  const role = await getEffectiveAppRole(session.user);
  if (role !== "teacher" && role !== "admin") redirect(`/${locale}/dashboard/learning`);
  return <>{children}</>;
}
