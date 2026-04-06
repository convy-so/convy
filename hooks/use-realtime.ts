"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type RealtimeStatus = "disconnected" | "connecting" | "connected" | "error";

const MAX_RECENT_EVENT_IDS = 500;

export interface RealtimeEvent {
  id?: string;
  scope?: "workspace" | "survey";
  revision?: number;
  eventType: string;
  workspaceId?: string;
  surveyId?: string;
  payload?: unknown;
}

type UseRealtimeOptions = {
  channels: string[];
  onEvent?: (event: RealtimeEvent) => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseRealtimeEvent(value: unknown): RealtimeEvent | null {
  if (!isRecord(value)) {
    return null;
  }

  if (typeof value.type === "string") {
    return {
      eventType: value.type,
      workspaceId:
        typeof value.workspaceId === "string" ? value.workspaceId : undefined,
      surveyId: typeof value.surveyId === "string" ? value.surveyId : undefined,
      payload: value,
    };
  }

  if (typeof value.eventType === "string") {
    return {
      id: typeof value.id === "string" ? value.id : undefined,
      scope:
        value.scope === "workspace" || value.scope === "survey"
          ? value.scope
          : undefined,
      revision: typeof value.revision === "number" ? value.revision : undefined,
      eventType: value.eventType,
      workspaceId:
        typeof value.workspaceId === "string" ? value.workspaceId : undefined,
      surveyId: typeof value.surveyId === "string" ? value.surveyId : undefined,
      payload: value.payload,
    };
  }

  return null;
}

function getAuthTokenFromPayload(value: unknown): string | null {
  if (!isRecord(value) || typeof value.token !== "string") {
    return null;
  }

  return value.token;
}

function getRevisionChannelKey(event: RealtimeEvent): string | null {
  if (event.scope === "workspace" && event.workspaceId) {
    return `workspace:${event.workspaceId}`;
  }

  if (event.scope === "survey" && event.surveyId) {
    return `survey:${event.surveyId}`;
  }

  return null;
}

export function useRealtime({ channels, onEvent }: UseRealtimeOptions) {
  const channelKey = [...channels].sort().join("|");
  const parsedChannels = useMemo(
    () => (channelKey ? channelKey.split("|") : []),
    [channelKey],
  );
  const [status, setStatus] = useState<RealtimeStatus>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const subscribedRef = useRef<Set<string>>(new Set());
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReconnectRef = useRef(true);
  const connectRef = useRef<(() => Promise<void>) | null>(null);
  const recentEventIdsRef = useRef<{
    order: string[];
    seen: Set<string>;
  }>({
    order: [],
    seen: new Set<string>(),
  });
  const lastSeenRevisionRef = useRef<Map<string, number>>(new Map());

  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const shouldDispatchEvent = useCallback((event: RealtimeEvent) => {
    if (event.id) {
      const recentIds = recentEventIdsRef.current;
      if (recentIds.seen.has(event.id)) {
        return false;
      }

      recentIds.seen.add(event.id);
      recentIds.order.push(event.id);
      if (recentIds.order.length > MAX_RECENT_EVENT_IDS) {
        const evictedId = recentIds.order.shift();
        if (evictedId) {
          recentIds.seen.delete(evictedId);
        }
      }
    }

    const revisionKey = getRevisionChannelKey(event);
    if (revisionKey && typeof event.revision === "number") {
      const lastSeenRevision = lastSeenRevisionRef.current.get(revisionKey) ?? 0;
      if (event.revision <= lastSeenRevision) {
        return false;
      }

      lastSeenRevisionRef.current.set(revisionKey, event.revision);
    }

    return true;
  }, []);

  const handleSocketMessage = useCallback((event: MessageEvent) => {
    try {
      if (typeof event.data !== "string") {
        return;
      }

      const data = parseRealtimeEvent(JSON.parse(event.data));
      if (!data) {
        return;
      }

      if (data.eventType === "subscribed") {
        const payload = isRecord(data.payload) ? data.payload : null;
        const channel =
          payload && typeof payload.channel === "string" ? payload.channel : null;
        if (channel) {
          subscribedRef.current.add(channel);
        }
        return;
      }

      if (data.eventType === "unsubscribed") {
        const payload = isRecord(data.payload) ? data.payload : null;
        const channel =
          payload && typeof payload.channel === "string" ? payload.channel : null;
        if (channel) {
          subscribedRef.current.delete(channel);
        }
        return;
      }

      if (data.eventType === "connected" || !shouldDispatchEvent(data)) {
        return;
      }

      onEventRef.current?.(data);
    } catch {
      // Ignore malformed websocket messages and wait for the next frame.
    }
  }, [shouldDispatchEvent]);

  const attachSocket = useCallback((ws: WebSocket) => {
    ws.onopen = () => {
      setStatus("connected");
      for (const channel of parsedChannels) {
        ws.send(JSON.stringify({ type: "subscribe", channel }));
      }
    };

    ws.onmessage = handleSocketMessage;

    ws.onerror = () => {
      setStatus("error");
    };

    ws.onclose = () => {
      wsRef.current = null;
      subscribedRef.current.clear();
      if (shouldReconnectRef.current) {
        setStatus("connecting");
        reconnectTimerRef.current = setTimeout(() => {
          const reconnect = connectRef.current;
          if (!reconnect) {
            return;
          }

          void reconnect().catch(() => {
            setStatus("error");
          });
        }, 2000);
      } else {
        setStatus("disconnected");
      }
    };
  }, [handleSocketMessage, parsedChannels]);

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    subscribedRef.current.clear();
    setStatus("disconnected");
  }, []);

  const resolveConnectionUrl = useCallback(async () => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsHost = process.env.NEXT_PUBLIC_WEBSOCKET_URL || "localhost:3001";
    let url = `${protocol}//${wsHost}/realtime`;

    try {
      const res = await fetch("/api/auth/token");
      if (res.ok) {
        const token = getAuthTokenFromPayload(await res.json());
        if (token) {
          url += `?token=${encodeURIComponent(token)}`;
        }
      }
    } catch {
      // Best-effort auth token fetch; socket auth handles failures.
    }

    return url;
  }, []);

  const openConnection = useCallback(async (announceConnecting: boolean) => {
    if (wsRef.current || parsedChannels.length === 0) return;
    shouldReconnectRef.current = true;
    if (announceConnecting) {
      setStatus("connecting");
    }

    const url = await resolveConnectionUrl();
    if (!shouldReconnectRef.current) return;

    const ws = new WebSocket(url);
    wsRef.current = ws;
    attachSocket(ws);
  }, [attachSocket, parsedChannels.length, resolveConnectionUrl]);

  const connect = useCallback(async () => {
    await openConnection(true);
  }, [openConnection]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    if (wsRef.current || parsedChannels.length === 0) {
      return () => disconnect();
    }

    shouldReconnectRef.current = true;
    let cancelled = false;

    void (async () => {
      try {
        const url = await resolveConnectionUrl();
        if (cancelled || !shouldReconnectRef.current || wsRef.current) {
          return;
        }

        const ws = new WebSocket(url);
        wsRef.current = ws;
        attachSocket(ws);
      } catch {
        window.setTimeout(() => {
          setStatus("error");
        }, 0);
      }
    })();

    return () => {
      cancelled = true;
      disconnect();
    };
  }, [attachSocket, disconnect, parsedChannels.length, resolveConnectionUrl]);

  useEffect(() => {
    if (status !== "connected" || !wsRef.current) return;

    const desired = new Set(parsedChannels);
    const current = new Set(subscribedRef.current);

    for (const channel of desired) {
      if (!current.has(channel)) {
        wsRef.current.send(JSON.stringify({ type: "subscribe", channel }));
      }
    }

    for (const channel of current) {
      if (!desired.has(channel)) {
        wsRef.current.send(JSON.stringify({ type: "unsubscribe", channel }));
      }
    }
  }, [parsedChannels, status]);

  return { status, disconnect, connect };
}
