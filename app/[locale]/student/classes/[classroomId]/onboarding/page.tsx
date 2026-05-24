import { getVerifiedSession } from "@/lib/auth/dal";
import { getDb } from "@/db";
import { classroomStudents } from "@/db/schema/learning";
import { and, eq } from "drizzle-orm";
import { redirect, notFound } from "next/navigation";
import { headers } from "next/headers";
import { getOnboardingStateData } from "@/lib/server/app-queries";
import { StudentOnboardingClient } from "./onboarding-client";

interface OnboardingPageProps {
    params: Promise<{ locale: string; classroomId: string }>;
}

export default async function OnboardingPage({ params }: OnboardingPageProps) {
    const { locale, classroomId } = await params;
    const authHeaders = await headers();
    const session = await getVerifiedSession(authHeaders).catch(() => null);
    if (!session) redirect(`/${locale}/sign-in`);

    const userId = session.user.id;

    // Get membership
    const membership = await getDb().query.classroomStudents.findFirst({
        where: and(
            eq(classroomStudents.classroomId, classroomId),
            eq(classroomStudents.userId, userId),
            eq(classroomStudents.inviteStatus, "accepted")
        ),
        with: {
            interestProfile: true,
        }
    });

    if (!membership) {
        notFound();
    }

    // Get onboarding state data
    const onboardingState = await getOnboardingStateData({ session });

    // If onboarding is already completed for this student context, skip onboarding
    const needsOnboarding = !membership.interestProfile;
    if (onboardingState.completed && !needsOnboarding) {
        redirect(`/${locale}/student/classes/${classroomId}/sessions`);
    }

    return (
        <StudentOnboardingClient
            classroomId={classroomId}
            membershipId={membership.id}
            initialOnboardingState={onboardingState}
        />
    );
}
