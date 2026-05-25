import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { defaultAppLocale, normalizeAppLocale } from "@/lib/i18n/config";
import { localizeAppPath } from "@/lib/auth/redirect";

type LegacySearchParams = Record<string, string | string[] | undefined>;

export type LegacyLocalizedRouteInput = {
  basePath: string;
  rest?: string[];
  searchParams?: Promise<LegacySearchParams> | LegacySearchParams;
};

function buildSearchString(searchParams: LegacySearchParams | undefined) {
  if (!searchParams) return "";

  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        query.append(key, item);
      }
      continue;
    }

    if (typeof value === "string") {
      query.set(key, value);
    }
  }

  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

export async function redirectLegacyLocalizedRoute(
  input: LegacyLocalizedRouteInput,
) {
  const [cookieStore, resolvedSearchParams] = await Promise.all([
    cookies(),
    input.searchParams,
  ]);

  const locale = normalizeAppLocale(
    cookieStore.get("NEXT_LOCALE")?.value,
    defaultAppLocale,
  );
  const normalizedBasePath = input.basePath.startsWith("/")
    ? input.basePath
    : `/${input.basePath}`;
  const restPath =
    input.rest && input.rest.length
      ? `/${input.rest.map(encodeURIComponent).join("/")}`
      : "";
  const localizedPath = localizeAppPath(
    locale,
    `${normalizedBasePath}${restPath}`,
  );

  redirect(`${localizedPath}${buildSearchString(resolvedSearchParams)}`);
}
