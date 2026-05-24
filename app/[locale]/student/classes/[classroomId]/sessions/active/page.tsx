import { getVerifiedSession } from "@/lib/auth/dal";
import { getStudentLearningWorkspaceInitialData } from "@/lib/server/app-queries";
import { LiveSessionClient } from "./live-session-client";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

interface ActiveSessionPageProps {
    params: Promise<{ locale: string; classroomId: string }>;
    searchParams: Promise<{ topicId?: string }>;
}

export default async function ActiveSessionPage({ params, searchParams }: ActiveSessionPageProps) {
    const { locale, classroomId } = await params;
    const { topicId } = await searchParams;
    const authHeaders = await headers();
    const session = await getVerifiedSession(authHeaders).catch(() => null);
    if (!session) redirect(`/${locale}/sign-in`);

    if (!topicId) {
        redirect(`/${locale}/student/classes/${classroomId}/sessions`);
    }

    const {
        learningMe,
        initialPatterns,
        initialOnboardingState,
        initialTutoringSession
    } = await getStudentLearningWorkspaceInitialData({
        classroomId,
        language: locale
    });

    return (
        <LiveSessionClient
            classroomId={classroomId}
            learningMe={learningMe}
            initialPatterns={initialPatterns?.data}
            initialOnboardingState={initialOnboardingState}
            initialTutoringSession={initialTutoringSession}
        />
    );
}
