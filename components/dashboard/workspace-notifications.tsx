"use client";

import toast from "react-hot-toast";
import { useQueryClient } from "@tanstack/react-query";

import { useRealtime } from "@/hooks/use-realtime";
import { queryKeys } from "@/lib/query-keys";
import { useAuth } from "@/components/providers/auth-provider";
import type { RecordedRealtimeEvent } from "@/lib/collaboration-service";

interface WorkspaceNotificationsProps {
  workspaceId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function parseRealtimeEvent(value: unknown): RecordedRealtimeEvent | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    (value.scope !== "workspace" && value.scope !== "survey") ||
    typeof value.revision !== "number" ||
    typeof value.eventType !== "string" ||
    typeof value.actorId !== "string" ||
    typeof value.createdAt !== "string"
  ) {
    return null;
  }

  return {
    id: value.id,
    scope: value.scope,
    revision: value.revision,
    eventType: value.eventType,
    workspaceId: typeof value.workspaceId === "string" ? value.workspaceId : null,
    surveyId: typeof value.surveyId === "string" ? value.surveyId : null,
    actorId: value.actorId,
    createdAt: value.createdAt,
    payload: asRecord(value.payload),
  };
}

function getNestedString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

export function WorkspaceNotifications({
  workspaceId,
}: WorkspaceNotificationsProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const invalidateRelevantQueries = (event: RecordedRealtimeEvent) => {
    const payload = asRecord(event.payload);
    const surveyPayload = asRecord(payload.survey);
    const folderPayload = asRecord(payload.folder);

    if (event.eventType?.startsWith("workspace.survey_")) {
      queryClient.invalidateQueries({
        queryKey: queryKeys.surveys.all(event.workspaceId),
      });
      const surveyId =
        getNestedString(surveyPayload, "id") || getNestedString(payload, "surveyId");
      if (surveyId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.surveys.detail(surveyId),
        });
      }
      return;
    }

    if (
      event.eventType?.startsWith("workspace.folder_") ||
      event.eventType?.startsWith("workspace.project_")
    ) {
      queryClient.invalidateQueries({
        queryKey: queryKeys.folders.all(event.workspaceId),
      });
      const folderId =
        getNestedString(folderPayload, "id") ||
        getNestedString(payload, "folderId") ||
        getNestedString(asRecord(payload.project), "id") ||
        getNestedString(payload, "projectId");
      if (folderId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.folders.detail(folderId),
        });
      }
    }
  };

  useRealtime({
    channels: [`workspace:${workspaceId}`],
    onEvent: (event: unknown) => {
      const realtimeEvent = parseRealtimeEvent(event);
      if (!realtimeEvent) {
        return;
      }

      const payload = asRecord(realtimeEvent.payload);
      const surveyPayload = asRecord(payload.survey);
      const folderPayload = asRecord(payload.folder);

      if (realtimeEvent.actorId === user?.id) {
        invalidateRelevantQueries(realtimeEvent);
        return;
      }

      switch (realtimeEvent.eventType) {
        case "workspace.survey_created":
          toast.success(
            `A workspace member created a new survey: ${getNestedString(surveyPayload, "title") || "Untitled"}`,
            { duration: 5000 },
          );
          break;
        case "workspace.survey_updated":
          if (getNestedString(surveyPayload, "status")) {
            toast.success(
              `A workspace member updated survey status to ${getNestedString(surveyPayload, "status")}`,
              { duration: 4000 },
            );
          }
          break;
        case "workspace.survey_deleted":
          toast.error(
            `A workspace member deleted the survey: ${getNestedString(payload, "title") || "Untitled"}`,
            { duration: 5000 },
          );
          break;
        case "workspace.folder_created":
        case "workspace.project_created":
          toast.success(
            `A workspace member created a new folder: ${
              getNestedString(folderPayload, "name") ||
              getNestedString(asRecord(payload.project), "name") ||
              "Untitled"
            }`,
            { duration: 5000 },
          );
          break;
      }

      invalidateRelevantQueries(realtimeEvent);
    },
  });

  return null;
}
