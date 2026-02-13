import { AnalyticsDashboard } from "@/components/analytics/AnalyticsDashboard";
import { ArrowLeft } from "lucide-react";
import { Link, redirect } from "@/i18n/routing";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { surveys } from "@/db/schema";
import { eq } from "drizzle-orm";

interface PageProps {
    params: Promise<{
        surveyId: string;
        locale: string;
    }>;
}

export default async function SurveyAnalyticsPage({ params }: PageProps) {
    const { surveyId, locale } = await params;
    const t = await getTranslations('SurveyAnalytics');

    const [survey] = await db
        .select({ status: surveys.status })
        .from(surveys)
        .where(eq(surveys.id, surveyId));

    if (!survey || survey.status !== "active") {
        redirect({ href: "/dashboard/analytics", locale });
    }

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
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{t('Title')}</h1>
                    <p className="text-gray-500 text-sm">{t('Subtitle')}</p>
                </div>
            </div>
            <AnalyticsDashboard surveyId={surveyId} />
        </div>
    );
}
