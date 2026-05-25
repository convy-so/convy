import { redirectLegacyLocalizedRoute } from "@/lib/i18n/legacy-localized-route";

type VerifyEmailRedirectPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function VerifyEmailRedirectPage({
  searchParams,
}: VerifyEmailRedirectPageProps) {
  await redirectLegacyLocalizedRoute({
    basePath: "/verify-email",
    searchParams,
  });
}
