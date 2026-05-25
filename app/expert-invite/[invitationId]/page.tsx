import { redirectLegacyLocalizedRoute } from "@/lib/i18n/legacy-localized-route";

type ExpertInviteRedirectPageProps = {
  params: Promise<{ invitationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ExpertInviteRedirectPage({
  params,
  searchParams,
}: ExpertInviteRedirectPageProps) {
  const { invitationId } = await params;

  await redirectLegacyLocalizedRoute({
    basePath: "/expert-invite",
    rest: [invitationId],
    searchParams,
  });
}
