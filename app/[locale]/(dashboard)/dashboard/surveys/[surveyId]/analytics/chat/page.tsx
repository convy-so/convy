import { ChatWithData } from "@/components/analytics/ChatWithData";
import { ArrowLeft, MessageSquare, Loader2 } from "lucide-react";
import { Link, redirect } from "@/i18n/routing";
import { T } from "@/components/i18n/t";
import { getDb } from "@/db";
import { surveys } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Suspense } from "react";
import { getVerifiedSession } from "@/lib/auth/session";
import { getSurveyPermissionContext } from "@/lib/workspace-access";

interface PageProps {
    params: Promise<{
        surveyId: string;
        locale: string;
    }>;
}

async function SurveyChatContent({ surveyId, locale }: { surveyId: string; locale: string }) {
    const session = await getVerifiedSession();
    const permission = await getSurveyPermissionContext(session.user.id, surveyId, {
        activeWorkspaceId: session.session.activeOrganizationId ?? null,
    });
    if (!permission?.canView || !permission.activeContextMatchesResource) {
        redirect({ href: "/dashboard/analytics", locale });
    }

    const db = getDb();
    const [survey] = await db
        .select({ status: surveys.status, title: surveys.title })
        .from(surveys)
        .where(eq(surveys.id, surveyId));

    if (!survey || survey.status !== "active") {
        redirect({ href: "/dashboard/analytics", locale });
    }

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 h-[calc(100vh-64px)] flex flex-col">
            {/* Header - Visible Immediately */}
            <div className="flex items-center justify-between mb-8 flex-shrink-0">
                <div className="flex items-center gap-4">
                    <Link
                        href={`/dashboard/surveys/${surveyId}/analytics`}
                        className="p-3 bg-white border border-gray-100 hover:bg-gray-100 rounded-2xl transition-all shadow-sm group"
                    >
                        <ArrowLeft className="w-5 h-5 text-gray-500 group-hover:-translate-x-1 transition-transform" />
                    </Link>
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <MessageSquare className="w-4 h-4 text-gray-400" />
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none">
                                <T>Data Assistant</T>
                            </span>
                        </div>
                        <h1 className="text-2xl font-black text-gray-900 tracking-tight leading-none">
                            <T>Intelligence Chat</T>
                        </h1>
                    </div>
                </div>
            </div>

            <div className="flex-1 min-h-0 bg-white rounded-[2.5rem] border border-gray-100/50 shadow-2xl shadow-gray-200/50 overflow-hidden">
                <ChatWithData surveyId={surveyId} />
            </div>
        </div>
    );
}

export default async function SurveyChatPage({ params }: PageProps) {
    const { surveyId, locale } = await params;

    return (
        <Suspense fallback={
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 h-[calc(100vh-64px)] flex flex-col">
                <div className="flex items-center justify-between mb-8 flex-shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="w-11 h-11 bg-gray-100 rounded-2xl animate-pulse" />
                        <div>
                            <div className="w-24 h-3 bg-gray-100 rounded mb-2 animate-pulse" />
                            <div className="w-48 h-8 bg-gray-100 rounded animate-pulse" />
                        </div>
                    </div>
                </div>
                <div className="flex-1 min-h-0 bg-white rounded-[2.5rem] border border-gray-100/50 shadow-2xl shadow-gray-200/50 overflow-hidden flex flex-col items-center justify-center bg-gray-50/30">
                    <Loader2 className="w-8 h-8 animate-spin text-gray-900 mb-4" />
                    <p className="text-sm text-gray-400 font-medium tracking-wide">
                        <T>Initializing Data Assistant...</T>
                    </p>
                </div>
            </div>
        }>
            <SurveyChatContent surveyId={surveyId} locale={locale} />
        </Suspense>
    );
}
