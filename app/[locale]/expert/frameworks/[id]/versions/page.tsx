import { getVerifiedSession } from "@/lib/auth/session";
import { isExpertRole } from "@/lib/auth/roles";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { expertFrameworks, expertFrameworkVersions } from "@/db/schema/learning";
import { desc, eq } from "drizzle-orm";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Link } from "@/i18n/routing";

export default async function ExpertFrameworkVersionsPage({
    params
}: {
    params: Promise<{ locale: string, id: string }>
}) {
    const session = await getVerifiedSession();
    if (!isExpertRole(session.user)) redirect("/");

    const { id } = await params;

    const framework = await getDb().query.expertFrameworks.findFirst({
        where: eq(expertFrameworks.id, id)
    });

    if (!framework) {
        redirect("/expert/frameworks");
    }

    const versions = await getDb()
        .select()
        .from(expertFrameworkVersions)
        .where(eq(expertFrameworkVersions.frameworkId, id))
        .orderBy(desc(expertFrameworkVersions.version));

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Link
                    href="/expert/frameworks"
                    className="w-10 h-10 flex items-center justify-center rounded-full bg-white border border-slate-200 text-slate-500 hover:text-slate-900 transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
                        {framework.name} Versions
                        {framework.activeVersionId && (
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-700">
                                Active Version ID: {framework.activeVersionId.slice(-6)}
                            </span>
                        )}
                    </h1>
                    <p className="text-slate-500 mt-1">Review the history and evolution of this pedagogical framework.</p>
                </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <div className="relative border-l-2 border-slate-100 ml-4 space-y-8 pb-4">
                    {versions.map((ver) => {
                        const isLatest = ver.id === framework.activeVersionId;
                        return (
                            <div key={ver.id} className="relative pl-8">
                                <div className={`absolute -left-[11px] top-1 w-5 h-5 rounded-full border-4 border-white ${isLatest ? 'bg-indigo-500' : 'bg-slate-300'}`} />
                                
                                <div className={`p-5 rounded-xl border ${isLatest ? 'border-indigo-100 bg-indigo-50/30' : 'border-slate-200 bg-white'}`}>
                                    <div className="flex items-start justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-bold text-slate-900 flex items-center gap-2">
                                                Version {ver.version}
                                                {isLatest && <span className="flex items-center gap-1 text-xs font-semibold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full"><CheckCircle2 className="w-3 h-3" /> Active</span>}
                                            </h3>
                                        </div>
                                        <span className="text-sm font-medium text-slate-500">
                                            {new Date(ver.createdAt).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <p className="text-slate-700 text-sm mb-4">
                                        {ver.notes || "No change description provided."}
                                    </p>
                                    
                                    <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 text-xs font-mono text-slate-600">
                                        Start Stage: {ver.framework.startStageId} | Stages: {ver.framework.stages.length}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
