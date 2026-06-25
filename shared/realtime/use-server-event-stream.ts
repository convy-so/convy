"use client";

import { useEffect, useEffectEvent } from "react";

type ServerEventPayload = {
  type?: string;
  [key: string]: unknown;
};

export function useServerEventStream({
  url,
  enabled = true,
  event,
  onEvent,
}: {
  url: string | null;
  enabled?: boolean;
  event: string;
  onEvent: (payload: ServerEventPayload) => void;
}) {
  const handleEvent = useEffectEvent(onEvent);

  useEffect(() => {
    if (!enabled || !url) {
      return;
    }

    const source = new EventSource(url, { withCredentials: true });

    const listener = (message: MessageEvent<string>) => {
      try {
        handleEvent(JSON.parse(message.data) as ServerEventPayload);
      } catch (error) {
        console.error("[sse] failed to parse event", {
          event,
          url,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    source.addEventListener(event, listener as EventListener);

    return () => {
      source.removeEventListener(event, listener as EventListener);
      source.close();
    };
  }, [enabled, event, url]);
}
