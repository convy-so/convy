import { redirectLegacyLocalizedRoute } from "@/lib/i18n/legacy-localized-route";

type ExpertRedirectPageProps = {
  params: Promise<{ rest?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ExpertRedirectPage({
  params,
  searchParams,
}: ExpertRedirectPageProps) {
  const { rest = [] } = await params;

  await redirectLegacyLocalizedRoute({
    basePath: "/expert",
    rest,
    searchParams,
  });
}
