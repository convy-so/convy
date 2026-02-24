import { getSurveysForFeedback } from "@/app/actions/admin";
import { Link } from "@/i18n/routing";
import { format } from "date-fns";
import {
    MessageSquare,
    User as UserIcon,
    Calendar,
    CheckCircle2,
    Circle,
    ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils";

export default async function AdminSurveysPage() {
    const surveys = await getSurveysForFeedback();

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Survey Expert Review</h1>
                <p className="text-gray-500">Review created surveys and provide feedback for improvement.</p>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100">
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Survey</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Creator</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Created</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Feedback</th>
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
                                            <span className="text-sm text-gray-600">{(survey as any).user?.name || "Unknown"}</span>
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
                                    <td className="px-6 py-4">
                                        {survey.improvementFeedback ? (
                                            <div className="flex items-center gap-1.5 text-emerald-600">
                                                <CheckCircle2 className="w-4 h-4" />
                                                <span className="text-xs font-medium">Reviewed</span>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1.5 text-gray-400">
                                                <Circle className="w-4 h-4" />
                                                <span className="text-xs">Pending</span>
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <Link
                                            href={`/admin/surveys/${survey.id}`}
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

                {surveys.length === 0 && (
                    <div className="p-12 text-center text-gray-500">
                        No surveys found.
                    </div>
                )}
            </div>
        </div>
    );
}
