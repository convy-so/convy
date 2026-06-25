import { Suspense } from "react";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { Loader2 } from "lucide-react";

import { DashboardHomeContent } from "./dashboard-home-content";

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      }
    >
      <DashboardContentWrapper />
    </Suspense>
  );
}

async function DashboardContentWrapper() {
  const authHeaders = await headers();
  const translations = await getTranslations("Dashboard");

  return (
    <DashboardHomeContent
      authHeaders={authHeaders}
      translations={translations}
    />
  );
}
