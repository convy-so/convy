import { redirectLegacyLocalizedRoute } from "@/shared/i18n/legacy-localized-route";

type SignUpRedirectPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SignUpRedirectPage({
  searchParams,
}: SignUpRedirectPageProps) {
  await redirectLegacyLocalizedRoute({
    basePath: "/sign-up",
    searchParams,
  });
}
