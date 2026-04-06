import { WebSocket } from "ws";
import { AuthenticatedConnection } from "../middleware/auth";
import { getRedisClient } from "@/lib/redis";
import { getDb } from "@/db";
import { users } from "@/db/schema/auth";
import { eq } from "drizzle-orm";

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
  private memberId: string;
  private workspaceId: string;
  public surveyId?: string;
  private isActive: boolean = true;
  private hasLeft = false;
  private userName = "User";
  private userImage: string | null = null;
  private redisClient = getRedisClient();

  constructor(
    connection: AuthenticatedConnection,
    memberId: string,
    workspaceId: string,
    surveyId?: string
  ) {
    this.ws = connection.ws;
    this.userId = connection.userId;
    this.memberId = memberId;
    this.workspaceId = workspaceId;
    this.surveyId = surveyId;

    this.setupEventHandlers();
  }

  public getSocket(): WebSocket {
    return this.ws;
  }

  async initialize(): Promise<void> {
    try {
      // 1. Fetch user data
      const [userData] = await getDb()
        .select({ name: users.name, image: users.image })
        .from(users)
        .where(eq(users.id, this.userId));

      this.userName = userData?.name || "User";
      this.userImage = userData?.image || null;

      // 2. Join the presence set in Redis with a connection-scoped member id.
      // This preserves presence across multiple tabs from the same user.
      await this.updatePresence();

      // 3. Broadcast initial presence after the connection is registered.
      const activeUsers = await this.getActiveUsers();
      await this.broadcast({
        type: "presence_update",
        workspaceId: this.workspaceId,
        surveyId: this.surveyId,
        users: activeUsers,
      });

      await this.broadcast({
        type: "user_joined",
        workspaceId: this.workspaceId,
        surveyId: this.surveyId,
        user: {
          userId: this.userId,
          name: this.userName,
          image: this.userImage,
        }
      });

      // 4. Send initial state to the user
      this.send({
        type: "connected",
        workspaceId: this.workspaceId,
        surveyId: this.surveyId,
        users: activeUsers
      });

    } catch (error) {
      console.error("[presence] failed to initialize connection", {
        workspaceId: this.workspaceId,
        surveyId: this.surveyId,
        message: error instanceof Error ? error.message : "Unknown error",
      });
      this.ws.close(1011, "Internal server error");
    }
  }

  private async updatePresence(): Promise<void> {
    const key = this.getPresenceKey();
    const score = Date.now();
    const memberMetadataKey = this.getPresenceMemberMetadataKey();

    await this.redisClient.hset(
      memberMetadataKey,
      "userId", this.userId,
      "name", this.userName,
      "image", this.userImage || "",
      "lastActive", String(score),
    );
    await this.redisClient.expire(memberMetadataKey, 300);
    await this.redisClient.zadd(key, score, this.memberId);
    // Set expiry for the presence set
    await this.redisClient.expire(key, 300); // 5 minutes
  }

  private async getActiveUsers(): Promise<PresenceMessage["users"]> {
    const key = this.getPresenceKey();
    const now = Date.now();
    const threshold = now - 60000; // 1 minute inactivity

    // Clean up stale users
    await this.redisClient.zremrangebyscore(key, 0, threshold);

    const memberIds = await this.redisClient.zrange(key, 0, -1);
    const activeUsers = new Map<string, NonNullable<PresenceMessage["users"]>[number]>();
    
    // Fetch metadata for all active connections, then collapse to unique users.
    await Promise.all(
      memberIds.map(async (memberId) => {
        const meta = await this.redisClient.hgetall(
          this.getPresenceMemberMetadataKey(memberId),
        );
        const userId = meta.userId;
        if (!userId) {
          return;
        }

        const candidate = {
          userId,
          name: meta.name || `User ${userId.substring(0, 4)}`,
          image: meta.image || null,
          lastActive:
            meta.lastActive && !Number.isNaN(Number(meta.lastActive))
              ? Number(meta.lastActive)
              : now,
        };

        const existing = activeUsers.get(userId);
        if (!existing || candidate.lastActive >= existing.lastActive) {
          activeUsers.set(userId, candidate);
        }
      }),
    );

    return Array.from(activeUsers.values());
  }

  private getPresenceKey(): string {
    return `presence:${this.workspaceId}${this.surveyId ? `:${this.surveyId}` : ""}`;
  }

  private getPresenceMemberMetadataKey(memberId: string = this.memberId): string {
    return `presence:member:${memberId}`;
  }

  private getPresenceChannel(): string {
    return `pubsub:presence:${this.workspaceId}${this.surveyId ? `:${this.surveyId}` : ""}`;
  }

  public matchesScope(workspaceId: string, surveyId?: string): boolean {
    return this.workspaceId === workspaceId && this.surveyId === surveyId;
  }

  private setupEventHandlers(): void {
    this.ws.on("close", async () => {
      this.isActive = false;
      await this.handleLeave();
    });

    this.ws.on("error", () => {
      this.isActive = false;
    });

    this.ws.on("message", async (raw) => {
      try {
        const data = JSON.parse(String(raw));
        if (
          typeof data === "object" &&
          data !== null &&
          "type" in data &&
          data.type === "heartbeat"
        ) {
          await this.updatePresence();
        }
      } catch {
        // Ignore malformed presence messages from the client.
      }
    });

    // Keepalive/Heartbeat
    this.ws.on("pong", async () => {
      await this.updatePresence();
    });
  }

  private async handleLeave(): Promise<void> {
    if (this.hasLeft) {
      return;
    }
    this.hasLeft = true;

    const key = this.getPresenceKey();
    await this.redisClient.zrem(key, this.memberId);
    await this.redisClient.del(this.getPresenceMemberMetadataKey());

    const activeUsers = await this.getActiveUsers();
    await this.broadcast({
      type: "presence_update",
      workspaceId: this.workspaceId,
      surveyId: this.surveyId,
      users: activeUsers,
    });
    await this.broadcast({
      type: "user_left",
      workspaceId: this.workspaceId,
      surveyId: this.surveyId,
      user: {
        userId: this.userId,
        name: this.userName,
        image: this.userImage,
      }
    });
  }

  private async broadcast(message: PresenceMessage): Promise<void> {
    await this.redisClient.publish(this.getPresenceChannel(), JSON.stringify(message));
  }

  public send(message: PresenceMessage): void {
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

