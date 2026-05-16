import { useQuery } from "@tanstack/react-query";
import { fetchClassroomTopics } from "@/lib/api/learning";
import { getClassroomTopicsData } from "@/lib/server/app-queries";

export function useTestTopics(
  initialTopics: Awaited<ReturnType<typeof getClassroomTopicsData>> | undefined
) {
  const query = useQuery({
    queryKey: ["test"],
    queryFn: async () => {
      return fetchClassroomTopics("id");
    },
    initialData: initialTopics,
  });

  return query.data;
}
