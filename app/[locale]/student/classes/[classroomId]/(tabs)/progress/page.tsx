import { getVerifiedSession } from "@/features/auth/public-server";
import { getDb } from "@/shared/db";
import { classroomStudents, studentLessonReports } from "@/shared/db/schema/tutoring";
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
    const progressReports = await getDb().query.studentLessonReports.findMany({
        where: eq(studentLessonReports.classroomStudentId, membership.id),
        orderBy: [desc(studentLessonReports.createdAt)],
        with: {
            lesson: {
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
                lessonId: report.lessonId,
                masteryPercent: report.masteryPercent,
                createdAt: report.createdAt,
                lesson: report.lesson
                    ? {
                        title: report.lesson.title,
                        courseTitle: report.lesson.course?.title ?? null,
                    }
                    : null,
                report: report.report,
            }))} 
        />
    );
}


