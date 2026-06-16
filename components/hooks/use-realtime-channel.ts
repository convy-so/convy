"use client";

import { useEffect, useEffectEvent } from "react";

import { clientEnv } from "@/lib/env.client";

type RealtimeMessage = {
  type?: string;
  channel?: string;
  error?: string;
  [key: string]: unknown;
};

type WebsocketTicketResponse = {
  token: string;
};

async function fetchWebsocketTicket(): Promise<string> {
  const response = await fetch("/api/auth/token", {
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to create realtime auth ticket");
  }

  const payload = (await response.json()) as WebsocketTicketResponse;
  if (!payload.token) {
    throw new Error("Missing realtime auth ticket");
  }

  return payload.token;
}

function buildRealtimeUrl(token: string) {
  const url = new URL("/realtime", clientEnv.NEXT_PUBLIC_WEBSOCKET_URL);
  url.searchParams.set("token", token);
  return url.toString();
}

export function useRealtimeChannel({
  channel,
  enabled = true,
  onMessage,
}: {
  channel: string | null;
  enabled?: boolean;
  onMessage: (message: RealtimeMessage) => void;
}) {
  const handleMessage = useEffectEvent(onMessage);

  useEffect(() => {
    if (!enabled || !channel) {
      return;
    }

    let socket: WebSocket | null = null;
    let disposed = false;
    let reconnectTimer: number | null = null;
    let reconnectAttempts = 0;
    let hasLoggedConnectionFailure = false;

    const clearReconnectTimer = () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const scheduleReconnect = () => {
      if (disposed) {
        return;
      }

      clearReconnectTimer();
      const delayMs = Math.min(1000 * 2 ** reconnectAttempts, 15000);
      reconnectAttempts += 1;
      reconnectTimer = window.setTimeout(() => {
        void connect();
      }, delayMs);
    };

    const connect = async () => {
      try {
        const ticket = await fetchWebsocketTicket();
        if (disposed) {
          return;
        }

        socket = new WebSocket(buildRealtimeUrl(ticket));

        socket.addEventListener("open", () => {
          reconnectAttempts = 0;
          hasLoggedConnectionFailure = false;
          socket?.send(JSON.stringify({ type: "subscribe", channel }));
        });

        socket.addEventListener("message", (event) => {
          try {
            const payload = JSON.parse(String(event.data)) as RealtimeMessage;

            if (
              payload.type === "connected" ||
              payload.type === "subscribed" ||
              payload.type === "unsubscribed"
            ) {
              return;
            }

            if (payload.type === "subscription_error") {
              console.error("[realtime] subscription error", {
                channel,
                error: payload.error,
              });
              return;
            }

            handleMessage(payload);
          } catch (error) {
            console.error("[realtime] failed to parse message", {
              channel,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        });

        socket.addEventListener("error", () => {
          socket?.close();
        });

        socket.addEventListener("close", () => {
          if (!disposed) {
            scheduleReconnect();
          }
        });
      } catch (error) {
        if (!hasLoggedConnectionFailure) {
          console.error("[realtime] failed to connect", {
            channel,
            error: error instanceof Error ? error.message : String(error),
          });
          hasLoggedConnectionFailure = true;
        }
        scheduleReconnect();
      }
    };

    void connect();

    return () => {
      disposed = true;
      clearReconnectTimer();
      socket?.close();
    };
  }, [channel, enabled]);
}
