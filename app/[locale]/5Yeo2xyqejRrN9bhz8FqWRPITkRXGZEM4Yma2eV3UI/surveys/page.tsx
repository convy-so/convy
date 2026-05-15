import { Suspense } from "react";
import { format } from "date-fns";
import {
  Calendar,
  ChevronRight,
  Loader2,
  MessageSquare,
  User as UserIcon,
} from "lucide-react";
import { headers } from "next/headers";

import { getSurveysForFeedback } from "@/app/actions/admin";
import { Link } from "@/i18n/routing";
import { getAdminAppPath } from "@/lib/auth/admin-path";
import { cn } from "@/lib/utils";

export default async function AdminSurveysPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  await params;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Survey Expert Review</h1>
        <p className="text-gray-500">
          Review created surveys and inspect their canonical research setup.
        </p>
      </div>

      <Suspense
        fallback={
          <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-100 bg-white p-12 shadow-sm">
            <Loader2 className="mb-4 h-8 w-8 animate-spin text-indigo-600" />
            <p className="text-sm text-gray-500">
              Loading surveys for review...
            </p>
          </div>
        }
      >
        <SurveysListWrapper />
      </Suspense>
    </div>
  );
}

async function SurveysListWrapper() {
  const cookieHeader = (await headers()).get("cookie");
  return <SurveysList cookieHeader={cookieHeader} />;
}

async function SurveysList({ cookieHeader }: { cookieHeader: string | null }) {
  const result = await getSurveysForFeedback(cookieHeader);

  if (!result.success) {
    return (
      <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-sm text-red-600">
        Failed to load surveys. Please refresh to try again.
      </div>
    );
  }

  if (result.data.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center text-gray-500 shadow-sm">
        No surveys found.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Survey
              </th>
              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Creator
              </th>
              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Status
              </th>
              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Created
              </th>
              <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {result.data.map((survey) => (
              <tr key={survey.id} className="transition-colors hover:bg-gray-50/50">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                      <MessageSquare className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="line-clamp-1 text-sm font-semibold text-gray-900">
                        {survey.title || "Untitled Survey"}
                      </p>
                      <p className="line-clamp-1 text-xs text-gray-500">
                        {survey.id}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <UserIcon className="h-3 w-3 text-gray-400" />
                    <span className="text-sm text-gray-600">
                      {survey.user?.name || "Unknown"}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                      survey.status === "active"
                        ? "bg-emerald-50 text-emerald-700"
                        : survey.status === "creating"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-gray-100 text-gray-700",
                    )}
                  >
                    {survey.status}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Calendar className="h-3 w-3" />
                    {format(new Date(survey.createdAt), "MMM d, yyyy")}
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <Link
                    href={getAdminAppPath(`/surveys/${survey.id}`)}
                    className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 transition-colors hover:text-indigo-700"
                  >
                    Review
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
