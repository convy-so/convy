import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { WorkspaceHub } from "@/features/tutoring/ui/workspace-hub";
import { getStudentMeData } from "@/shared/http/page-data";
import { getDb } from "@/shared/db";
import { studentSessions } from "@/shared/db/schema/learning";
import { and, desc, eq, inArray } from "drizzle-orm";

export default async function StudentDashboardPage() {
    const studentMe = await getStudentMeData();

    const studentIds = studentMe.role === "student" 
        ? studentMe.student.map((s) => s.classroomStudentId) 
        : [];

    const studentSessions = studentIds.length > 0 
        ? await getDb().query.studentSessions.findMany({
            where: and(
                inArray(studentSessions.classroomStudentId, studentIds),
                eq(studentSessions.sessionType, "tutoring"),
            ),
            orderBy: [desc(studentSessions.updatedAt)],
            with: {
                lesson: true,
                classroomStudent: {
                    with: {
                        classroom: true,
                    }
                }
            }
        }) 
        : [];

    // Serialize dates for React Server Components hydration safety
    const serializedSessions = studentSessions.map((s) => ({
        ...s,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
        completedAt: s.completedAt ? s.completedAt.toISOString() : null,
    }));

    return (
        <Suspense fallback={
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
            </div>
        }>
            <WorkspaceHub 
                initialStudentMe={studentMe} 
                initialStudentSessions={serializedSessions}
            />
        </Suspense>
    );
}



