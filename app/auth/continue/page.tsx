import { redirectLegacyLocalizedRoute } from "@/lib/i18n/legacy-localized-route";

type AuthContinueRedirectPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AuthContinueRedirectPage({
  searchParams,
}: AuthContinueRedirectPageProps) {
  await redirectLegacyLocalizedRoute({
    basePath: "/auth/continue",
    searchParams,
  });
}
