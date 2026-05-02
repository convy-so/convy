import { getVerifiedSession } from "@/lib/auth/session";
import { getDb } from "@/db";
import { classroomStudents, learningSessions, studentProgressReports } from "@/db/schema/learning";
import { and, desc, eq } from "drizzle-orm";
import { GraduationCap, TrendingUp, BookOpen, Clock, PlayCircle } from "lucide-react";
import { Link } from "@/i18n/routing";

export default async function StudentDashboardPage() {
    const session = await getVerifiedSession();
    const userId = session.user.id;

    // Find student profiles for this user
    const studentProfiles = await getDb().query.classroomStudents.findMany({
        where: eq(classroomStudents.userId, userId),
        with: {
            classroom: true
        }
    });

    const studentIds = studentProfiles.map(s => s.id);

    // Fetch recent active or completed sessions
    const recentSessions = studentIds.length > 0 ? await getDb().query.learningSessions.findMany({
        where: eq(learningSessions.classroomStudentId, studentIds[0]), // Assuming single primary student profile for now
        orderBy: [desc(learningSessions.updatedAt)],
        limit: 5,
        with: {
            topic: true
        }
    }) : [];

    // Fetch latest progress reports to calculate avg mastery
    const progressReports = studentIds.length > 0 ? await getDb().query.studentProgressReports.findMany({
        where: eq(studentProgressReports.classroomStudentId, studentIds[0]),
        orderBy: [desc(studentProgressReports.createdAt)]
    }) : [];

    const avgMastery = progressReports.length > 0 
        ? Math.round(progressReports.reduce((acc, report) => acc + report.masteryPercent, 0) / progressReports.length)
        : 0;

    return (
        <div className="space-y-8">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
                    Welcome back, {session.user.name?.split(' ')[0]}!
                </h1>
                <p className="text-slate-500 text-lg">
                    Ready to continue learning? Here is your current progress overview.
                </p>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-sky-50 flex items-center justify-center flex-shrink-0">
                        <GraduationCap className="w-6 h-6 text-sky-600" />
                    </div>
                    <div>
                        <p className="text-slate-500 font-medium">Enrolled Classes</p>
                        <h3 className="text-2xl font-bold text-slate-900 mt-1">{studentProfiles.length}</h3>
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                        <TrendingUp className="w-6 h-6 text-emerald-600" />
                    </div>
                    <div>
                        <p className="text-slate-500 font-medium">Average Mastery</p>
                        <h3 className="text-2xl font-bold text-slate-900 mt-1">{avgMastery}%</h3>
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
                        <BookOpen className="w-6 h-6 text-amber-600" />
                    </div>
                    <div>
                        <p className="text-slate-500 font-medium">Total Sessions</p>
                        <h3 className="text-2xl font-bold text-slate-900 mt-1">{recentSessions.length}</h3>
                    </div>
                </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                    <h2 className="text-lg font-bold text-slate-900">Recent Learning Sessions</h2>
                    <Link href="/student/sessions" className="text-sm font-medium text-sky-600 hover:text-sky-700">
                        View All
                    </Link>
                </div>
                
                {recentSessions.length > 0 ? (
                    <div className="divide-y divide-slate-100">
                        {recentSessions.map((lsession) => (
                            <div key={lsession.id} className="p-6 hover:bg-slate-50 transition-colors flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                                        <Clock className="w-5 h-5 text-slate-500" />
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-slate-900">
                                            {lsession.topic?.title || "General Tutoring Session"}
                                        </h4>
                                        <p className="text-sm text-slate-500 mt-0.5 flex items-center gap-2">
                                            <span className={`inline-block w-2 h-2 rounded-full ${lsession.sessionStatus === 'active' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                            {lsession.sessionStatus.charAt(0).toUpperCase() + lsession.sessionStatus.slice(1)} • 
                                            {new Date(lsession.createdAt).toLocaleDateString()}
                                        </p>
                                    </div>
                                </div>
                                {lsession.sessionStatus === 'active' && (
                                    <Link 
                                        href={`/s/${lsession.id}`} // Using session ID as shareableLink fallback, though usually we use tokens
                                        className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors"
                                    >
                                        <PlayCircle className="w-4 h-4" />
                                        Resume
                                    </Link>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="p-12 text-center flex flex-col items-center">
                        <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mb-4">
                            <BookOpen className="w-8 h-8 text-slate-300" />
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 mb-2">No learning sessions yet</h3>
                        <p className="text-slate-500 max-w-sm mx-auto">
                            When your teacher starts a class or assigns a topic, your sessions will appear here.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
