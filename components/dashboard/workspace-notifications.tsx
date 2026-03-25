"use client";

import toast from "react-hot-toast";
import { useQueryClient } from "@tanstack/react-query";

import { useRealtime } from "@/hooks/use-realtime";
import { queryKeys } from "@/lib/query-keys";
import { useAuth } from "@/components/providers/auth-provider";

interface WorkspaceNotificationsProps {
  workspaceId: string;
}

export function WorkspaceNotifications({
  workspaceId,
}: WorkspaceNotificationsProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const invalidateRelevantQueries = (event: any) => {
    if (event.eventType?.startsWith("workspace.survey_")) {
      queryClient.invalidateQueries({
        queryKey: queryKeys.surveys.all(event.workspaceId),
      });
      const surveyId = event.payload?.survey?.id || event.payload?.surveyId;
      if (surveyId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.surveys.detail(surveyId),
        });
      }
      return;
    }

    if (event.eventType?.startsWith("workspace.project_")) {
      queryClient.invalidateQueries({
        queryKey: queryKeys.projects.all(event.workspaceId),
      });
      const projectId = event.payload?.project?.id || event.payload?.projectId;
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.projects.detail(projectId),
        });
      }
    }
  };

  useRealtime({
    channels: [`workspace:${workspaceId}`],
    onEvent: (event) => {
      if (event.actorId === user?.id) {
        invalidateRelevantQueries(event);
        return;
      }

      switch (event.eventType) {
        case "workspace.survey_created":
          toast.success(
            `A workspace member created a new survey: ${event.payload?.survey?.title || "Untitled"}`,
            { duration: 5000 },
          );
          break;
        case "workspace.survey_updated":
          if (event.payload?.survey?.status) {
            toast.success(
              `A workspace member updated survey status to ${event.payload.survey.status}`,
              { duration: 4000 },
            );
          }
          break;
        case "workspace.survey_deleted":
          toast.error(
            `A workspace member deleted the survey: ${event.payload?.title || "Untitled"}`,
            { duration: 5000 },
          );
          break;
        case "workspace.project_created":
          toast.success(
            `A workspace member created a new project: ${event.payload?.project?.name || "Untitled"}`,
            { duration: 5000 },
          );
          break;
      }

      invalidateRelevantQueries(event);
    },
  });

  return null;
}
