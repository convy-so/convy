import { retrieveCandidateDomains } from "./stage1-retrieval";
import { runStage2Reasoning } from "./stage2-reasoning";
import { getSubDomainById } from "@/lib/agents/skill-system/registry";
import type { DomainManifest } from "@/lib/agents/skill-system/types";

const DIE_TIMEOUT_MS = 1400; // Enforce < 1500ms budget

/**
 * Build a minimal fallback manifest from the top Stage 1 candidate.
 * Used when Stage 2 LLM call fails or times out.
 */
function buildFallbackManifest(
  domainId: string,
  domainName: string,
  familyId: number,
): DomainManifest {
  const sd = getSubDomainById(domainId);
  return {
    primaryDomain: {
      id: domainId,
      name: domainName,
      familyId,
      involvementScore: 0.75,
      involvementReason: "Fallback: highest semantic similarity match",
    },
    secondaryDomains: [],
    coherenceScore: 0.7,
    estimatedSessionMinutes: sd?.defaultDurationMinutes ?? 20,
    recommendation: "single-survey",
    warnings: [],
    advisoryMessage:
      "The system could not fully classify this intent — the creation agent will ask broader discovery questions to refine the research scope.",
    confidence: "low",
  };
}

/**
 * Full DIE pipeline with timing budget and fallback.
 *
 * Steps:
 * 1. Stage 1: Embed intent + pgvector similarity → top 5 candidates (<100ms)
 * 2. Stage 2: Focused LLM reasoning → DomainManifest (<700ms)
 * 3. Fallback: if Stage 2 fails → minimal manifest from top Stage 1 result
 *
 * Total target: < 1,400ms (1,500ms spec budget with 100ms headroom)
 */
export async function classifyIntent(
  intentStatement: string,
): Promise<DomainManifest> {
  const startTime = Date.now();

  // console.log(`[DIE] Classifying intent: "${intentStatement.slice(0, 80)}..."`);

  // Wrap entire pipeline in timeout race
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("DIE timeout")), DIE_TIMEOUT_MS),
  );

  try {
    const manifest = await Promise.race([
      runPipeline(intentStatement),
      timeout,
    ]);
    /*
    console.log(
      `[DIE] Classification complete in ${elapsed}ms. Primary: ${manifest.primaryDomain.id} | Confidence: ${manifest.confidence}`,
    );
    */
    return manifest;
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.warn(`[DIE] Pipeline failed after ${elapsed}ms, using fallback:`, err);

    // This should not happen often — only if both stages fail or timeout
    const fallbackId = "cx-nps-loyalty"; // Most generic domain as last resort
    const fallbackSd = getSubDomainById(fallbackId)!;
    return buildFallbackManifest(fallbackId, fallbackSd.name, fallbackSd.familyId);
  }
}

async function runPipeline(intentStatement: string): Promise<DomainManifest> {
  // Stage 1
  let candidates: Awaited<ReturnType<typeof retrieveCandidateDomains>>;
  try {
    candidates = await retrieveCandidateDomains(intentStatement, 5);
    /*
    console.log(
      `[DIE Stage1] Top candidates: ${candidates.map((c) => `${c.domainId}(${c.similarity.toFixed(2)})`).join(", ")}`,
    );
    */
  } catch (stage1Err) {
    console.error("[DIE Stage1] Failed:", stage1Err);
    candidates = [];
  }

  // If Stage 1 returned no candidates, try Stage 2 with a generic fallback
  if (candidates.length === 0) {
    // console.warn("[DIE Stage1] No candidates found — using last-resort fallback");
    const fallbackId = "cx-nps-loyalty";
    const sd = getSubDomainById(fallbackId)!;
    return buildFallbackManifest(fallbackId, sd.name, sd.familyId);
  }

  // Stage 2
  try {
    const manifest = await runStage2Reasoning(intentStatement, candidates);
    if (manifest) return manifest;
  } catch (stage2Err) {
    console.error("[DIE Stage2] Failed:", stage2Err);
  }

  // Stage 2 failed — fall back to top Stage 1 result
  const top = candidates[0];
  // console.warn(`[DIE] Stage2 failed. Falling back to Stage1 top: ${top.domainId}`);
  return buildFallbackManifest(top.domainId, top.domainName, top.familyId);
}
