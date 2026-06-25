import { redirectLegacyLocalizedRoute } from "@/shared/i18n/legacy-localized-route";

type SignInRedirectPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SignInRedirectPage({
  searchParams,
}: SignInRedirectPageProps) {
  await redirectLegacyLocalizedRoute({
    basePath: "/sign-in",
    searchParams,
  });
}
