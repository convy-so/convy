import { Suspense } from "react";
import {
  getAdminStats,
  getUserGrowthData,
  getUsageCostData,
  getUsageTypeBreakdown,
} from "@/app/actions/admin";
import { StatsCard } from "@/components/admin/stats-card";
import { GrowthChart } from "@/components/admin/growth-chart";
import { UsageTypeChart } from "@/components/admin/usage-type-chart";

export default async function AdminOverviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  await params;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Platform Overview</h1>
        <p className="text-gray-500">
          Real-time monitoring of costs and user engagement.
        </p>
      </div>

      <Suspense
        fallback={
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-pulse">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-24 bg-gray-100 rounded-2xl border border-gray-100"
              />
            ))}
          </div>
        }
      >
        <StatsGridSection />
      </Suspense>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">
            User Growth &amp; Costs
          </h3>
          <Suspense
            fallback={
              <div className="h-80 flex items-center justify-center bg-gray-50 rounded-xl animate-pulse">
                Loading data...
              </div>
            }
          >
            <GrowthByDateSection />
          </Suspense>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">
            Usage Breakdown
          </h3>
          <Suspense
            fallback={
              <div className="h-80 flex items-center justify-center bg-gray-50 rounded-xl animate-pulse">
                Loading data...
              </div>
            }
          >
            <UsageBreakdownSection />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

async function GrowthByDateSection() {
  let userGrowth: { date: unknown; count: unknown }[] = [];
  let usageCosts: { date: unknown; cost: unknown }[] = [];

  try {
    [userGrowth, usageCosts] = await Promise.all([
      getUserGrowthData() as Promise<{ date: unknown; count: unknown }[]>,
      getUsageCostData() as Promise<{ date: unknown; cost: unknown }[]>,
    ]);
  } catch (error) {
    console.error("[AdminOverview] GrowthByDateSection failed:", error);
    return (
      <div className="h-80 flex items-center justify-center text-sm text-gray-400">
        Failed to load growth data.
      </div>
    );
  }

  const data = userGrowth.map((ug) => {
    const ugDate = typeof ug.date === "string" ? ug.date : "";
    const count = typeof ug.count === "number" ? ug.count : 0;
    const costEntry = usageCosts.find((c) => c.date === ugDate);
    const costVal =
      costEntry && typeof costEntry.cost === "number" ? costEntry.cost : 0;
    return {
      date: new Date(ugDate).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      newUsers: count,
      cost: parseFloat(costVal.toFixed(2)),
    };
  });

  return <GrowthChart data={data} />;
}

async function UsageBreakdownSection() {
  let breakdown: { type: unknown; totalCost: unknown; count: unknown }[] = [];

  try {
    breakdown = await getUsageTypeBreakdown() as typeof breakdown;
  } catch (error) {
    console.error("[AdminOverview] UsageBreakdownSection failed:", error);
    return (
      <div className="h-80 flex items-center justify-center text-sm text-gray-400">
        Failed to load usage breakdown.
      </div>
    );
  }

  const data = breakdown.map((b) => {
    const typeStr = typeof b.type === "string" ? b.type : "unknown";
    const costStr = typeof b.totalCost === "string" ? b.totalCost : "0";
    const itemCount = typeof b.count === "number" ? b.count : 0;
    return {
      name: typeStr.replace("llm_", "").toUpperCase(),
      value: parseFloat(costStr),
      count: itemCount,
    };
  });

  return <UsageTypeChart data={data} />;
}

async function StatsGridSection() {
  type AdminStats = {
    totalUsageCost: string;
    totalUsers: number;
    newUsersLast30Days: number;
    totalSurveys: number;
    activeSessions: number;
  };
  let stats: AdminStats | null = null;

  try {
    stats = (await getAdminStats()) as AdminStats;
  } catch (error) {
    console.error("[AdminOverview] StatsGridSection failed:", error);
    return (
      <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">
        Failed to load platform statistics. Please refresh to try again.
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <StatsCard
        title="Total Usage Cost"
        value={`$${parseFloat(stats.totalUsageCost).toFixed(2)}`}
        description="Accumulated LLM/Software costs"
        trend="up"
      />
      <StatsCard
        title="Total Users"
        value={stats.totalUsers.toString()}
        description={`${stats.newUsersLast30Days} new in last 30 days`}
      />
      <StatsCard
        title="Active Surveys"
        value={stats.totalSurveys.toString()}
        description="Total surveys created"
      />
      <StatsCard
        title="Active Sessions"
        value={stats.activeSessions.toString()}
        description="Currently authenticated users"
      />
    </div>
  );
}
