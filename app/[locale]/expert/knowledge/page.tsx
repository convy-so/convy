import { listDraftCrystallizations } from "@/app/actions/expert-knowledge";
import { ExpertCrystallizationInbox } from "@/components/expert/expert-crystallization-inbox";

export const metadata = {
  title: "Knowledge Inbox - Expert Portal",
  description: "Review and approve AI-generated pedagogical heuristics",
};

export default async function ExpertKnowledgePage() {
  const drafts = await listDraftCrystallizations();

  return (
    <div className="max-w-5xl mx-auto py-8 px-6">
      <ExpertCrystallizationInbox drafts={drafts} />
    </div>
  );
}
