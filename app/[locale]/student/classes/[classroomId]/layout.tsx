import { getDb } from "@/db";
import { classroomStudents } from "@/db/schema/learning";
import { eq, and } from "drizzle-orm";
import { getVerifiedSession } from "@/lib/auth/dal";
import { redirect, notFound } from "next/navigation";
import { headers } from "next/headers";

interface ClassroomLayoutProps {
    children: React.ReactNode;
    params: Promise<{ locale: string; classroomId: string }>;
}

export default async function ClassroomLayout({ children, params }: ClassroomLayoutProps) {
    const { locale, classroomId } = await params;
    const authHeaders = await headers();
    const session = await getVerifiedSession(authHeaders).catch(() => null);
    
    if (!session) redirect(`/${locale}/sign-in`);

    const userId = session.user.id;

    // Verify student is actually enrolled in this classroom
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

    // Pass-through without visual wrappers so full-screen components like lessons can escape
    return <>{children}</>;
}
