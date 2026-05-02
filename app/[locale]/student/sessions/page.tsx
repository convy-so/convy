import { getVerifiedSession } from "@/lib/auth/session";
import { getDb } from "@/db";
import { classroomStudents, learningSessions } from "@/db/schema/learning";
import { desc, eq } from "drizzle-orm";
import { BookOpen, Clock, CheckCircle, PlayCircle, Calendar } from "lucide-react";
import { Link } from "@/i18n/routing";

export default async function StudentSessionsPage() {
    const session = await getVerifiedSession();
    const userId = session.user.id;

    const studentProfiles = await getDb().query.classroomStudents.findMany({
        where: eq(classroomStudents.userId, userId),
    });

    const studentIds = studentProfiles.map(s => s.id);

    const sessions = studentIds.length > 0 ? await getDb().query.learningSessions.findMany({
        where: eq(learningSessions.classroomStudentId, studentIds[0]),
        orderBy: [desc(learningSessions.updatedAt)],
        with: {
            topic: true
        }
    }) : [];

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Learning Sessions</h1>
                <p className="text-slate-500 text-lg mt-1">Review your past conversations or resume active ones.</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                {sessions.length > 0 ? (
                    <div className="divide-y divide-slate-100">
                        {sessions.map((lsession) => (
                            <div key={lsession.id} className="p-6 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="flex items-start sm:items-center gap-4">
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                                        lsession.sessionStatus === 'active' ? 'bg-sky-100 text-sky-600' : 'bg-slate-100 text-slate-500'
                                    }`}>
                                        {lsession.sessionStatus === 'active' ? <Clock className="w-6 h-6" /> : <CheckCircle className="w-6 h-6" />}
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-slate-900">
                                            {lsession.topic?.title || "General Tutoring Session"}
                                        </h3>
                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-1 text-sm text-slate-500">
                                            <span className="flex items-center gap-1">
                                                <Calendar className="w-4 h-4" />
                                                {new Date(lsession.createdAt).toLocaleDateString()}
                                            </span>
                                            <span className="flex items-center gap-1.5">
                                                <span className={`inline-block w-2 h-2 rounded-full ${lsession.sessionStatus === 'active' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                                {lsession.sessionStatus.charAt(0).toUpperCase() + lsession.sessionStatus.slice(1)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    {lsession.sessionStatus === 'active' && (
                                        <Link 
                                            href={`/s/${lsession.id}`} 
                                            className="inline-flex w-full sm:w-auto justify-center items-center gap-2 px-5 py-2.5 bg-slate-900 text-white font-medium rounded-xl hover:bg-slate-800 transition-colors"
                                        >
                                            <PlayCircle className="w-4 h-4" />
                                            Resume Session
                                        </Link>
                                    )}
                                    {lsession.sessionStatus === 'completed' && lsession.summary && (
                                        <div className="text-sm text-slate-500 italic max-w-xs truncate hidden lg:block">
                                            &quot;{lsession.summary}&quot;
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="p-16 text-center flex flex-col items-center">
                        <div className="w-20 h-20 rounded-full bg-slate-50 flex items-center justify-center mb-6">
                            <BookOpen className="w-10 h-10 text-slate-300" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 mb-2">No learning sessions yet</h3>
                        <p className="text-slate-500 max-w-sm mx-auto">
                            When your teacher starts a class or assigns a topic, your sessions will appear here.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
