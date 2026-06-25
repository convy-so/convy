import { redirectLegacyLocalizedRoute } from "@/shared/i18n/legacy-localized-route";

type DashboardRedirectPageProps = {
  params: Promise<{ rest?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardRedirectPage({
  params,
  searchParams,
}: DashboardRedirectPageProps) {
  const { rest = [] } = await params;

  // Legacy compatibility for stale unprefixed teacher dashboard URLs.
  // Canonical in-app navigation should always use locale-prefixed routes.
  await redirectLegacyLocalizedRoute({
    basePath: "/dashboard",
    rest,
    searchParams,
  });
}
