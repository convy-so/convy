import { useTeacherLearningWorkspace } from "@/components/learning/hooks/use-teacher-learning-workspace";
import { getTeacherLearningWorkspaceInitialData } from "@/lib/server/app-queries";

export function useTestTopics(
  initialData: Awaited<ReturnType<typeof getTeacherLearningWorkspaceInitialData>>
) {
  const { topics, selectedTopic } = useTeacherLearningWorkspace(initialData);

  // Let's check their types
  const test1: any[] = topics; // If topics is never[], this will be fine. If it is {id: string}[], this is fine.
  
  if (topics.length > 0) {
    const t = topics[0];
    t.id; // Error if topics is never[]
  }

  if (selectedTopic) {
    selectedTopic.id; // Error if selectedTopic is never
  }

  return { topics, selectedTopic };
}
