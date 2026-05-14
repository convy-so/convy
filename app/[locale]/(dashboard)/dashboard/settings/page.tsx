import { SettingsPageClient } from "@/components/settings/settings-page-client";
import { getCurrentUiLocaleValue } from "@/lib/server/app-queries";

export default async function SettingsPage() {
  const initialLanguage = await getCurrentUiLocaleValue();
  return <SettingsPageClient initialLanguage={initialLanguage} />;
}
