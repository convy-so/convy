import { getVerifiedSession } from "@/lib/auth/session";
import { isExpertRole } from "@/lib/auth/roles";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { expertFrameworks } from "@/db/schema/learning";
import { desc, eq } from "drizzle-orm";
import { FileText, Plus, GitBranch, ShieldCheck } from "lucide-react";
import { Link } from "@/i18n/routing";

export default async function ExpertFrameworksPage() {
    const session = await getVerifiedSession();
    if (!isExpertRole(session.user)) redirect("/");

    const frameworks = await getDb()
        .select()
        .from(expertFrameworks)
        .orderBy(desc(expertFrameworks.updatedAt));

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Pedagogical Frameworks</h1>
                    <p className="text-slate-500 mt-1">Author and manage core teaching strategies and rulesets.</p>
                </div>
                <button className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white font-medium rounded-lg hover:bg-slate-800 transition-colors">
                    <Plus className="w-4 h-4" />
                    New Framework
                </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                {frameworks.length > 0 ? (
                    <div className="divide-y divide-slate-100">
                        {frameworks.map(fw => (
                            <div key={fw.id} className="p-6 hover:bg-slate-50 transition-colors flex items-center justify-between">
                                <div className="flex items-start gap-4">
                                    <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
                                        <FileText className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                                            {fw.name}
                                            {fw.activeVersionId && (
                                                <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
                                                    Active
                                                </span>
                                            )}
                                        </h3>
                                        <p className="text-sm text-slate-500 mt-1 line-clamp-1">{fw.description || "No description provided."}</p>
                                        <div className="flex items-center gap-4 mt-3 text-xs font-medium text-slate-500">
                                            <span className="flex items-center gap-1">
                                                <ShieldCheck className="w-3.5 h-3.5" /> 
                                                {fw.activeVersionId ? <span className="text-emerald-600">Active</span> : "Draft"}
                                            </span>
                                            <span>Updated {new Date(fw.updatedAt).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Link 
                                        href={`/expert/frameworks/${fw.id}/versions`}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 transition-colors"
                                    >
                                        <GitBranch className="w-4 h-4" />
                                        Versions
                                    </Link>
                                    <button className="px-4 py-1.5 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors">
                                        Edit
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="p-12 text-center flex flex-col items-center">
                        <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mb-4 border border-slate-100">
                            <FileText className="w-8 h-8 text-slate-300" />
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 mb-2">No frameworks found</h3>
                        <p className="text-slate-500 max-w-sm mx-auto mb-6">
                            Create your first pedagogical framework to define how the AI should teach students.
                        </p>
                        <button className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white font-medium rounded-lg hover:bg-slate-800 transition-colors">
                            <Plus className="w-4 h-4" />
                            Create Framework
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
