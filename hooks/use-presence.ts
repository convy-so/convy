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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizePresenceUser(value: unknown): PresenceUser | null {
  if (!isRecord(value) || typeof value.userId !== "string") {
    return null;
  }

  return {
    userId: value.userId,
    name: typeof value.name === "string" ? value.name : "Unknown user",
    image:
      typeof value.image === "string" || value.image === null
        ? value.image
        : null,
    lastActive:
      typeof value.lastActive === "number" ? value.lastActive : Date.now(),
  };
}

function normalizePresenceUsers(value: unknown): PresenceUser[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((user) => {
    const normalized = normalizePresenceUser(user);
    return normalized ? [normalized] : [];
  });
}

function parsePresenceMessage(value: unknown): PresenceMessage | null {
  if (
    !isRecord(value) ||
    (value.type !== "presence_update" &&
      value.type !== "user_joined" &&
      value.type !== "user_left" &&
      value.type !== "error" &&
      value.type !== "connected") ||
    typeof value.workspaceId !== "string"
  ) {
    return null;
  }

  return {
    type: value.type,
    workspaceId: value.workspaceId,
    surveyId: typeof value.surveyId === "string" ? value.surveyId : undefined,
    users: normalizePresenceUsers(value.users),
    user: normalizePresenceUser(value.user) ?? undefined,
  };
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
        if (token) url += `&token=${encodeURIComponent(token)}`;
      }
    } catch {
    }

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("connected");
    };

    ws.onmessage = (event) => {
      try {
        if (typeof event.data !== "string") {
          return;
        }

        const data = parsePresenceMessage(JSON.parse(event.data));
        if (!data) {
          return;
        }
        
        switch (data.type) {
          case "connected":
          case "presence_update":
            if (data.users) setUsers(data.users);
            break;
          case "user_joined":
            if (data.user?.userId && data.user.name) {
              const fullUser: PresenceUser = {
                userId: data.user.userId,
                name: data.user.name,
                image: data.user.image,
                lastActive: data.user.lastActive || Date.now()
              };
              setUsers(prev => {
                if (prev.find(u => u.userId === fullUser.userId)) return prev;
                return [...prev, fullUser];
              });
              onUserJoined?.(fullUser);
            }
            break;
          case "user_left":
            if (data.user?.userId) {
              setUsers(prev => prev.filter(u => u.userId !== data.user?.userId));
              onUserLeft?.(data.user);
            }
            break;
        }
      } catch {
      }
    };

    ws.onerror = () => {
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
    const timer = window.setTimeout(() => {
      void connect();
    }, 0);

    return () => {
      window.clearTimeout(timer);
      disconnect();
    };
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

