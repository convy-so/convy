import { SettingsPageClient } from "@/features/settings/ui/settings-page-client";
import { getCurrentUiLocaleValue } from "@/shared/http/page-data";

export default async function StudentSettingsPage() {
  const initialLanguage = await getCurrentUiLocaleValue();
  return <SettingsPageClient initialLanguage={initialLanguage} />;
}
