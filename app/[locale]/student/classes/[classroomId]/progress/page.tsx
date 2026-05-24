import { getVerifiedSession } from "@/lib/auth/dal";
import { getDb } from "@/db";
import { classroomStudents, studentProgressReports, studentModels, studentModelSnapshots } from "@/db/schema/learning";
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
            topic: true
        }
    });

    // Get student model and latest snapshot
    const models = await getDb().query.studentModels.findMany({
        where: eq(studentModels.classroomStudentId, membership.id),
        limit: 1
    });

    const studentModelId = models[0]?.id;

    const snapshots = studentModelId ? await getDb().query.studentModelSnapshots.findMany({
        where: eq(studentModelSnapshots.studentModelId, studentModelId),
        orderBy: [desc(studentModelSnapshots.version)],
        limit: 1
    }) : [];

    const latestModel = snapshots[0]?.snapshot ?? null;

    return (
        <ClassroomProgressClient 
            latestModel={latestModel} 
            progressReports={progressReports} 
        />
    );
}
