import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { LearningHub } from "@/components/learning/learning-hub";
import { getLearningMeData } from "@/lib/server/app-queries";
import { getDb } from "@/db";
import { learningSessions } from "@/db/schema/learning";
import { inArray, desc } from "drizzle-orm";

export default async function StudentDashboardPage() {
    const learningMe = await getLearningMeData();

    const studentIds = learningMe.role === "student" 
        ? learningMe.student.map((s) => s.classroomStudentId) 
        : [];

    const studentSessions = studentIds.length > 0 
        ? await getDb().query.learningSessions.findMany({
            where: inArray(learningSessions.classroomStudentId, studentIds),
            orderBy: [desc(learningSessions.updatedAt)],
            with: {
                topic: true,
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
            <LearningHub 
                initialLearningMe={learningMe} 
                initialStudentSessions={serializedSessions}
            />
        </Suspense>
    );
}
