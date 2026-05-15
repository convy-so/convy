import { desc } from "drizzle-orm";
import { BrainCircuit, Cpu, Settings2, Zap } from "lucide-react";

import { getDb } from "@/db";
import { expertRuntimeModels } from "@/db/schema/learning";
import { Link } from "@/i18n/routing";
import { ExpertRuntimePreview } from "@/components/expert/expert-runtime-preview";

export default async function ExpertRuntimeModelsPage() {
  const models = await getDb().query.expertRuntimeModels.findMany({
    with: {
      framework: true,
      topic: true,
    },
    orderBy: [desc(expertRuntimeModels.updatedAt)],
  });

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Runtime Models</h1>
          <p className="mt-1 text-sm text-slate-500">
            Inspect published tutoring runtimes and jump back to the framework/version controls that produce them.
          </p>
        </div>
        <Link
          href="/expert/frameworks"
          className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
        >
          <Zap className="w-4 h-4" />
          Deploy From Frameworks
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {models.map((model) => (
            <div key={model.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col">
              <div className="p-6 flex-1">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-lg bg-sky-50 flex items-center justify-center">
                    <BrainCircuit className="w-5 h-5 text-sky-600" />
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                    {model.status.toUpperCase()}
                  </span>
                </div>

                <h3 className="font-bold text-slate-900 text-lg">{model.runtimeModel.framework.name}</h3>
                <p className="text-sm text-slate-500 mt-1 mb-4">
                  {model.framework.topicId && model.topic ? `Topic: ${model.topic.title}` : model.runtimeModel.framework.description || "No description."}
                </p>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 flex items-center gap-1.5"><Cpu className="w-3.5 h-3.5"/> Seed Source</span>
                    <span className="font-medium text-slate-700 font-mono text-xs">{model.runtimeModel.seedSource}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 flex items-center gap-1.5"><Settings2 className="w-3.5 h-3.5"/> Framework Version</span>
                    <span className="font-medium text-slate-700 font-mono text-xs">v{model.version}</span>
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">
                  Updated {new Date(model.updatedAt).toLocaleDateString()}
                </span>
                <div className="flex gap-2">
                  <Link
                    href={`/expert/frameworks/${model.frameworkId}/versions`}
                    className="text-sm font-semibold text-sky-600 hover:text-sky-700 transition-colors"
                  >
                    Configure
                  </Link>
                  <Link
                    href="/expert/runtime-preview"
                    className="text-sm font-semibold text-slate-600 hover:text-slate-800 transition-colors"
                  >
                    Preview
                  </Link>
                </div>
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
                Publish a framework version to synthesize and deploy a runtime model.
              </p>
            </div>
          )}
        </div>

        <ExpertRuntimePreview />
      </div>
    </div>
  );
}
