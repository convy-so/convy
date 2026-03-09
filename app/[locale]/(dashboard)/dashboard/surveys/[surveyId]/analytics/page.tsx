import { GenerativeSummary } from "@/components/analytics/GenerativeSummary";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Link, redirect } from "@/i18n/routing";
import { T } from "@/components/i18n/t";
import { getDb } from "@/db";
import { surveys } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Suspense } from "react";

interface PageProps {
    params: Promise<{
        surveyId: string;
        locale: string;
    }>;
}

async function SurveyAnalyticsContent({ surveyId, locale }: { surveyId: string; locale: string }) {
    const db = getDb();
    const [survey] = await db
        .select({ status: surveys.status, title: surveys.title })
        .from(surveys)
        .where(eq(surveys.id, surveyId));

    if (!survey || survey.status !== "active") {
        redirect({ href: "/dashboard/analytics", locale });
    }

    return (
        <GenerativeSummary surveyId={surveyId} surveyTitle={survey.title} />
    );
}

export default async function SurveyAnalyticsPage({ params }: PageProps) {
    const { surveyId, locale } = await params;

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
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight"><T>Survey Analytics</T></h1>
                    <p className="text-gray-500 text-sm"><T>Explore insights and trends from your survey responses.</T></p>
                </div>
            </div>
            <Suspense fallback={
                <div className="flex flex-col items-center justify-center min-h-[400px] text-gray-400">
                    <Loader2 className="w-8 h-8 animate-spin mb-4 text-gray-900" />
                    <p className="text-sm"><T>Loading summary...</T></p>
                </div>
            }>
                <SurveyAnalyticsContent surveyId={surveyId} locale={locale} />
            </Suspense>
        </div>
    );
}
