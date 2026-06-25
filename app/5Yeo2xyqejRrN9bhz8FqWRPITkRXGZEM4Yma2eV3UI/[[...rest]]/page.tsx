import { redirectLegacyLocalizedRoute } from "@/shared/i18n/legacy-localized-route";
import { getAdminAppPath } from "@/features/auth/public-server";

type AdminRedirectPageProps = {
  params: Promise<{ rest?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminRedirectPage({
  params,
  searchParams,
}: AdminRedirectPageProps) {
  const { rest = [] } = await params;

  await redirectLegacyLocalizedRoute({
    basePath: getAdminAppPath(),
    rest,
    searchParams,
  });
}
