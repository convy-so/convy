import { getVerifiedSession } from "@/features/auth/public-server";
import { getDb } from "@/shared/db";
import { classroomStudents, studentProgressReports } from "@/shared/db/schema/learning";
import { and, eq, desc } from "drizzle-orm";
import { redirect, notFound } from "next/navigation";
import { headers } from "next/headers";
import { ClassroomProgressClient } from "./classroom-progress-client";

interface ClassroomProgressProps {
    params: Promise<{ locale: string; classroomId: string }>;
}

export default async function ClassroomProgressPage({ params }: ClassroomProgressProps) {
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
    });

    if (!membership) {
        notFound();
    }

    // Get progress reports
    const progressReports = await getDb().query.studentProgressReports.findMany({
        where: eq(studentProgressReports.classroomStudentId, membership.id),
        orderBy: [desc(studentProgressReports.createdAt)],
        with: {
            topic: {
                with: {
                    course: true,
                },
            }
        }
    });

    const latestReport = progressReports[0] ?? null;
    const latestModel = latestReport?.report
        ? {
            knowledgeStateModel: latestReport.report.conceptProgress ?? [],
        }
        : null;

    return (
        <ClassroomProgressClient 
            latestModel={latestModel} 
            progressReports={progressReports.map((report) => ({
                id: report.id,
                topicId: report.topicId,
                masteryPercent: report.masteryPercent,
                createdAt: report.createdAt,
                topic: report.topic
                    ? {
                        title: report.topic.title,
                        courseTitle: report.topic.course?.title ?? null,
                    }
                    : null,
                report: report.report,
            }))} 
        />
    );
}
