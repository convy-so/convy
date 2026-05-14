import { ExpertRuntimePreview } from "@/components/expert/expert-runtime-preview";

export default function ExpertRuntimePreviewPage() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">
          Runtime Preview
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Generate sample questions against a topic before you publish a framework version.
        </p>
      </div>

      <ExpertRuntimePreview />
    </div>
  );
}
