"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export interface PresenceUser {
  userId: string;
  name: string;
  image?: string | null;
  lastActive: number;
}

export interface PresenceMessage {
  type: "presence_update" | "user_joined" | "user_left" | "error" | "connected";
  workspaceId: string;
  surveyId?: string;
  users?: PresenceUser[];
  user?: Partial<PresenceUser>;
}

interface UsePresenceOptions {
  workspaceId: string;
  surveyId?: string;
  onUserJoined?: (user: Partial<PresenceUser>) => void;
  onUserLeft?: (user: Partial<PresenceUser>) => void;
}

export function usePresence({
  workspaceId,
  surveyId,
  onUserJoined,
  onUserLeft,
}: UsePresenceOptions) {
  const [users, setUsers] = useState<PresenceUser[]>([]);
  const [status, setStatus] = useState<"disconnected" | "connecting" | "connected" | "error">("disconnected");
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(async () => {
    if (wsRef.current || !workspaceId) return;

    setStatus("connecting");

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsHost = process.env.NEXT_PUBLIC_WEBSOCKET_URL || "localhost:3001";
    let url = `${protocol}//${wsHost}/presence?workspaceId=${workspaceId}`;
    if (surveyId) url += `&surveyId=${surveyId}`;

    try {
      const res = await fetch("/api/auth/token");
      if (res.ok) {
        const { token } = await res.json();
        if (token) url += `&token=${token}`;
      }
    } catch (e) {
      console.error("[Presence Hook] Auth token fetch failed:", e);
    }

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("connected");
      console.log("[Presence Hook] Connected to presence server");
    };

    ws.onmessage = (event) => {
      try {
        const data: PresenceMessage = JSON.parse(event.data);
        
        switch (data.type) {
          case "connected":
            if (data.users) setUsers(data.users);
            break;
          case "user_joined":
            if (data.user?.userId) {
              setUsers(prev => {
                if (prev.find(u => u.userId === data.user?.userId)) return prev;
                return [...prev, data.user as PresenceUser];
              });
              onUserJoined?.(data.user);
            }
            break;
          case "user_left":
            if (data.user?.userId) {
              setUsers(prev => prev.filter(u => u.userId !== data.user?.userId));
              onUserLeft?.(data.user);
            }
            break;
        }
      } catch (e) {
        console.error("[Presence Hook] Failed to parse message:", e);
      }
    };

    ws.onerror = (e) => {
      console.error("[Presence Hook] Error:", e);
      setStatus("error");
    };

    ws.onclose = () => {
      setStatus("disconnected");
      wsRef.current = null;
    };
  }, [workspaceId, surveyId, onUserJoined, onUserLeft]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  // Heartbeat/Update presence
  useEffect(() => {
    if (status !== "connected" || !wsRef.current) return;

    const interval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "heartbeat" }));
      }
    }, 30000); // Heartbeat every 30s

    return () => clearInterval(interval);
  }, [status]);

  return {
    users,
    status,
    connect,
    disconnect
  };
}
