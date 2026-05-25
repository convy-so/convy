import { redirectLegacyLocalizedRoute } from "@/lib/i18n/legacy-localized-route";

type ForgotPasswordRedirectPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ForgotPasswordRedirectPage({
  searchParams,
}: ForgotPasswordRedirectPageProps) {
  await redirectLegacyLocalizedRoute({
    basePath: "/forgot-password",
    searchParams,
  });
}
