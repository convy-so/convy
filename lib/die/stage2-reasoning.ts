import { generateText } from "ai";
import { flashLiteModel } from "@/lib/ai";
import { getSubDomainById } from "@/lib/agents/skill-system/registry";
import {
  getDomainCompatibility,
  estimateCombinedDuration,
  areSameFamily,
} from "./domain-config";
import type {
  DomainManifest,
  DomainRef,
  RecommendationType,
  WarningType,
} from "@/lib/agents/skill-system/types";

interface Stage1Candidate {
  domainId: string;
  domainName: string;
  familyId: number;
  similarity: number;
}

const MANIFEST_SCHEMA = `{
  "primaryDomain": {
    "id": "<string: domain ID>",
    "name": "<string: domain name>",
    "familyId": "<number: family ID>",
    "involvementScore": "<number 0.0-1.0>",
    "involvementReason": "<string: explanation>"
  },
  "secondaryDomains": [
    {
      "id": "<string: domain ID>",
      "name": "<string: domain name>",
      "familyId": "<number>",
      "involvementScore": "<number 0.35-0.69>",
      "involvementReason": "<string>",
      "bridgingNodeId": "<string or null>"
    }
  ],
  "coherenceScore": "<number 0.0-1.0>",
  "estimatedSessionMinutes": "<number>",
  "recommendation": "<one of: single-survey, advisory-required, decompose>",
  "warnings": ["<zero or more of: scope-overload, persona-mismatch, respondent-mismatch, insufficient-intent>"],
  "advisoryMessage": "<string or null>",
  "confidence": "<high or low — use low if the intent is ambiguous or candidates are weak>"
}`;

function buildMicroPrompt(
  intentStatement: string,
  candidates: Stage1Candidate[],
  compatContext: string,
): string {
  const candidateList = candidates
    .map((c, i) => {
      const sd = getSubDomainById(c.domainId);
      return `${i + 1}. ID: "${c.domainId}" | Name: "${c.domainName}" | Similarity: ${c.similarity.toFixed(2)}
   Description: ${sd?.description ?? ""}
   Examples: ${sd?.semanticExamples?.slice(0, 3).join("; ") ?? ""}`;
    })
    .join("\n\n");

  return `You are a survey research design specialist. Analyze this client's research intent and classify the relevant domains.

Client intent:
"${intentStatement}"

Candidate domains from semantic search (top ${candidates.length}):
${candidateList}

Domain pair compatibility context:
${compatContext}

Rules:
- Primary domain: score >= 0.70. Exactly ONE primary domain.
- Secondary domains: score 0.35–0.69. Maximum TWO secondary domains.
- If two domains score above 0.70, classify the higher as primary; classify the lower as secondary IF <= 0.85, otherwise flag "decompose".
- Coherence: 0.8+ means domains are naturally co-researched; <0.5 means they are awkward together.
- For estimatedSessionMinutes: use provided duration context.
- recommendation values: "single-survey" | "advisory-required" | "decompose"
- warnings array (can be empty): "scope-overload" (>30 min), "persona-mismatch", "respondent-mismatch", "insufficient-intent"
- If intent is very vague, add "insufficient-intent" warning.
- If no candidate scores above 0.35, pick the top candidate as primary with low confidence note in advisoryMessage.

Output ONLY valid JSON matching this schema:
${MANIFEST_SCHEMA}

No preamble. No explanation. No markdown. Raw JSON only.`;
}

function buildCompatibilityContext(candidates: Stage1Candidate[]): string {
  if (candidates.length < 2) return "Only one candidate — no compatibility check needed.";

  const lines: string[] = [];
  for (let i = 0; i < Math.min(candidates.length, 3); i++) {
    for (let j = i + 1; j < Math.min(candidates.length, 3); j++) {
      const a = candidates[i];
      const b = candidates[j];
      const sameFamily = areSameFamily(a.domainId, b.domainId);
      if (sameFamily) {
        lines.push(`"${a.domainId}" + "${b.domainId}": COMPATIBLE (same family)`);
      } else {
        const compat = getDomainCompatibility(a.domainId, b.domainId);
        lines.push(
          `"${a.domainId}" + "${b.domainId}": ${compat.classification.toUpperCase()} — ${compat.reason}`,
        );
      }
    }
  }

  // Duration context
  const durationLines = candidates
    .slice(0, 3)
    .map((c) => {
      const sd = getSubDomainById(c.domainId);
      return `"${c.domainId}": ~${sd?.defaultDurationMinutes ?? 18} min`;
    });

  const primaryId = candidates[0].domainId;
  const secondaryIds = candidates.slice(1, 3).map((c) => c.domainId);
  const combinedEst = estimateCombinedDuration(primaryId, secondaryIds);

  return [
    "Compatibility:",
    ...lines,
    "",
    "Duration estimates:",
    ...durationLines,
    `Combined estimate (primary + secondaries): ~${combinedEst} min`,
  ].join("\n");
}

/**
 * DIE Stage 2: Focused LLM reasoning over top 5 candidates.
 * Uses flashLiteModel (fast, small context) for sub-700ms completion.
 */
export async function runStage2Reasoning(
  intentStatement: string,
  candidates: Stage1Candidate[],
): Promise<DomainManifest | null> {
  if (candidates.length === 0) return null;

  const compatContext = buildCompatibilityContext(candidates);
  const prompt = buildMicroPrompt(intentStatement, candidates, compatContext);

  try {
    const { text } = await generateText({
      model: flashLiteModel,
      prompt,
      temperature: 0.1, // Low temperature — this is a classification task, not creative
      maxOutputTokens: 800,
    });

    // Strip any markdown fences just in case
    const cleaned = text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    const raw = JSON.parse(cleaned);

    // Validate and normalize
    if (!raw.primaryDomain?.id) {
      return null;
    }

    // Ensure familyId is populated from registry if LLM omits it
    const primarySd = getSubDomainById(raw.primaryDomain.id);
    const manifest: DomainManifest = {
      primaryDomain: {
        id: raw.primaryDomain.id,
        name: raw.primaryDomain.name ?? primarySd?.name ?? raw.primaryDomain.id,
        familyId: raw.primaryDomain.familyId ?? primarySd?.familyId ?? 0,
        involvementScore: Number(raw.primaryDomain.involvementScore ?? 0.85),
        involvementReason: raw.primaryDomain.involvementReason ?? "",
      } satisfies DomainRef,
      secondaryDomains: (raw.secondaryDomains ?? [])
        .filter((s: any) => s?.id)
        .slice(0, 2)
        .map((s: any) => {
          const sd = getSubDomainById(s.id);
          return {
            id: s.id,
            name: s.name ?? sd?.name ?? s.id,
            familyId: s.familyId ?? sd?.familyId ?? 0,
            involvementScore: Number(s.involvementScore ?? 0.5),
            involvementReason: s.involvementReason ?? "",
            bridgingNodeId: s.bridgingNodeId ?? undefined,
          } satisfies DomainRef;
        }),
      coherenceScore: Number(raw.coherenceScore ?? 0.75),
      estimatedSessionMinutes: Number(raw.estimatedSessionMinutes ?? 20),
      recommendation: (raw.recommendation ?? "single-survey") as RecommendationType,
      warnings: (raw.warnings ?? []) as WarningType[],
      advisoryMessage: raw.advisoryMessage ?? null,
      confidence: "high",
    };

    return manifest;
  } catch (err) {
    console.error("[DIE Stage2] Failed to parse LLM output:", err);
    return null;
  }
}
