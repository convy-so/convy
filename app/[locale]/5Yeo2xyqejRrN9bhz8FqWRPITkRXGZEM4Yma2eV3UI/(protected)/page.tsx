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
  const [userGrowthResult, usageCostsResult] = await Promise.all([
    getUserGrowthData(),
    getUsageCostData(),
  ]);

  if (!userGrowthResult.success || !usageCostsResult.success) {
    return (
      <div className="h-80 flex items-center justify-center text-sm text-gray-400">
        Failed to load growth data.
      </div>
    );
  }

  const userGrowth = userGrowthResult.data;
  const usageCosts = usageCostsResult.data;

  const data = userGrowth.map((ug) => {
    const ugDate = ug.date;
    const count = ug.count;
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
  const result = await getUsageTypeBreakdown();

  if (!result.success) {
    return (
      <div className="h-80 flex items-center justify-center text-sm text-gray-400">
        Failed to load usage breakdown.
      </div>
    );
  }

  const data = result.data.map((b) => {
    const typeStr = b.type || "unknown";
    const costStr = b.totalCost || "0";
    const itemCount = b.count;
    return {
      name: typeStr.replace("llm_", "").toUpperCase(),
      value: parseFloat(costStr),
      count: itemCount,
    };
  });

  return <UsageTypeChart data={data} />;
}

async function StatsGridSection() {
  const result = await getAdminStats();

  if (!result.success) {
    return (
      <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">
        Failed to load platform statistics. Please refresh to try again.
      </div>
    );
  }

  const stats = result.data;

  if (!stats) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
        title="Total Surveys"
        value={stats.totalSurveys.toString()}
        description="Surveys across all users"
      />
      <StatsCard
        title="Learning Topics"
        value={stats.totalTopics.toString()}
        description="Total topics created"
      />
      <StatsCard
        title="Classrooms"
        value={stats.totalClassrooms.toString()}
        description="Active classroom groups"
      />
      <StatsCard
        title="Active Sessions"
        value={stats.totalLearningSessions.toString()}
        description="Total student learning sessions"
      />
    </div>
  );
}
