import { Suspense } from "react";

import {
  getAdminStats,
  getUserGrowthData,
  getUsageCostData,
  getUsageTypeBreakdown,
} from "@/app/actions/admin";
import { GrowthChart } from "@/features/admin/ui/growth-chart";
import { StatsCard } from "@/features/admin/ui/admin-stats-card";
import { UsageTypeChart } from "@/features/admin/ui/usage-type-chart";

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
          <div className="grid grid-cols-1 gap-6 animate-pulse md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-24 rounded-2xl border border-gray-100 bg-gray-100"
              />
            ))}
          </div>
        }
      >
        <StatsGridSection />
      </Suspense>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm lg:col-span-2">
          <h3 className="mb-6 text-lg font-semibold text-gray-900">
            User Growth &amp; Costs
          </h3>
          <Suspense
            fallback={
              <div className="flex h-80 items-center justify-center rounded-xl bg-gray-50 animate-pulse">
                Loading data...
              </div>
            }
          >
            <GrowthByDateSection />
          </Suspense>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h3 className="mb-6 text-lg font-semibold text-gray-900">
            Usage Breakdown
          </h3>
          <Suspense
            fallback={
              <div className="flex h-80 items-center justify-center rounded-xl bg-gray-50 animate-pulse">
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
      <div className="flex h-80 items-center justify-center text-sm text-gray-400">
        Failed to load growth data.
      </div>
    );
  }

  const data = userGrowthResult.data.map((ug) => {
    const costEntry = usageCostsResult.data.find((c) => c.date === ug.date);
    const costVal =
      costEntry && typeof costEntry.cost === "number" ? costEntry.cost : 0;
    return {
      date: new Date(ug.date).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      newUsers: ug.count,
      cost: parseFloat(costVal.toFixed(2)),
    };
  });

  return <GrowthChart data={data} />;
}

async function UsageBreakdownSection() {
  const result = await getUsageTypeBreakdown();

  if (!result.success) {
    return (
      <div className="flex h-80 items-center justify-center text-sm text-gray-400">
        Failed to load usage breakdown.
      </div>
    );
  }

  const data = result.data.map((b) => ({
    name: (b.type || "unknown").replace("llm_", "").toUpperCase(),
    value: parseFloat(b.totalCost || "0"),
    count: b.count,
  }));

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

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
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
        title="Lessons"
        value={stats.totalLessons.toString()}
        description="Total lessons created"
      />
      <StatsCard
        title="Classrooms"
        value={stats.totalClassrooms.toString()}
        description="Active classroom groups"
      />
      <StatsCard
        title="Active Sessions"
        value={stats.totalStudentSessions.toString()}
        description="Total student sessions"
      />
    </div>
  );
}
