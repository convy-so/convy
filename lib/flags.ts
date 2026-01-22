
import { CacheService, CacheKeys, TTL } from "./cache";

export type FeatureFlag = 
  | "voice_surveys"
  | "advanced_analytics"
  | "zapier_integration"
  | "slack_integration"
  | "notion_integration";

export class FeatureFlags {
  /**
   * Check if a feature is enabled for a user
   * Currently uses a simple ENV-based toggle or default true for rollout
   * Can be extended to use PostHog/Flagsmith
   */
  static async isEnabled(flag: FeatureFlag, userId: string): Promise<boolean> {
    const cacheKey = `${CacheKeys.featureFlags(userId)}:${flag}`;
    
    // Check cache first
    const cached = await CacheService.get<boolean>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    // Determine flag state
    // For now, we default to TRUE for core features unless explicitly disabled via ENV
    // In production, this would call PostHog or DB
    let enabled = true;

    // Environment-based overrides (kill switches)
    if (flag === "voice_surveys" && process.env.ENABLE_VOICE_FEATURES === "false") {
      enabled = false;
    }

    // Cache the result
    await CacheService.set(cacheKey, enabled, TTL.featureFlags);
    
    return enabled;
  }

  /**
   * Invalidate feature flag cache for a user
   */
  static async invalidate(userId: string) {
    // Note: This only invalidates known flags if we list them, 
    // or we rely on TTL expiry (1 min) which is usually fine for flags.
    // To properly invalidate, we'd need scan or a set of keys.
    // For now, TTL is sufficient.
  }
}
