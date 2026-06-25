import { Suspense } from "react";
import { headers } from "next/headers";
import { Loader2 } from "lucide-react";

import { getUserGrowthData } from "@/app/actions/admin";
import { GrowthChart } from "@/features/admin/ui/growth-chart";

export default async function AdminUsersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  await params;
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">User Growth</h1>
        <p className="text-gray-500">
          Tracking user acquisition and engagement trends.
        </p>
      </div>

      <Suspense
        fallback={
          <div className="flex min-h-[400px] items-center justify-center rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        }
      >
        <AdminUsersContent />
      </Suspense>
    </div>
  );
}

async function AdminUsersContent() {
  const cookieHeader = (await headers()).get("cookie");
  const result = await getUserGrowthData(cookieHeader);

  if (!result.success) {
    return (
      <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-sm text-red-600">
        Failed to load user data. Please refresh to try again.
      </div>
    );
  }

  const chartData = result.data.map((ug) => ({
    date: new Date(typeof ug.date === "string" ? ug.date : "").toLocaleDateString(
      undefined,
      { month: "short", day: "numeric" },
    ),
    newUsers: typeof ug.count === "number" ? ug.count : 0,
    cost: 0,
  }));

  return (
    <>
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h3 className="mb-6 text-lg font-semibold text-gray-900">
          Sign-up Trends
        </h3>
        <GrowthChart data={chartData} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Date
              </th>
              <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                New Registrations
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {[...result.data].reverse().map((ug) => {
              const date = typeof ug.date === "string" ? ug.date : "";
              const count = typeof ug.count === "number" ? ug.count : 0;
              return (
                <tr key={date} className="transition-colors hover:bg-gray-50/50">
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {new Date(date).toLocaleDateString(undefined, {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </td>
                  <td className="px-6 py-4 text-right text-sm font-bold text-gray-900">
                    {count} users
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
