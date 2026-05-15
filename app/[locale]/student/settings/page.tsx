import { SettingsPageClient } from "@/components/settings/settings-page-client";
import { getCurrentUiLocaleValue } from "@/lib/server/app-queries";

export default async function StudentSettingsPage() {
  const initialLanguage = await getCurrentUiLocaleValue();
  return <SettingsPageClient initialLanguage={initialLanguage} />;
}
