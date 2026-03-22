"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePresence } from "@/hooks/use-presence";
import { toast } from "react-hot-toast";
import { useTranslations } from "next-intl";

interface RealTimeRefreshProps {
  workspaceId: string;
}

/**
 * A silent listener component that triggers router.refresh() 
 * when important workspace events occur.
 */
export function RealTimeRefresh({ workspaceId }: RealTimeRefreshProps) {
  const router = useRouter();
  const t = useTranslations("Dashboard");

  usePresence({
    workspaceId,
    onWorkspaceEvent: (event) => {
      console.log("[RealTimeRefresh] Received workspace event:", event.type);
      
      // Refresh the server-side data for the dashboard
      router.refresh();

      // Notify the user of specific events
      if (event.type === "SURVEY_CREATED") {
        toast.success(`${event.userName || "Someone"} created a new survey: ${event.data.title || "Untitled"}`, {
          icon: "🚀",
        });
      } else if (event.type === "PROJECT_CREATED") {
         toast.success(`${event.userName || "Someone"} created a new project: ${event.data.name || "Untitled"}`, {
          icon: "📁",
        });
      }
    },
  });

  return null;
}
