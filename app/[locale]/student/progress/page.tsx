import { getVerifiedSession } from "@/lib/auth/dal";
import { getDb } from "@/db";
import { classroomStudents, studentProgressReports, studentModels, studentModelSnapshots } from "@/db/schema/learning";
import { desc, eq, and } from "drizzle-orm";
import { TrendingUp, Award, BrainCircuit, Target, AlertCircle, ChevronLeft } from "lucide-react";
import { Link } from "@/i18n/routing";

export default async function StudentProgressPage(props: {
    searchParams: Promise<{ classroomId?: string }>;
}) {
    const { classroomId } = await props.searchParams;
    const session = await getVerifiedSession();
    const userId = session.user.id;

    // Find profiles for this user
    const studentProfiles = await getDb().query.classroomStudents.findMany({
        where: eq(classroomStudents.userId, userId),
        with: {
            classroom: true
        }
    });

    // Determine which student profile to use (either matching classroomId or the first one)
    const selectedProfile = classroomId 
        ? studentProfiles.find(p => p.classroomId === classroomId) || studentProfiles[0]
        : studentProfiles[0];

    const studentId = selectedProfile?.id;

    const progressReports = studentId ? await getDb().query.studentProgressReports.findMany({
        where: eq(studentProgressReports.classroomStudentId, studentId),
        orderBy: [desc(studentProgressReports.createdAt)],
        with: {
            topic: true
        }
    }) : [];

    const models = studentId ? await getDb().query.studentModels.findMany({
        where: eq(studentModels.classroomStudentId, studentId),
        limit: 1
    }) : [];

    const studentModelId = models[0]?.id;

    const snapshots = studentModelId ? await getDb().query.studentModelSnapshots.findMany({
        where: eq(studentModelSnapshots.studentModelId, studentModelId),
        orderBy: [desc(studentModelSnapshots.version)],
        limit: 1
    }) : [];

    const latestModel = snapshots[0]?.snapshot;

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    {classroomId && (
                        <Link href="/student/classes" className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 uppercase tracking-widest mb-3 hover:text-indigo-700 transition-colors">
                            <ChevronLeft className="w-3.5 h-3.5" />
                            Back to Classes
                        </Link>
                    )}
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
                        {selectedProfile ? `${selectedProfile.classroom.title} Progress` : 'My Progress'}
                    </h1>
                    <p className="text-slate-500 text-lg mt-1 font-medium">Review your test scores, quizzes, and estimated understanding.</p>
                </div>
                {studentProfiles.length > 1 && !classroomId && (
                    <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-2 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-500" />
                        <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">Multiple Classes Found</span>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* AI Estimates Panel */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white rounded-[2rem] border border-slate-100 p-8 shadow-sm">
                        <div className="flex items-center gap-3 mb-8">
                            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 border border-indigo-100">
                                <BrainCircuit className="w-5 h-5" />
                            </div>
                            <h2 className="text-lg font-bold text-slate-900">Understanding Map</h2>
                        </div>

                        {latestModel && latestModel.knowledgeStateModel && latestModel.knowledgeStateModel.length > 0 ? (
                            <div className="space-y-6">
                                {latestModel.knowledgeStateModel.map((node: any) => {
                                    const pct = node.masteryLevel === 'generative' ? 100 : node.masteryLevel === 'applied' ? 66 : 33;
                                    return (
                                        <div key={node.conceptKey} className="space-y-3">
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="font-bold text-slate-700 uppercase tracking-wider">{node.title}</span>
                                                <span className={cn(
                                                    "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter border",
                                                    node.masteryLevel === 'generative' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                                                    node.masteryLevel === 'applied' ? 'bg-blue-50 text-blue-600 border-blue-100' : 
                                                    'bg-slate-50 text-slate-500 border-slate-100'
                                                )}>
                                                    {node.masteryLevel}
                                                </span>
                                            </div>
                                            <div className="h-2.5 w-full bg-slate-50 rounded-full overflow-hidden border border-slate-100">
                                                <div 
                                                    className={cn(
                                                        "h-full rounded-full transition-all duration-500",
                                                        node.masteryLevel === 'generative' ? 'bg-emerald-500' : 'bg-indigo-500'
                                                    )} 
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                            {node.misconceptions?.length > 0 && (
                                                <p className="text-[11px] text-amber-600 font-medium flex items-start gap-1.5 mt-1.5 italic bg-amber-50/50 p-2 rounded-lg border border-amber-100/50">
                                                    <AlertCircle className="w-3.5 h-3.5 shrink-0" /> 
                                                    {node.misconceptions[0]}
                                                </p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                                <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest px-4">
                                    Learning map forming...
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Progress Reports (Scores & Quizzes) */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="flex items-center justify-between px-1">
                        <h2 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                            <Award className="w-4 h-4 text-emerald-500" />
                            Mastery Records
                        </h2>
                        <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">{progressReports.length} Reports</span>
                    </div>

                    {progressReports.length > 0 ? (
                        <div className="grid gap-6">
                            {progressReports.map((report) => (
                                <div key={report.id} className="bg-white rounded-[2rem] border border-slate-100 p-8 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 group">
                                    <div className="flex items-start justify-between">
                                        <div className="space-y-1">
                                            <span className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.15em]">{report.topic?.subjectLabel || 'General'}</span>
                                            <h3 className="text-xl font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                                                {report.topic?.title || "Topic Assessment"}
                                            </h3>
                                            <div className="flex items-center gap-3 mt-1">
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                                    <Target className="w-3 h-3" />
                                                    Assessment
                                                </span>
                                                <span className="w-1 h-1 rounded-full bg-slate-200" />
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                                    {new Date(report.createdAt).toLocaleDateString()}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <div className="relative">
                                                <span className="text-4xl font-black text-slate-900 tracking-tighter relative z-10">
                                                    {report.masteryPercent}%
                                                </span>
                                                <div className="absolute -inset-2 bg-indigo-50 rounded-lg -rotate-3 scale-110 opacity-0 group-hover:opacity-100 transition-opacity" />
                                            </div>
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">Mastery Score</span>
                                        </div>
                                    </div>

                                    {report.report?.studentSummary && (
                                        <div className="mt-6 pt-6 border-t border-slate-50">
                                            <div className="flex items-start gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
                                                    <BrainCircuit className="w-4 h-4 text-slate-400" />
                                                </div>
                                                <p className="text-sm text-slate-600 leading-relaxed font-medium italic">
                                                    &ldquo;{report.report.studentSummary}&rdquo;
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {report.report?.identifiedGaps && report.report.identifiedGaps.length > 0 && (
                                        <div className="mt-6 bg-amber-50/50 rounded-2xl p-5 border border-amber-100/50">
                                            <h4 className="text-[10px] font-black text-amber-700 flex items-center gap-2 mb-3 uppercase tracking-widest">
                                                <AlertCircle className="w-3.5 h-3.5" />
                                                Growth Opportunities
                                            </h4>
                                            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                {report.report.identifiedGaps.map((gap: string, idx: number) => (
                                                    <li key={idx} className="flex items-center gap-2 text-xs font-bold text-amber-800 bg-white/60 px-3 py-2 rounded-xl border border-amber-100/40">
                                                        <div className="w-1 h-1 rounded-full bg-amber-400" />
                                                        {gap}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="bg-white rounded-[3rem] border border-slate-100 p-20 text-center flex flex-col items-center shadow-sm">
                            <div className="w-20 h-20 rounded-3xl bg-slate-50 flex items-center justify-center mb-6 border border-slate-100">
                                <TrendingUp className="w-10 h-10 text-slate-200" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900">No mastery records yet</h3>
                            <p className="text-slate-500 max-w-sm mx-auto mt-2 font-medium">
                                Complete your first tutoring session or quiz to unlock your personalized progress reports.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function cn(...inputs: any[]) {
    return inputs.filter(Boolean).join(" ");
}
