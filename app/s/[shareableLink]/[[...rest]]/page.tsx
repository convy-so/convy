import { redirectLegacyLocalizedRoute } from "@/shared/i18n/legacy-localized-route";

type SharedSurveyRedirectPageProps = {
  params: Promise<{ shareableLink: string; rest?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SharedSurveyRedirectPage({
  params,
  searchParams,
}: SharedSurveyRedirectPageProps) {
  const { shareableLink, rest = [] } = await params;

  await redirectLegacyLocalizedRoute({
    basePath: "/s",
    rest: [shareableLink, ...rest],
    searchParams,
  });
}
