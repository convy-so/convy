import "server-only";

import { getRedisClient } from "@/lib/redis";

/**
 * Cost Tracking and Monitoring for Voice Features
 * Tracks usage and costs per user/session to optimize spending
 */

export interface CostMetrics {
  sttCost: number; // Speech-to-Text cost
  ttsCost: number; // Text-to-Speech cost
  audioDuration: number; // Total audio processed in milliseconds
  characterCount: number; // Total characters synthesized
  requestCount: number; // Total API requests
  timestamp: number;
}

export interface UserCostSummary {
  userId: string;
  dailyCost: number;
  monthlyCost: number;
  totalRequests: number;
  totalDuration: number; // in minutes
  lastActivity: number;
}

export interface CostAlert {
  type: "user" | "global" | "session";
  threshold: number;
  currentValue: number;
  message: string;
}

/**
 * Cost Tracking Service
 */
export class CostTracker {
  private static readonly KEYS = {
    USER_DAILY: (userId: string, date: string) =>
      `voice:cost:user:${userId}:${date}`,
    USER_MONTHLY: (userId: string, month: string) =>
      `voice:cost:user:${userId}:month:${month}`,
    GLOBAL_DAILY: (date: string) => `voice:cost:global:${date}`,
    GLOBAL_MONTHLY: (month: string) => `voice:cost:global:month:${month}`,
    SESSION: (sessionId: string) => `voice:cost:session:${sessionId}`,
  };

  private static readonly THRESHOLDS = {
    USER_DAILY: 1.0, // $1 per day per user
    USER_MONTHLY: 20.0, // $20 per month per user
    GLOBAL_DAILY: 50.0, // $50 per day globally
    SESSION: 0.5, // $0.50 per session
  };

