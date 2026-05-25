import { redirectLegacyLocalizedRoute } from "@/lib/i18n/legacy-localized-route";

type ResetPasswordRedirectPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ResetPasswordRedirectPage({
  searchParams,
}: ResetPasswordRedirectPageProps) {
  await redirectLegacyLocalizedRoute({
    basePath: "/reset-password",
    searchParams,
  });
}
