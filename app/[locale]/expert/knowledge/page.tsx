import { ExpertCrystallizationInbox } from "@/components/expert/expert-crystallization-inbox";
import { listDraftCrystallizations } from "@/app/actions/expert-knowledge";

export default async function ExpertKnowledgePage() {
  const draftsResult = await listDraftCrystallizations();
  const drafts = draftsResult.success ? draftsResult.data : [];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">
          Knowledge Inbox
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Approve or archive crystallized heuristics before they enter published runtime models.
        </p>
      </div>

      <ExpertCrystallizationInbox drafts={drafts} />
    </div>
  );
}
