"use client";

import { useEffect } from "react";
import toast from "react-hot-toast";
import { useQueryClient } from "@tanstack/react-query";
import { usePresence, WorkspaceEvent } from "@/hooks/use-presence";
import { queryKeys } from "@/lib/query-keys";
import { useAuth } from "@/components/providers/auth-provider";

interface WorkspaceNotificationsProps {
  workspaceId: string;
}

export function WorkspaceNotifications({ workspaceId }: WorkspaceNotificationsProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const handleWorkspaceEvent = (event: WorkspaceEvent) => {
    // Don't show notifications for our own actions
    if (event.userId === user?.id) {
      // Still invalidate queries to keep UI in sync
      invalidateRelevantQueries(event);
      return;
    }

    // Display toast notification
    const userName = event.userName || "A workspace member";
    
    switch (event.type) {
      case "SURVEY_CREATED":
        toast.success(`${userName} created a new survey: ${event.data.title}`, {
          duration: 5000,
          icon: "📝",
        });
        break;
      case "SURVEY_UPDATED":
        // Only notify for major updates like status changes
        if (event.data.status) {
          toast.success(`${userName} updated survey status to ${event.data.status}`, {
            duration: 4000,
          });
        }
        break;
      case "SURVEY_DELETED":
        toast.error(`${userName} deleted the survey: ${event.data.title}`, {
          duration: 5000,
        });
        break;
      case "PROJECT_CREATED":
        toast.success(`${userName} created a new project: ${event.data.name}`, {
          duration: 5000,
          icon: "📁",
        });
        break;
    }

    // Invalidate React Query caches to refresh the UI
    invalidateRelevantQueries(event);
  };

  const invalidateRelevantQueries = (event: WorkspaceEvent) => {
    if (event.type.startsWith("SURVEY_")) {
      queryClient.invalidateQueries({ queryKey: queryKeys.surveys.all(event.workspaceId) });
      if (event.data?.id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.surveys.detail(event.data.id) });
      }
    } else if (event.type.startsWith("PROJECT_")) {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all(event.workspaceId) });
      if (event.data?.id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(event.data.id) });
      }
    }
  };

  usePresence({
    workspaceId,
    onWorkspaceEvent: handleWorkspaceEvent,
  });

  return null; // This is a headless component for internal state management
}
