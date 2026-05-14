import { TeacherReportsPage } from "@/components/learning/teacher-reports-page";
import {
  getClassroomTopicsData,
  getTeacherClassroomsData,
  getTopicReportsData,
} from "@/lib/server/app-queries";

export default async function LearningReportsPage() {
  const initialClassrooms = await getTeacherClassroomsData();
  const initialClassroomId = initialClassrooms.data[0]?.id ?? null;
  const initialTopics = initialClassroomId
    ? await getClassroomTopicsData(initialClassroomId)
    : undefined;
  const initialTopicId = initialTopics?.data[0]?.id ?? null;
  const initialReportsPayload = initialTopicId
    ? await getTopicReportsData(initialTopicId)
    : undefined;

  return (
    <TeacherReportsPage
      initialClassrooms={initialClassrooms}
      initialTopics={initialTopics}
      initialReportsPayload={initialReportsPayload}
    />
  );
}
