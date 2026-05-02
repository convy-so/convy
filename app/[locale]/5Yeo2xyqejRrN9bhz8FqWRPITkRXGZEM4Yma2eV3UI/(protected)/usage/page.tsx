import { getUsageCostData, getUsageTypeBreakdown } from "@/app/actions/admin";
import { UsageTypeChart } from "@/components/admin/usage-type-chart";
import { GrowthChart } from "@/components/admin/growth-chart";
import { Suspense } from "react";
import { headers } from "next/headers";



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

    const usageCosts = usageCostsResult.data;
    const breakdown = breakdownResult.data;

    const chartData = usageCosts.map(c => {
        const date = typeof c.date === "string" ? c.date : "";
        const cost = typeof c.cost === "number" ? c.cost : 0;
        return {
            date: new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
            newUsers: 0, // Not needed here but chart expects it
            cost: parseFloat(cost.toFixed(2))
        };
    });

    const pieData = breakdown.map(b => {
        const typeStr = typeof b.type === "string" ? b.type : "unknown";
        const costStr = typeof b.totalCost === "string" ? b.totalCost : "0";
        const count = typeof b.count === "number" ? b.count : 0;
        return {
            name: typeStr.replace('llm_', '').toUpperCase(),
            value: parseFloat(costStr),
            count: count
        };
    });

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Usage & Costs</h1>
                <p className="text-gray-500">Detailed breakdown of platform API expenses.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                    <h3 className="text-lg font-semibold text-gray-900 mb-6">Daily Spending</h3>
                    <GrowthChart data={chartData} />
                </div>
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                    <h3 className="text-lg font-semibold text-gray-900 mb-6">Cost by Service Type</h3>
                    <UsageTypeChart data={pieData} />
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Service Type</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Calls</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Total Cost</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {breakdown.map((b) => {
                            const typeStr = typeof b.type === "string" ? b.type : "unknown";
                            const count = typeof b.count === "number" ? b.count : 0;
                            const costStr = typeof b.totalCost === "string" ? b.totalCost : "0";
                            return (
                                <tr key={typeStr} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="px-6 py-4 text-sm font-medium text-gray-900 capitalize">{typeStr.replace('_', ' ')}</td>
                                    <td className="px-6 py-4 text-sm text-gray-600">{count}</td>
                                    <td className="px-6 py-4 text-sm text-gray-900 font-bold text-right">${parseFloat(costStr).toFixed(4)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default async function AdminUsagePage({ params }: { params: Promise<{ locale: string }> }) {
    await params;
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center p-12">
                <div className="w-8 h-8 border-4 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
            </div>
        }>
            <UsageDashboardWrapper />
        </Suspense>
    );
}

async function UsageDashboardWrapper() {
    const cookieHeader = (await headers()).get("cookie");
    return <UsageDashboard cookieHeader={cookieHeader} />;
}
