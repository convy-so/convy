import { getVerifiedSession } from "@/lib/auth/dal";
import { getDb } from "@/db";
import { classroomStudents, learningSessions, studentProgressReports } from "@/db/schema/learning";
import { desc, eq } from "drizzle-orm";
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
        <div className="space-y-10 pb-12">
            {/* Header with Background Pattern/Gradient */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 p-8 md:p-12 text-white shadow-2xl">
                <div className="relative z-10 max-w-2xl">
                    <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
                        Welcome back, <span className="text-sky-400">{session.user.name?.split(' ')[0]}</span>!
                    </h1>
                    <p className="text-slate-300 text-lg md:text-xl leading-relaxed">
                        You&apos;ve achieved <span className="text-white font-bold">{avgMastery}% mastery</span> across your active topics. Keep up the great momentum!
                    </p>
                    <div className="mt-8 flex flex-wrap gap-4">
                        <Link 
                            href="/student/sessions" 
                            className="px-6 py-3 bg-sky-500 hover:bg-sky-400 text-white font-semibold rounded-xl transition-all hover:scale-105 active:scale-95 shadow-lg shadow-sky-500/20"
                        >
                            Continue Learning
                        </Link>
                        <Link 
                            href="/student/progress" 
                            className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl backdrop-blur-md transition-all"
                        >
                            View Progress
                        </Link>
                    </div>
                </div>
                {/* Decorative elements */}
                <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-sky-500/10 rounded-full blur-3xl" />
                <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl" />
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="group bg-white rounded-3xl border border-slate-100 p-8 shadow-sm hover:shadow-md transition-all duration-300">
                    <div className="w-14 h-14 rounded-2xl bg-sky-50 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                        <GraduationCap className="w-7 h-7 text-sky-600" />
                    </div>
                    <p className="text-slate-500 font-semibold text-sm uppercase tracking-wider">Enrolled Classes</p>
                    <h3 className="text-4xl font-black text-slate-900 mt-2">{studentProfiles.length}</h3>
                    <div className="mt-4 h-1.5 w-full bg-slate-50 rounded-full overflow-hidden">
                        <div className="h-full bg-sky-500 rounded-full w-2/3" />
                    </div>
                </div>

                <div className="group bg-white rounded-3xl border border-slate-100 p-8 shadow-sm hover:shadow-md transition-all duration-300">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                        <TrendingUp className="w-7 h-7 text-emerald-600" />
                    </div>
                    <p className="text-slate-500 font-semibold text-sm uppercase tracking-wider">Average Mastery</p>
                    <div className="flex items-baseline gap-2 mt-2">
                        <h3 className="text-4xl font-black text-slate-900">{avgMastery}%</h3>
                        <span className="text-emerald-600 text-sm font-bold">+2.4%</span>
                    </div>
                    <div className="mt-4 h-1.5 w-full bg-slate-50 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${avgMastery}%` }} />
                    </div>
                </div>

                <div className="group bg-white rounded-3xl border border-slate-100 p-8 shadow-sm hover:shadow-md transition-all duration-300">
                    <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                        <BookOpen className="w-7 h-7 text-amber-600" />
                    </div>
                    <p className="text-slate-500 font-semibold text-sm uppercase tracking-wider">Total Sessions</p>
                    <h3 className="text-4xl font-black text-slate-900 mt-2">{recentSessions.length}</h3>
                    <p className="text-slate-400 text-xs mt-4 font-medium">Across all active topics</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Recent Activity */}
                <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm">
                    <div className="px-8 py-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
                        <h2 className="text-xl font-bold text-slate-900">Recent Activity</h2>
                        <Link href="/student/sessions" className="text-sm font-bold text-sky-600 hover:text-sky-700 transition-colors px-3 py-1 rounded-lg hover:bg-sky-50">
                            View All
                        </Link>
                    </div>
                    
                    {recentSessions.length > 0 ? (
                        <div className="divide-y divide-slate-50">
                            {recentSessions.map((lsession) => (
                                <div key={lsession.id} className="px-8 py-6 hover:bg-slate-50/50 transition-colors flex items-center justify-between group">
                                    <div className="flex items-center gap-5">
                                        <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center flex-shrink-0 group-hover:bg-white group-hover:shadow-sm transition-all">
                                            <Clock className="w-6 h-6 text-slate-400" />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-slate-900 text-lg">
                                                {lsession.topic?.title || "General Tutoring Session"}
                                            </h4>
                                            <div className="flex items-center gap-3 mt-1">
                                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest ${
                                                    lsession.sessionStatus === 'active' 
                                                    ? 'bg-emerald-100 text-emerald-700' 
                                                    : 'bg-slate-100 text-slate-600'
                                                }`}>
                                                    {lsession.sessionStatus}
                                                </span>
                                                <span className="text-xs text-slate-400 font-medium">
                                                    {new Date(lsession.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    {lsession.sessionStatus === 'active' && (
                                        <Link 
                                            href={`/s/${lsession.id}`}
                                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-800 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-slate-900/10"
                                        >
                                            <PlayCircle className="w-4 h-4" />
                                            Resume
                                        </Link>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="p-16 text-center flex flex-col items-center">
                            <div className="w-20 h-20 rounded-3xl bg-slate-50 flex items-center justify-center mb-6">
                                <BookOpen className="w-10 h-10 text-slate-200" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-2">Start your first session</h3>
                            <p className="text-slate-500 max-w-sm mx-auto leading-relaxed">
                                You don&apos;t have any recent activity. Head over to your classes to begin your learning journey.
                            </p>
                        </div>
                    )}
                </div>

                {/* Sidebar Card: Study Tips or Classes */}
                <div className="space-y-8">
                    <div className="bg-indigo-600 rounded-3xl p-8 text-white shadow-xl shadow-indigo-600/20 relative overflow-hidden group">
                        <div className="relative z-10">
                            <h3 className="text-xl font-bold mb-2">Ready for a challenge?</h3>
                            <p className="text-indigo-100 text-sm leading-relaxed mb-6">
                                Take a quick assessment to unlock new learning paths tailored to your interests.
                            </p>
                            <button className="w-full py-3 bg-white text-indigo-600 font-bold rounded-xl hover:bg-indigo-50 transition-colors">
                                Start Assessment
                            </button>
                        </div>
                        <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700" />
                    </div>

                    <div className="bg-white rounded-3xl border border-slate-100 p-8 shadow-sm">
                        <h3 className="text-lg font-bold text-slate-900 mb-6">My Classes</h3>
                        <div className="space-y-4">
                            {studentProfiles.map((profile) => (
                                <div key={profile.id} className="flex items-center gap-4 p-3 rounded-2xl hover:bg-slate-50 transition-colors">
                                    <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center flex-shrink-0">
                                        <BookOpen className="w-5 h-5 text-sky-600" />
                                    </div>
                                    <div className="overflow-hidden">
                                        <p className="font-bold text-slate-900 truncate">{profile.classroom?.title}</p>
                                        <p className="text-xs text-slate-400 font-medium">{profile.classroom?.gradeLabel}</p>
                                    </div>
                                </div>
                            ))}
                            {studentProfiles.length === 0 && (
                                <p className="text-sm text-slate-400 text-center py-4 italic">No classes joined yet</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
