import { getSurveysForFeedback } from "@/app/actions/admin";
import { Link } from "@/i18n/routing";
import { format } from "date-fns";
import {
    MessageSquare,
    User as UserIcon,
    Calendar,
    ChevronRight,
    Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Suspense } from "react";
import { headers } from "next/headers";


export default async function AdminSurveysPage({ params }: { params: Promise<{ locale: string }> }) {
    await params;
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Survey Expert Review</h1>
                <p className="text-gray-500">Review created surveys and inspect their canonical research setup.</p>
            </div>

            <Suspense
                fallback={
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 flex flex-col items-center justify-center">
                        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-4" />
                        <p className="text-gray-500 text-sm">Loading surveys for review...</p>
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
    const surveys = await getSurveysForFeedback(cookieHeader);

    if (surveys.length === 0) {
        return (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-gray-500">
                No surveys found.
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Survey</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Creator</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Created</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {surveys.map((survey) => (
                            <tr key={survey.id} className="hover:bg-gray-50/50 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                                            <MessageSquare className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-gray-900 line-clamp-1">{survey.title || "Untitled Survey"}</p>
                                            <p className="text-xs text-gray-500 line-clamp-1">{survey.id}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-2">
                                        <UserIcon className="w-3 h-3 text-gray-400" />
                                        <span className="text-sm text-gray-600">{survey.user?.name || "Unknown"}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className={cn(
                                        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize",
                                        survey.status === "active" ? "bg-emerald-50 text-emerald-700" :
                                            survey.status === "creating" ? "bg-amber-50 text-amber-700" :
                                                "bg-gray-100 text-gray-700"
                                    )}>
                                        {survey.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-2 text-xs text-gray-500">
                                        <Calendar className="w-3 h-3" />
                                        {format(new Date(survey.createdAt), "MMM d, yyyy")}
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <Link
                                        href={`/5Yeo2xyqejRrN9bhz8FqWRPITkRXGZEM4Yma2eV3UI/surveys/${survey.id}`}
                                        className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
                                    >
                                        Review
                                        <ChevronRight className="w-4 h-4" />
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
