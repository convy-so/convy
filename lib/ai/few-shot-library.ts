import { getDb } from "@/db";
import { fewShotExamples } from "@/db/schema/ai";
import { and, eq, sql } from "drizzle-orm";
import type { PromptExample } from "@/lib/ai-core/types";

export interface GetDynamicExamplesOptions {
  feature: string;
  limit?: number;
  tags?: string[];
}

/**
 * Retrieves dynamic few-shot examples from the database to improve model performance
 * based on the current context (`feature` and optional `tags`).
 *
 * Designed for failure: If the database query fails (e.g., transient network issue,
 * table not pushed), it catches the error and returns an empty array, ensuring the
 * critical AI generation path does not crash.
 */
export async function getDynamicFewShotExamples({
  feature,
  limit = 3,
  tags = [],
}: GetDynamicExamplesOptions): Promise<PromptExample[]> {
  try {
    const db = getDb();
    
    const conditions = [
      eq(fewShotExamples.feature, feature),
      eq(fewShotExamples.isActive, true),
    ];
    
    if (tags.length > 0) {
      // Create a condition to check if the tags array overlaps with the requested tags
      // USING PostgreSQL array overlap operator `&&` 
      // Ensure we convert the tags to a valid postgres array literal
      const formattedTags = tags.map(t => `"${t.replace(/"/g, '""')}"`).join(',');
      conditions.push(sql`${fewShotExamples.tags} && '{${sql.raw(formattedTags)}}'::text[]`);
    }

    const results = await db
      .select({
        content: fewShotExamples.content,
      })
      .from(fewShotExamples)
      .where(and(...conditions))
      .orderBy(sql`RANDOM()`) // Add simple shuffle for variation; could also sort by priority
      .limit(limit);

    return results.map(r => r.content as PromptExample);
  } catch (error) {
    // Build for failure: log silently or to APM, and return [] to gracefully degrade
    console.error(`Failed to fetch dynamic examples for feature ${feature}`, error);
    return [];
  }
}
