import { getVerifiedSession } from "@/lib/auth/dal";
import { getDb } from "@/db";
import { classroomStudents, studentProgressReports, studentModels, studentModelSnapshots } from "@/db/schema/learning";
import { desc, eq } from "drizzle-orm";
import { TrendingUp, Award, BrainCircuit, Target, AlertCircle } from "lucide-react";

export default async function StudentProgressPage() {
    const session = await getVerifiedSession();
    const userId = session.user.id;

    const studentProfiles = await getDb().query.classroomStudents.findMany({
        where: eq(classroomStudents.userId, userId),
    });

    const studentIds = studentProfiles.map(s => s.id);

    const progressReports = studentIds.length > 0 ? await getDb().query.studentProgressReports.findMany({
        where: eq(studentProgressReports.classroomStudentId, studentIds[0]),
        orderBy: [desc(studentProgressReports.createdAt)],
        with: {
            topic: true
        }
    }) : [];

    const models = studentIds.length > 0 ? await getDb().query.studentModels.findMany({
        where: eq(studentModels.classroomStudentId, studentIds[0]),
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
            <div>
                <h1 className="text-3xl font-bold text-slate-900 tracking-tight">My Progress</h1>
                <p className="text-slate-500 text-lg mt-1">Review your test scores, quizzes, and estimated understanding.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* AI Estimates Panel */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center">
                                <BrainCircuit className="w-5 h-5 text-indigo-600" />
                            </div>
                            <h2 className="text-lg font-bold text-slate-900">Understanding Map</h2>
                        </div>

                        {latestModel && latestModel.knowledgeStateModel && latestModel.knowledgeStateModel.length > 0 ? (
                            <div className="space-y-4">
                                {latestModel.knowledgeStateModel.map((node) => {
                                    const pct = node.masteryLevel === 'generative' ? 100 : node.masteryLevel === 'applied' ? 66 : 33;
                                    return (
                                        <div key={node.conceptKey} className="space-y-2">
                                            <div className="flex items-center justify-between text-sm">
                                                <span className="font-medium text-slate-700">{node.title}</span>
                                                <span className="text-slate-500 capitalize">{node.masteryLevel}</span>
                                            </div>
                                            <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                                <div 
                                                    className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-full" 
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                            {node.misconceptions?.length > 0 && (
                                                <p className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                                                    <AlertCircle className="w-3 h-3" /> Note: {node.misconceptions[0]}
                                                </p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className="text-sm text-slate-500 text-center py-4">
                                Not enough data yet to build your understanding map. Keep participating in sessions!
                            </p>
                        )}
                    </div>
                </div>

                {/* Progress Reports (Scores & Quizzes) */}
                <div className="lg:col-span-2 space-y-4">
                    <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2 mb-4">
                        <Award className="w-6 h-6 text-emerald-500" />
                        Test & Quiz Scores
                    </h2>

                    {progressReports.length > 0 ? (
                        <div className="grid gap-4">
                            {progressReports.map((report) => (
                                <div key={report.id} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <h3 className="text-lg font-bold text-slate-900">
                                                {report.topic?.title || "Topic Assessment"}
                                            </h3>
                                            <p className="text-sm text-slate-500 mt-1 flex items-center gap-2">
                                                <span>{new Date(report.createdAt).toLocaleDateString()}</span>
                                            </p>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <span className="text-3xl font-black text-emerald-600 tracking-tighter">
                                                {report.masteryPercent}%
                                            </span>
                                            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Mastery</span>
                                        </div>
                                    </div>

                                    {report.report?.studentSummary && (
                                        <div className="mt-4 pt-4 border-t border-slate-100">
                                            <p className="text-sm text-slate-700 leading-relaxed">
                                                {report.report.studentSummary}
                                            </p>
                                        </div>
                                    )}

                                    {report.report?.identifiedGaps && report.report.identifiedGaps.length > 0 && (
                                        <div className="mt-4 bg-amber-50 rounded-xl p-4">
                                            <h4 className="text-sm font-bold text-amber-900 flex items-center gap-2 mb-2">
                                                <Target className="w-4 h-4 text-amber-600" />
                                                Focus Areas
                                            </h4>
                                            <ul className="list-disc list-inside text-sm text-amber-800 space-y-1">
                                                {report.report.identifiedGaps.map((gap: string, idx: number) => (
                                                    <li key={idx}>{gap}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center flex flex-col items-center shadow-sm">
                            <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mb-4">
                                <TrendingUp className="w-8 h-8 text-slate-300" />
                            </div>
                            <h3 className="text-lg font-bold text-slate-900 mb-2">No scores recorded yet</h3>
                            <p className="text-slate-500 max-w-sm mx-auto">
                                Complete learning sessions and quizzes to see your scores and progress reports here.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
