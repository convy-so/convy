import { WebSocket } from "ws";
import { AuthenticatedConnection } from "../middleware/auth";
import { getRedisClient, getRedisSubscriber } from "@/lib/redis";

/**
 * WebSocket Handler for Real-Time Presence
 * 
 * Tracks which users are currently active in a workspace or survey.
 * Broadcasts presence updates to all members of the same workspace/survey.
 */

export interface PresenceMessage {
  type: "presence_update" | "user_joined" | "user_left" | "error" | "connected";
  workspaceId: string;
  surveyId?: string;
  users?: Array<{
    userId: string;
    name: string;
    image?: string | null;
    lastActive: number;
  }>;
  user?: {
    userId: string;
    name: string;
    image?: string | null;
  };
}

export class PresenceHandler {
  private ws: WebSocket;
  private userId: string;
  private workspaceId: string;
  private surveyId?: string;
  private isActive: boolean = true;
  private redisClient = getRedisClient();
  private redisSubscriber = getRedisSubscriber();

  constructor(
    connection: AuthenticatedConnection,
    workspaceId: string,
    surveyId?: string
  ) {
    this.ws = connection.ws;
    this.userId = connection.userId;
    this.workspaceId = workspaceId;
    this.surveyId = surveyId;

    this.setupEventHandlers();
  }

  async initialize(): Promise<void> {
    try {
      // 1. Join the presence set in Redis
      await this.updatePresence();

      // 2. Broadcast "joined" event to others
      await this.broadcast({
        type: "user_joined",
        workspaceId: this.workspaceId,
        surveyId: this.surveyId,
        user: {
          userId: this.userId,
          name: "User", // Ideally fetch from DB or session
        }
      });

      // 3. Send initial state to the user
      const users = await this.getActiveUsers();
      this.send({
        type: "connected",
        workspaceId: this.workspaceId,
        surveyId: this.surveyId,
        users
      });

      console.log(`[Presence Handler] User ${this.userId} joined ${this.workspaceId}${this.surveyId ? ` / ${this.surveyId}` : ""}`);
    } catch (error) {
      console.error("[Presence Handler] Initialization error:", error);
      this.ws.close(1011, "Internal server error");
    }
  }

  private async updatePresence(): Promise<void> {
    const key = this.getPresenceKey();
    const score = Date.now();
    await this.redisClient.zadd(key, score, this.userId);
    // Set expiry for the presence set
    await this.redisClient.expire(key, 300); // 5 minutes
  }

  private async getActiveUsers(): Promise<PresenceMessage["users"]> {
    const key = this.getPresenceKey();
    const now = Date.now();
    const threshold = now - 60000; // 1 minute inactivity

    // Clean up stale users
    await this.redisClient.zremrangebyscore(key, 0, threshold);

    const userIds = await this.redisClient.zrange(key, 0, -1);
    
    // In a real app, we'd fetch user details from DB or cache
    return userIds.map(id => ({
      userId: id,
      name: id === this.userId ? "You" : `User ${id.substring(0, 4)}`,
      lastActive: now
    }));
  }

  private getPresenceKey(): string {
    return `presence:${this.workspaceId}${this.surveyId ? `:${this.surveyId}` : ""}`;
  }

  private setupEventHandlers(): void {
    this.ws.on("close", async () => {
      this.isActive = false;
      await this.handleLeave();
    });

    this.ws.on("error", () => {
      this.isActive = false;
    });

    // Keepalive/Heartbeat
    this.ws.on("pong", async () => {
      await this.updatePresence();
    });
  }

  private async handleLeave(): Promise<void> {
    const key = this.getPresenceKey();
    await this.redisClient.zrem(key, this.userId);
    await this.broadcast({
      type: "user_left",
      workspaceId: this.workspaceId,
      surveyId: this.surveyId,
      user: {
        userId: this.userId,
        name: "User"
      }
    });
  }

  private async broadcast(message: PresenceMessage): Promise<void> {
    const channel = `pubsub:presence:${this.workspaceId}`;
    await this.redisClient.publish(channel, JSON.stringify(message));
  }

  private send(message: PresenceMessage): void {
    if (this.isActive && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  async cleanup(): Promise<void> {
    this.isActive = false;
    await this.handleLeave();
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
  }
}
