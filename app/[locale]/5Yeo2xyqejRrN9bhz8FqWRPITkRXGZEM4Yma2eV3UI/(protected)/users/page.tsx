import { Suspense } from "react";
import { headers } from "next/headers";
import { Loader2 } from "lucide-react";
import { getUserGrowthData } from "@/app/actions/admin";
import { GrowthChart } from "@/components/admin/growth-chart";

export default async function AdminUsersPage({ params }: { params: Promise<{ locale: string }> }) {
    await params;
    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">User Growth</h1>
                <p className="text-gray-500">Tracking user acquisition and engagement trends.</p>
            </div>

            <Suspense fallback={
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-center min-h-[400px]">
                    <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                </div>
            }>
                <AdminUsersContent />
            </Suspense>
        </div>
    );
}

async function AdminUsersContent() {
    const cookieHeader = (await headers()).get("cookie");
    const userGrowth = await getUserGrowthData(cookieHeader);

    const chartData = userGrowth.map((ug) => {
        const date = typeof ug.date === "string" ? ug.date : "";
        const count = typeof ug.count === "number" ? ug.count : 0;
        return {
            date: new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
            newUsers: count,
            cost: 0 // Not needed here
        };
    });

    return (
        <>
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-900 mb-6">Sign-up Trends</h3>
                <GrowthChart data={chartData} />
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">New Registrations</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {[...userGrowth].reverse().map((ug) => {
                            const date = typeof ug.date === "string" ? ug.date : "";
                            const count = typeof ug.count === "number" ? ug.count : 0;
                            return (
                                <tr key={date} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="px-6 py-4 text-sm text-gray-600">{new Date(date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</td>
                                    <td className="px-6 py-4 text-sm text-gray-900 font-bold text-right">{count} users</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </>
    );
}
