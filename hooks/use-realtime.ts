"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type RealtimeStatus = "disconnected" | "connecting" | "connected" | "error";

export interface RealtimeEvent {
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
  if (!isRecord(value) || typeof value.type !== "string") {
    return null;
  }

  return {
    eventType: value.type,
    workspaceId: typeof value.workspaceId === "string" ? value.workspaceId : undefined,
    surveyId: typeof value.surveyId === "string" ? value.surveyId : undefined,
    payload: value,
  };
}

function getAuthTokenFromPayload(value: unknown): string | null {
  if (!isRecord(value) || typeof value.token !== "string") {
    return null;
  }

  return value.token;
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

  // Keep latest callback in ref
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

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
    } catch (error) {
      console.error("[Realtime Hook] Auth token fetch failed:", error);
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

    ws.onopen = () => {
      setStatus("connected");
      for (const channel of parsedChannels) {
        ws.send(JSON.stringify({ type: "subscribe", channel }));
      }
    };

    ws.onmessage = (event) => {
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
        if (data.eventType === "connected") {
          return;
        }
        onEventRef.current?.(data);
      } catch (error) {
        console.error("[Realtime Hook] Failed to parse message:", error);
      }
    };

    ws.onerror = (error) => {
      console.error("[Realtime Hook] Error:", error);
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

          void reconnect().catch((error) => {
            console.error("[Realtime Hook] Reconnect failed:", error);
            setStatus("error");
          });
        }, 2000);
      } else {
        setStatus("disconnected");
      }
    };
  }, [parsedChannels, resolveConnectionUrl]);

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
    const cancelled = false;

    void (async () => {
      try {
        const url = await resolveConnectionUrl();
        if (cancelled || !shouldReconnectRef.current || wsRef.current) {
          return;
        }

        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          setStatus("connected");
          for (const channel of parsedChannels) {
            ws.send(JSON.stringify({ type: "subscribe", channel }));
          }
        };

        ws.onmessage = (event) => {
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
            if (data.eventType === "connected") {
              return;
            }
            onEventRef.current?.(data);
          } catch (error) {
            console.error("[Realtime Hook] Failed to parse message:", error);
          }
        };

        ws.onerror = (error) => {
          console.error("[Realtime Hook] Error:", error);
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

              void reconnect().catch((error) => {
                console.error("[Realtime Hook] Reconnect failed:", error);
                setStatus("error");
              });
            }, 2000);
          } else {
            setStatus("disconnected");
          }
        };
      } catch (error) {
        console.error("[Realtime Hook] Connect failed:", error);
        window.setTimeout(() => {
          setStatus("error");
        }, 0);
      }
    })();

    return () => disconnect();
  }, [disconnect, parsedChannels, resolveConnectionUrl]);

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
