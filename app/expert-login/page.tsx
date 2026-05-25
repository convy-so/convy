import { redirectLegacyLocalizedRoute } from "@/lib/i18n/legacy-localized-route";

type ExpertLoginRedirectPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ExpertLoginRedirectPage({
  searchParams,
}: ExpertLoginRedirectPageProps) {
  await redirectLegacyLocalizedRoute({
    basePath: "/expert-login",
    searchParams,
  });
}
