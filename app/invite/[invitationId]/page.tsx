import { redirectLegacyLocalizedRoute } from "@/lib/i18n/legacy-localized-route";

type InviteRedirectPageProps = {
  params: Promise<{ invitationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function InviteRedirectPage({
  params,
  searchParams,
}: InviteRedirectPageProps) {
  const { invitationId } = await params;

  await redirectLegacyLocalizedRoute({
    basePath: "/invite",
    rest: [invitationId],
    searchParams,
  });
}
