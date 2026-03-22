import { getRedisClient, getRedisSubscriber } from "./redis";
import { ExpertState, expertStateSchema } from "./schemas/expert-state";
import { cache } from "./cache";

/**
 * Convy V2 Architecture: Expert State Store
 * 
 * Centralized persistence and synchronization for the ExpertState.
 * Uses Redis for high-frequency updates and Pub/Sub for cross-worker coordination.
 */
export class ExpertStateStore {
  private static getKey(surveyId: string): string {
    return `expert_state:${surveyId}`;
  }

  private static getChannel(surveyId: string): string {
    return `expert_state_updates:${surveyId}`;
  }

  /**
   * Retrieves the current ExpertState for a survey.
   */
  static async get(surveyId: string): Promise<ExpertState | null> {
    const key = this.getKey(surveyId);
    const data = await cache.get<any>(key);
    if (!data) return null;

    const parsed = expertStateSchema.safeParse(data);
    return parsed.success ? parsed.data : null;
  }

  /**
   * Updates the ExpertState and broadcasts the change.
   */
  static async update(surveyId: string, update: Partial<ExpertState>): Promise<void> {
    const key = this.getKey(surveyId);
    const currentState = await this.get(surveyId);
    
    if (!currentState) {
      console.warn(`[ExpertStateStore] Cannot update non-existent state for survey ${surveyId}`);
      return;
    }

    const newState = {
      ...currentState,
      ...update,
      telemetry: {
        ...currentState.telemetry,
        lastUpdated: new Date().toISOString()
      }
    };

    // 1. Persist to Redis
    await cache.set(key, newState, 3600 * 24); // 24h TTL

    // 2. Broadcast change via Pub/Sub
    const redis = getRedisClient();
    await redis.publish(this.getChannel(surveyId), JSON.stringify(newState));
  }

  /**
   * Subscribes to changes in a survey's ExpertState.
   */
  static async subscribe(surveyId: string, onUpdate: (state: ExpertState) => void): Promise<() => void> {
    const subscriber = getRedisSubscriber({ fresh: true });
    const channel = this.getChannel(surveyId);

    await subscriber.subscribe(channel);

    subscriber.on("message", (chan, message) => {
      if (chan === channel) {
        try {
          const state = JSON.parse(message);
          onUpdate(state);
        } catch (e) {
          console.error(`[ExpertStateStore] Failed to parse update for ${surveyId}`, e);
        }
      }
    });

    return () => {
      subscriber.unsubscribe(channel);
      subscriber.disconnect();
    };
  }
}
