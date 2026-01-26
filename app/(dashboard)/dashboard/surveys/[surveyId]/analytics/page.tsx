import { AnalyticsDashboard } from "@/app/(dashboard)/dashboard/analytics/components/AnalyticsDashboard";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
// Using props type for Next.js page params
interface PageProps {
    params: Promise<{ surveyId: string }>;
}

export default async function SurveyAnalyticsPage({ params }: PageProps) {
    const { surveyId } = await params;

    return (
        <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex items-center gap-4">
                <Link 
                    href="/dashboard/analytics" 
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                    <ArrowLeft className="w-5 h-5 text-gray-500" />
                </Link>
                <div>
                     <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Survey Analysis</h1>
                     <p className="text-gray-500 text-sm">AI-powered insights and metrics</p>
                </div>
            </div>

            <AnalyticsDashboard surveyId={surveyId} />
        </div>
    );
}
