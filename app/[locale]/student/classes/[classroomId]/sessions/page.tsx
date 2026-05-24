import { getVerifiedSession } from "@/lib/auth/dal";
import { getDb } from "@/db";
import { classroomStudents, learningSessions, learningTopics } from "@/db/schema/learning";
import { and, eq, desc } from "drizzle-orm";
import { BookOpen, Clock, CheckCircle2, PlayCircle, PlusCircle, ArrowRight } from "lucide-react";
import { Link } from "@/i18n/routing";
import { redirect, notFound } from "next/navigation";
import { headers } from "next/headers";

interface ClassroomSessionsProps {
    params: Promise<{ locale: string; classroomId: string }>;
}

export default async function ClassroomSessionsPage({ params }: ClassroomSessionsProps) {
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

    // Get active topics in this classroom
    const topics = await getDb().query.learningTopics.findMany({
        where: and(
            eq(learningTopics.classroomId, classroomId),
            eq(learningTopics.status, "active")
        ),
        orderBy: [desc(learningTopics.createdAt)]
    });

    // Get student sessions for this membership
    const dbSessions = await getDb().query.learningSessions.findMany({
        where: eq(learningSessions.classroomStudentId, membership.id),
        orderBy: [desc(learningSessions.updatedAt)],
        with: {
            topic: true,
        }
    });

    // Grouping
    const inProgressSessions = dbSessions.filter((s) => s.sessionStatus === "active");
    const completedSessions = dbSessions.filter((s) => s.sessionStatus === "completed");

    const notStartedTopics = topics.filter(
        (topic) => !dbSessions.some((s) => s.topicId === topic.id)
    );

    return (
        <div className="space-y-10 pb-16">
            {/* 1. In Progress Sessions */}
            {inProgressSessions.length > 0 && (
                <div className="space-y-4">
                    <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        In Progress Sessions
                    </h2>
                    <div className="grid gap-4 md:grid-cols-2">
                        {inProgressSessions.map((s) => (
                            <div 
                                key={s.id} 
                                className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col justify-between hover:border-slate-300 shadow-sm transition-all"
                            >
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg w-fit">
                                        <Clock className="h-3.5 w-3.5" />
                                        Active Now
                                    </div>
                                    <h3 className="text-lg font-extrabold text-slate-900">
                                        {s.topic?.title || "General Workspace Session"}
                                    </h3>
                                    <p className="text-slate-500 text-sm line-clamp-2">
                                        {s.topic?.description || "Pick up where you left off with your personalized AI tutor."}
                                    </p>
                                </div>
                                
                                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                                    <span className="text-xs font-semibold text-slate-400">
                                        Last active: {new Date(s.updatedAt).toLocaleDateString()}
                                    </span>
                                    <Link
                                        href={`/student/classes/${classroomId}/sessions/active?topicId=${s.topicId}`}
                                        className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-100 transition-all hover:scale-105"
                                    >
                                        <PlayCircle className="h-4 w-4" />
                                        Resume
                                    </Link>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 2. Not Started Topics */}
            <div className="space-y-4">
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-indigo-500" />
                    Available Topics
                </h2>
                {notStartedTopics.length > 0 ? (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {notStartedTopics.map((topic) => (
                            <div 
                                key={topic.id} 
                                className="bg-white rounded-2xl border border-slate-100 p-6 flex flex-col justify-between hover:shadow-lg hover:border-slate-200 transition-all duration-300"
                            >
                                <div className="space-y-3">
                                    <div className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                        Available
                                    </div>
                                    <h3 className="text-md font-bold text-slate-800 line-clamp-1">
                                        {topic.title}
                                    </h3>
                                    <p className="text-slate-500 text-xs line-clamp-3 leading-relaxed">
                                        {topic.description || "Start this lesson to investigate the core concepts with custom AI tutoring support."}
                                    </p>
                                </div>

                                <div className="mt-6 pt-4 border-t border-slate-50 flex justify-end">
                                    <Link
                                        href={`/student/classes/${classroomId}/sessions/active?topicId=${topic.id}`}
                                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-md transition-colors"
                                    >
                                        <PlusCircle className="h-3.5 w-3.5" />
                                        Start Learning
                                    </Link>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    inProgressSessions.length === 0 && (
                        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center shadow-sm">
                            <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-4">
                                <BookOpen className="h-8 w-8 text-indigo-500" />
                            </div>
                            <h3 className="text-lg font-bold text-slate-900 mb-1">No new topics</h3>
                            <p className="text-slate-500 max-w-sm mx-auto text-sm">
                                You have started or completed all available classroom topics!
                            </p>
                        </div>
                    )
                )}
            </div>

            {/* 3. Completed Sessions */}
            <div className="space-y-4">
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-slate-400" />
                    Completed Sessions
                </h2>
                {completedSessions.length > 0 ? (
                    <div className="bg-white rounded-2xl border border-slate-100 divide-y divide-slate-50 overflow-hidden shadow-sm">
                        {completedSessions.map((s) => (
                            <div 
                                key={s.id} 
                                className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="h-10 w-10 shrink-0 flex items-center justify-center bg-slate-100 text-slate-500 rounded-xl">
                                        <CheckCircle2 className="h-5.5 w-5.5" />
                                    </div>
                                    <div>
                                        <h3 className="font-extrabold text-slate-900">
                                            {s.topic?.title || "Topic check-in"}
                                        </h3>
                                        <p className="text-xs font-semibold text-slate-400 mt-0.5">
                                            Completed on {new Date(s.completedAt || s.updatedAt).toLocaleDateString()}
                                        </p>
                                    </div>
                                </div>
                                
                                <Link
                                    href={`/student/classes/${classroomId}/progress`}
                                    className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
                                >
                                    View Report
                                    <ArrowRight className="h-3.5 w-3.5" />
                                </Link>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center text-slate-400 text-sm font-semibold py-12">
                        Complete your first active session to see progress reports here.
                    </div>
                )}
            </div>
        </div>
    );
}
