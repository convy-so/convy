"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type RealtimeStatus = "disconnected" | "connecting" | "connected" | "error";

type UseRealtimeOptions = {
  channels: string[];
  onEvent?: (event: any) => void;
};

export function useRealtime({ channels, onEvent }: UseRealtimeOptions) {
  const channelKey = channels.join("|");
  const [status, setStatus] = useState<RealtimeStatus>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const subscribedRef = useRef<Set<string>>(new Set());
  const reconnectTimerRef = useRef<number | null>(null);
  const shouldReconnectRef = useRef(true);

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
  }, []);

  const connect = useCallback(async () => {
    if (wsRef.current || channels.length === 0) return;
    shouldReconnectRef.current = true;
    setStatus("connecting");

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsHost = process.env.NEXT_PUBLIC_WEBSOCKET_URL || "localhost:3001";
    let url = `${protocol}//${wsHost}/realtime`;

    try {
      const res = await fetch("/api/auth/token");
      if (res.ok) {
        const { token } = await res.json();
        if (token) {
          url += `?token=${encodeURIComponent(token)}`;
        }
      }
    } catch (error) {
      console.error("[Realtime Hook] Auth token fetch failed:", error);
    }

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("connected");
      for (const channel of channels) {
        ws.send(JSON.stringify({ type: "subscribe", channel }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "subscribed") {
          subscribedRef.current.add(String(data.channel));
          return;
        }
        if (data.type === "unsubscribed") {
          subscribedRef.current.delete(String(data.channel));
          return;
        }
        if (data.type === "connected") {
          return;
        }
        onEvent?.(data);
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
      setStatus("disconnected");
      if (shouldReconnectRef.current) {
        reconnectTimerRef.current = window.setTimeout(() => {
          connect().catch((error) => {
            console.error("[Realtime Hook] Reconnect failed:", error);
          });
        }, 2000);
      }
    };
  }, [channelKey, onEvent]);

  useEffect(() => {
    connect().catch((error) => {
      console.error("[Realtime Hook] Connect failed:", error);
      setStatus("error");
    });
    return () => disconnect();
  }, [connect, disconnect]);

  useEffect(() => {
    if (status !== "connected" || !wsRef.current) return;

    const desired = new Set(channels);
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
  }, [channelKey, status, channels]);

  return { status, disconnect, connect };
}
