import { getVerifiedSession } from "@/lib/auth/session";
import { isExpertRole } from "@/lib/auth/roles";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { expertRuntimeModels } from "@/db/schema/learning";
import { desc } from "drizzle-orm";
import { BrainCircuit, Cpu, Zap, Settings2 } from "lucide-react";

export default async function ExpertRuntimeModelsPage() {
    const session = await getVerifiedSession();
    if (!isExpertRole(session.user)) redirect("/");

    const models = await getDb()
        .select()
        .from(expertRuntimeModels)
        .orderBy(desc(expertRuntimeModels.updatedAt));

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Runtime Models</h1>
                    <p className="text-slate-500 mt-1">Configure and monitor the AI models deployed for tutoring.</p>
                </div>
                <button className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white font-medium rounded-lg hover:bg-slate-800 transition-colors">
                    <Zap className="w-4 h-4" />
                    Deploy New Model
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {models.map(model => (
                    <div key={model.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col">
                        <div className="p-6 flex-1">
                            <div className="flex items-center justify-between mb-4">
                                <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
                                    <BrainCircuit className="w-5 h-5 text-purple-600" />
                                </div>
                                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                                    model.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 
                                    model.status === 'deprecated' ? 'bg-slate-100 text-slate-600' :
                                    'bg-amber-100 text-amber-700'
                                }`}>
                                    {model.status.toUpperCase()}
                                </span>
                            </div>
                            
                            <h3 className="font-bold text-slate-900 text-lg">{model.runtimeModel.framework.name}</h3>
                            <p className="text-sm text-slate-500 mt-1 mb-4">{model.runtimeModel.framework.description || "No description."}</p>
                            
                            <div className="space-y-2 mb-4">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-slate-500 flex items-center gap-1.5"><Cpu className="w-3.5 h-3.5"/> Base Model</span>
                                    <span className="font-medium text-slate-700 font-mono text-xs">{model.runtimeModel.seedSource}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-slate-500 flex items-center gap-1.5"><Settings2 className="w-3.5 h-3.5"/> Framework ID: {model.frameworkVersionId.slice(-6)}</span>
                                </div>
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-500">
                                Updated {new Date(model.updatedAt).toLocaleDateString()}
                            </span>
                            <button className="text-sm font-semibold text-purple-600 hover:text-purple-700 transition-colors">
                                Configure
                            </button>
                        </div>
                    </div>
                ))}

                {models.length === 0 && (
                    <div className="col-span-full p-12 text-center bg-white border border-slate-200 rounded-2xl border-dashed">
                        <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
                            <Cpu className="w-8 h-8 text-slate-300" />
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 mb-2">No runtime models deployed</h3>
                        <p className="text-slate-500 max-w-sm mx-auto">
                            Deploy a model linked to a pedagogical framework to start tutoring sessions.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
