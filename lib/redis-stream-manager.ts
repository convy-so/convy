import { Redis } from "ioredis";
import { getRedisClient } from "./redis";

export interface StreamEvent {
  id: string;
  data: Record<string, any>;
}

export class RedisStreamManager {
  private redis: Redis;

  constructor(redisClient?: Redis) {
    this.redis = redisClient || getRedisClient();
  }

  public get client(): Redis {
    return this.redis;
  }

  /**
   * Append an event to a stream.
   * Returns the auto-generated ID of the event (e.g. "1626435000000-0").
   */
  async appendEvent(
    streamKey: string,
    data: Record<string, any>,
    maxLen: number = 1000,
  ): Promise<string> {
    const serializedData: string[] = [];
    for (const [key, value] of Object.entries(data)) {
      serializedData.push(key);
      serializedData.push(
        typeof value === "string" ? value : JSON.stringify(value),
      );
    }

    // XADD key MAXLEN ~ maxLen * serializedData
    // We use "~" for approximate capping to improve performance
    const messageId = await this.redis.xadd(
      streamKey,
      "MAXLEN",
      "~",
      maxLen,
      "*",
      ...serializedData,
    );
    if (!messageId) throw new Error("Failed to append event to Redis stream");
    return messageId;
  }

  /**
   * Read events from a stream starting after a specific ID.
   * Use "0" to read from the beginning or "$" to read only new messages.
   */
  async readEvents(
    streamKey: string,
    lastId: string = "0",
    count: number = 100,
  ): Promise<StreamEvent[]> {
    try {
      const results = await this.redis.xread(
        "COUNT",
        count,
        "STREAMS",
        streamKey,
        lastId,
      );

      if (!results || results.length === 0) return [];

      const [_key, messages] = results[0];
      return messages.map(([id, fields]) => {
        const data: Record<string, any> = {};
        for (let i = 0; i < fields.length; i += 2) {
          const key = fields[i];
          const value = fields[i + 1];
          try {
            data[key] = JSON.parse(value);
          } catch {
            data[key] = value;
          }
        }
        return { id, data };
      });
    } catch (error) {
      console.error(`[RedisStreamManager] Error reading from ${streamKey}:`, error);
      return [];
    }
  }

  /**
   * Get the latest message ID from a stream.
   */
  async getLatestId(streamKey: string): Promise<string> {
    const results = await this.redis.xrevrange(streamKey, "+", "-", "COUNT", 1);
    if (!results || results.length === 0) return "0";
    return results[0][0];
  }
}
