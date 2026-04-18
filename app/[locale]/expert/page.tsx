import { AiOpsDashboard } from "@/components/admin/ai-ops-dashboard";
import { ExpertLearningOps } from "@/components/admin/expert-learning-ops";

export default function ExpertPage() {
  return (
    <div className="space-y-8">
      <AiOpsDashboard />
      <ExpertLearningOps />
    </div>
  );
}
