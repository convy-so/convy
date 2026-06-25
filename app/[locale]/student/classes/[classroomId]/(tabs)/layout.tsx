import { getDb } from "@/shared/db";
import { classroomStudents } from "@/shared/db/schema/learning";
import { eq, and } from "drizzle-orm";
import { getVerifiedSession } from "@/features/auth/public-server";
import { redirect, notFound } from "next/navigation";
import { Link } from "@/i18n/routing";
import { GraduationCap, ArrowLeft, BookOpen, BarChart3 } from "lucide-react";
import { headers } from "next/headers";
import { ActiveTabLink } from "../active-tab-link";

interface TabsLayoutProps {
    children: React.ReactNode;
    params: Promise<{ locale: string; classroomId: string }>;
}

export default async function TabsLayout({ children, params }: TabsLayoutProps) {
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
        with: {
            classroom: true,
        }
    });

    if (!membership) {
        notFound();
    }

    const classroom = membership.classroom;

    return (
        <div className="space-y-8 max-w-7xl mx-auto">
            {/* Back to courses */}
            <div>
                <Link 
                    href="/student/classes" 
                    className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-800 transition-colors"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to my classes
                </Link>
            </div>

            {/* Header Section */}
            <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <div className="h-14 w-14 shrink-0 flex items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-md shadow-indigo-100">
                        <GraduationCap className="h-7 w-7" />
                    </div>
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                            {classroom.title}
                        </h1>
                        <div className="flex items-center gap-3 mt-1.5 text-slate-500 font-semibold text-sm">
                            <span>{classroom.gradeLabel}</span>
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                            <span>Enrolled Student</span>
                        </div>
                    </div>
                </div>

            </div>

            {/* Subpages Navigation */}
            <div className="border-b border-slate-200">
                <div className="flex gap-8">
                    <TabLink 
                        href={`/student/classes/${classroomId}/lessons`}
                        icon={<BookOpen className="h-4.5 w-4.5" />}
                        label="Lessons"
                    />
                    <TabLink 
                        href={`/student/classes/${classroomId}/progress`}
                        icon={<BarChart3 className="h-4.5 w-4.5" />}
                        label="Progress & Analytics"
                    />
                </div>
            </div>

            {/* Subpage Content */}
            <div className="pt-2">
                {children}
            </div>
        </div>
    );
}

function TabLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
    return <ActiveTabLink href={href} icon={icon} label={label} />;
}
