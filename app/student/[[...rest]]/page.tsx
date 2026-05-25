import { redirectLegacyLocalizedRoute } from "@/lib/i18n/legacy-localized-route";

type StudentRedirectPageProps = {
  params: Promise<{ rest?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function StudentRedirectPage({
  params,
  searchParams,
}: StudentRedirectPageProps) {
  const { rest = [] } = await params;

  await redirectLegacyLocalizedRoute({
    basePath: "/student",
    rest,
    searchParams,
  });
}
