import { WebSocket } from "ws";
import { AuthenticatedConnection } from "../middleware/auth";
import { getDb } from "@/db";
import { surveys, surveyAnalytics } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * WebSocket Handler for Real-Time Analytics Updates
 *
 * Handles WebSocket connections for analytics pages
 * Subscribes to Redis pub/sub channels for analytics completion events
 * Broadcasts updates to connected clients in real-time
 */

export interface AnalyticsMessage {
  type: "analytics_ready" | "analytics_progress" | "error" | "connected";
  surveyId?: string;
  userId?: string;
  analytics?: {
    overallSummary: string;
    metrics: Record<string, unknown>;
    totalConversations: number;
    averageConversationLength: number;
    lastUpdated: Date | null;
  };
  progress?: number;
  error?: string;
}

export class AnalyticsHandler {
  private ws: WebSocket;
  private userId: string;
  private userRole: string; // Added for Issue 5
  public surveyId: string; // Changed from private for server.ts cleanup access
  private isActive: boolean = true;

  constructor(connection: AuthenticatedConnection, surveyId: string) {
    this.ws = connection.ws;
    this.userId = connection.userId;
    this.userRole = connection.role;
    this.surveyId = surveyId;

    // Set up WebSocket event handlers
    this.setupEventHandlers();
  }

  /**
   * Initialize the analytics handler
   * Verifies survey ownership and sends initial connection confirmation
   */
  async initialize(): Promise<void> {
    try {
      // Verify survey ownership
      const [survey] = await getDb()
        .select()
        .from(surveys)
        .where(eq(surveys.id, this.surveyId));

      if (!survey) {
        this.send({
          type: "error",
          error: "Survey not found",
        });
        this.ws.close(1008, "Survey not found");
        return;
      }

      const { getSurveyAccessLevel } = await import("@/lib/workspace-access");
      const accessLevel = await getSurveyAccessLevel(this.userId, this.surveyId);

      if (accessLevel === "none") {
        this.send({
          type: "error",
          error: "Unauthorized access to survey",
        });
        this.ws.close(1008, "Unauthorized");
        return;
      }

      // Send connection confirmation
      this.send({
        type: "connected",
        surveyId: this.surveyId,
        userId: this.userId,
      });

      // Optionally send current analytics if available
      await this.sendCurrentAnalytics();

      console.log(
        `[Analytics Handler] Initialized for user ${this.userId}, survey ${this.surveyId}`,
      );
    } catch (error) {
      console.error("[Analytics Handler] Initialization error:", error);
      this.send({
        type: "error",
        error: "Failed to initialize analytics connection",
      });
      this.ws.close(1011, "Internal server error");
    }
  }

  /**
   * Send current analytics if available
   */
  private async sendCurrentAnalytics(): Promise<void> {
    try {
      const [analytics] = await getDb()
        .select()
        .from(surveyAnalytics)
        .where(eq(surveyAnalytics.surveyId, this.surveyId));

      if (analytics) {
        this.send({
          type: "analytics_ready",
          surveyId: this.surveyId,
          userId: this.userId,
          analytics: {
            overallSummary: analytics.overallSummary,
            metrics: analytics.metrics,
            totalConversations: analytics.totalConversations,
            averageConversationLength: analytics.averageConversationLength,
            lastUpdated: analytics.lastUpdated,
          },
        });
      }
    } catch (error) {
      console.error(
        "[Analytics Handler] Error fetching current analytics:",
        error,
      );
      // Don't fail initialization if we can't fetch current analytics
    }
  }

  /**
   * Handle incoming analytics update from Redis pub/sub
   */
  handleAnalyticsUpdate(data: {
    surveyId: string;
    userId: string;
    completedAt: string;
  }): void {
    // Only send update if it's for this survey and user
    if (data.surveyId === this.surveyId && data.userId === this.userId) {
      // Fetch fresh analytics from database
      this.sendUpdatedAnalytics();
    }
  }

  /**
   * Fetch and send updated analytics
   */
  private async sendUpdatedAnalytics(): Promise<void> {
    try {
      const [analytics] = await getDb()
        .select()
        .from(surveyAnalytics)
        .where(eq(surveyAnalytics.surveyId, this.surveyId));

      if (analytics) {
        this.send({
          type: "analytics_ready",
          surveyId: this.surveyId,
          userId: this.userId,
          analytics: {
            overallSummary: analytics.overallSummary,
            metrics: analytics.metrics,
            totalConversations: analytics.totalConversations,
            averageConversationLength: analytics.averageConversationLength,
            lastUpdated: analytics.lastUpdated,
          },
        });
      }
    } catch (error) {
      console.error(
        "[Analytics Handler] Error fetching updated analytics:",
        error,
      );
      this.send({
        type: "error",
        error: "Failed to fetch updated analytics",
      });
    }
  }

  /**
   * Set up WebSocket event handlers
   */
  private setupEventHandlers(): void {
    this.ws.on("close", () => {
      this.isActive = false;
      console.log(
        `[Analytics Handler] Connection closed for user ${this.userId}, survey ${this.surveyId}`,
      );
    });

    this.ws.on("error", (error) => {
      console.error(
        `[Analytics Handler] WebSocket error for user ${this.userId}:`,
        error,
      );
      this.isActive = false;
    });

    // Handle ping/pong for keepalive
    this.ws.on("ping", () => {
      if (this.isActive && this.ws.readyState === WebSocket.OPEN) {
        this.ws.pong();
      }
    });
  }

  /**
   * Send message to WebSocket client
   */
  private send(message: AnalyticsMessage): void {
    if (this.isActive && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message));
      } catch (error) {
        console.error("[Analytics Handler] Error sending message:", error);
        this.isActive = false;
      }
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.isActive = false;
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
  }
}