  /**
   * Track STT cost for a user
   */
  static async trackSTT(
    userId: string,
    cost: number,
    durationMs: number,
    sessionId?: string
  ): Promise<void> {
    const now = new Date();
    const date = now.toISOString().split("T")[0]; // YYYY-MM-DD
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`; // YYYY-MM

    const metrics: Partial<CostMetrics> = {
      sttCost: cost,
      audioDuration: durationMs,
      requestCount: 1,
      timestamp: Date.now(),
    };

    // Track user daily
    await this.incrementMetrics(this.KEYS.USER_DAILY(userId, date), metrics);

    // Track user monthly
    await this.incrementMetrics(this.KEYS.USER_MONTHLY(userId, month), metrics);

    // Track global
    await this.incrementMetrics(this.KEYS.GLOBAL_DAILY(date), metrics);
    await this.incrementMetrics(this.KEYS.GLOBAL_MONTHLY(month), metrics);

    // Track session if provided
    if (sessionId) {
      await this.incrementMetrics(this.KEYS.SESSION(sessionId), metrics);
    }

    // Check thresholds
    await this.checkThresholds(userId, sessionId);
  }

  /**
   * Track TTS cost for a user
   */
  static async trackTTS(
    userId: string,
    cost: number,
    characterCount: number,
    sessionId?: string
  ): Promise<void> {
    const now = new Date();
    const date = now.toISOString().split("T")[0];
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const metrics: Partial<CostMetrics> = {
      ttsCost: cost,
      characterCount,
      requestCount: 1,
      timestamp: Date.now(),
    };

    // Track user daily
    await this.incrementMetrics(this.KEYS.USER_DAILY(userId, date), metrics);

    // Track user monthly
    await this.incrementMetrics(this.KEYS.USER_MONTHLY(userId, month), metrics);

    // Track global
    await this.incrementMetrics(this.KEYS.GLOBAL_DAILY(date), metrics);
    await this.incrementMetrics(this.KEYS.GLOBAL_MONTHLY(month), metrics);

    // Track session if provided
    if (sessionId) {
      await this.incrementMetrics(this.KEYS.SESSION(sessionId), metrics);
    }

    // Check thresholds
    await this.checkThresholds(userId, sessionId);
  }

  /**
   * Increment metrics in Redis
   */
  private static async incrementMetrics(
    key: string,
    metrics: Partial<CostMetrics>
  ): Promise<void> {
    const redis = getRedisClient();
    const pipeline = redis.pipeline();

    if (metrics.sttCost) {
      pipeline.hincrbyfloat(key, "sttCost", metrics.sttCost);
    }

    if (metrics.ttsCost) {
      pipeline.hincrbyfloat(key, "ttsCost", metrics.ttsCost);
    }

    if (metrics.audioDuration) {
      pipeline.hincrby(key, "audioDuration", Math.round(metrics.audioDuration));
    }

    if (metrics.characterCount) {
      pipeline.hincrby(key, "characterCount", metrics.characterCount);
    }

    if (metrics.requestCount) {
      pipeline.hincrby(key, "requestCount", metrics.requestCount);
    }

    pipeline.hset(key, "timestamp", Date.now());

    // Set expiration: 90 days for daily, 2 years for monthly
    const ttl = key.includes(":month:")
      ? 60 * 60 * 24 * 365 * 2
      : 60 * 60 * 24 * 90;
    pipeline.expire(key, ttl);

    await pipeline.exec();
  }

  /**
   * Get user cost summary
   */
  static async getUserCostSummary(userId: string): Promise<UserCostSummary> {
    const now = new Date();
    const date = now.toISOString().split("T")[0];
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const redis = getRedisClient();
    const [dailyMetrics, monthlyMetrics] = await Promise.all([
      redis.hgetall(this.KEYS.USER_DAILY(userId, date)),
      redis.hgetall(this.KEYS.USER_MONTHLY(userId, month)),
    ]);

    const dailyCost =
      parseFloat(dailyMetrics.sttCost || "0") +
      parseFloat(dailyMetrics.ttsCost || "0");
    const monthlyCost =
      parseFloat(monthlyMetrics.sttCost || "0") +
      parseFloat(monthlyMetrics.ttsCost || "0");

    return {
      userId,
      dailyCost,
      monthlyCost,
      totalRequests: parseInt(monthlyMetrics.requestCount || "0"),
      totalDuration: parseInt(monthlyMetrics.audioDuration || "0") / 60000, // Convert to minutes
      lastActivity: parseInt(monthlyMetrics.timestamp || "0"),
    };
  }

  /**
   * Get session cost
   */
  static async getSessionCost(sessionId: string): Promise<number> {
    const redis = getRedisClient();
    const metrics = await redis.hgetall(this.KEYS.SESSION(sessionId));
    const sttCost = parseFloat(metrics.sttCost || "0");
    const ttsCost = parseFloat(metrics.ttsCost || "0");
    return sttCost + ttsCost;
  }

  /**
   * Check cost thresholds and return alerts
   */
  static async checkThresholds(
    userId: string,
    sessionId?: string
  ): Promise<CostAlert[]> {
    const alerts: CostAlert[] = [];

    // Check user daily threshold
    const userSummary = await this.getUserCostSummary(userId);
    if (userSummary.dailyCost > this.THRESHOLDS.USER_DAILY) {
      alerts.push({
        type: "user",
        threshold: this.THRESHOLDS.USER_DAILY,
        currentValue: userSummary.dailyCost,
        message: `User ${userId} has exceeded daily cost threshold: $${userSummary.dailyCost.toFixed(2)}`,
      });
    }

    // Check user monthly threshold
    if (userSummary.monthlyCost > this.THRESHOLDS.USER_MONTHLY) {
      alerts.push({
        type: "user",
        threshold: this.THRESHOLDS.USER_MONTHLY,
        currentValue: userSummary.monthlyCost,
        message: `User ${userId} has exceeded monthly cost threshold: $${userSummary.monthlyCost.toFixed(2)}`,
      });
    }

    // Check session threshold
    if (sessionId) {
      const sessionCost = await this.getSessionCost(sessionId);
      if (sessionCost > this.THRESHOLDS.SESSION) {
        alerts.push({
          type: "session",
          threshold: this.THRESHOLDS.SESSION,
          currentValue: sessionCost,
          message: `Session ${sessionId} has exceeded cost threshold: $${sessionCost.toFixed(2)}`,
        });
      }
    }

    // Log alerts
    if (alerts.length > 0) {
      console.warn("[Cost Tracking] Alerts:", alerts);
    }

    return alerts;
  }

  /**
   * Get global cost summary for today
   */
  static async getGlobalCostToday(): Promise<{
    totalCost: number;
    sttCost: number;
    ttsCost: number;
    requestCount: number;
  }> {
    const date = new Date().toISOString().split("T")[0];
    const redis = getRedisClient();
    const metrics = await redis.hgetall(this.KEYS.GLOBAL_DAILY(date));

    const sttCost = parseFloat(metrics.sttCost || "0");
    const ttsCost = parseFloat(metrics.ttsCost || "0");

    return {
      totalCost: sttCost + ttsCost,
      sttCost,
      ttsCost,
      requestCount: parseInt(metrics.requestCount || "0"),
    };
  }

  /**
   * Calculate potential savings from VAD
   */
  static calculateVADSavings(
    totalAudioDurationMs: number,
    processedAudioDurationMs: number
  ): {
    savingsPercent: number;
    savedCost: number;
    savedDuration: number;
  } {
    const filteredDurationMs = totalAudioDurationMs - processedAudioDurationMs;
    const savingsPercent = (filteredDurationMs / totalAudioDurationMs) * 100;

    // Calculate saved cost for STT (Whisper: $0.006 per minute)
    const savedMinutes = filteredDurationMs / 60000;
    const savedCost = savedMinutes * 0.006;

    return {
      savingsPercent: Math.round(savingsPercent * 100) / 100,
      savedCost,
      savedDuration: filteredDurationMs,
    };
  }

  /**
   * Reset user costs (admin only)
   */
  static async resetUserCosts(userId: string): Promise<void> {
    const now = new Date();
    const date = now.toISOString().split("T")[0];
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const redis = getRedisClient();
    await Promise.all([
      redis.del(this.KEYS.USER_DAILY(userId, date)),
      redis.del(this.KEYS.USER_MONTHLY(userId, month)),
    ]);
  }

  /**
   * Export cost report for a user
   */
  static async exportUserReport(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Array<{ date: string; cost: number; requests: number }>> {
    const report: Array<{ date: string; cost: number; requests: number }> = [];
    const currentDate = new Date(startDate);

    const redis = getRedisClient();
    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split("T")[0];
      const metrics = await redis.hgetall(
        this.KEYS.USER_DAILY(userId, dateStr)
      );

      const sttCost = parseFloat(metrics.sttCost || "0");
      const ttsCost = parseFloat(metrics.ttsCost || "0");
      const requests = parseInt(metrics.requestCount || "0");

      report.push({
        date: dateStr,
        cost: sttCost + ttsCost,
        requests,
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return report;
  }
}

/**
 * Helper function to format cost for display
 */
export function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${(cost * 1000).toFixed(2)}m`; // Show in milli-dollars
  }
  return `$${cost.toFixed(2)}`;
}

/**
 * Helper function to format duration
 */
export function formatDuration(durationMs: number): string {
  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
}
