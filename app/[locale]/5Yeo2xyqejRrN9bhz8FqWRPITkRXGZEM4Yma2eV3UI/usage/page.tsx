import { Suspense } from "react";
import { headers } from "next/headers";

import { getUsageCostData, getUsageTypeBreakdown } from "@/app/actions/admin";
import { GrowthChart } from "@/components/admin/growth-chart";
import { UsageTypeChart } from "@/components/admin/usage-type-chart";

async function UsageDashboard({ cookieHeader }: { cookieHeader: string | null }) {
  const [usageCostsResult, breakdownResult] = await Promise.all([
    getUsageCostData(cookieHeader),
    getUsageTypeBreakdown(cookieHeader),
  ]);

  if (!usageCostsResult.success || !breakdownResult.success) {
    return (
      <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-sm text-red-600">
        Failed to load usage data. Please refresh to try again.
      </div>
    );
  }

  const chartData = usageCostsResult.data.map((c) => ({
    date: new Date(typeof c.date === "string" ? c.date : "").toLocaleDateString(
      undefined,
      { month: "short", day: "numeric" },
    ),
    newUsers: 0,
    cost: parseFloat((typeof c.cost === "number" ? c.cost : 0).toFixed(2)),
  }));

  const pieData = breakdownResult.data.map((b) => ({
    name: (typeof b.type === "string" ? b.type : "unknown")
      .replace("llm_", "")
      .toUpperCase(),
    value: parseFloat(typeof b.totalCost === "string" ? b.totalCost : "0"),
    count: typeof b.count === "number" ? b.count : 0,
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Usage & Costs</h1>
        <p className="text-gray-500">
          Detailed breakdown of platform API expenses.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h3 className="mb-6 text-lg font-semibold text-gray-900">
            Daily Spending
          </h3>
          <GrowthChart data={chartData} />
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h3 className="mb-6 text-lg font-semibold text-gray-900">
            Cost by Service Type
          </h3>
          <UsageTypeChart data={pieData} />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Service Type
              </th>
              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Total Calls
              </th>
              <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                Total Cost
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {breakdownResult.data.map((b) => {
              const typeStr = typeof b.type === "string" ? b.type : "unknown";
              const count = typeof b.count === "number" ? b.count : 0;
              const costStr =
                typeof b.totalCost === "string" ? b.totalCost : "0";
              return (
                <tr
                  key={typeStr}
                  className="transition-colors hover:bg-gray-50/50"
                >
                  <td className="px-6 py-4 text-sm font-medium capitalize text-gray-900">
                    {typeStr.replace("_", " ")}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{count}</td>
                  <td className="px-6 py-4 text-right text-sm font-bold text-gray-900">
                    ${parseFloat(costStr).toFixed(4)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function AdminUsagePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  await params;
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center p-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-gray-900" />
        </div>
      }
    >
      <UsageDashboardWrapper />
    </Suspense>
  );
}

async function UsageDashboardWrapper() {
  const cookieHeader = (await headers()).get("cookie");
  return <UsageDashboard cookieHeader={cookieHeader} />;
}
