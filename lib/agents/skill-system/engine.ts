import fs from "fs";
import path from "path";
import { UnifiedSkill, SubDomain } from "./types";
import { getSubDomainById, matchSubDomain, getFamilyById, SUB_DOMAINS, matchHybridSubDomains } from "./registry";
import { generateText } from "ai";
import { flashLiteModel } from "@/lib/ai";

export class SkillEngine {
  private static readonly SKILLS_DIR = path.join(process.cwd(), ".agent", "skills");

  /**
   * Match subdomains using vector similarity search against the domain registry
   */
  static async semanticMatch(query: string): Promise<{ subDomain: SubDomain; weight: number }[]> {
    try {
      const { generateEmbedding } = await import("@/lib/rag/embeddings");
      const { getDb } = await import("@/db");
      const db = getDb();
      const { domainEmbeddings } = await import("@/db/schema/domain-embeddings");
      const { sql, desc } = await import("drizzle-orm");

      const queryEmbedding = await generateEmbedding(query);
      const embeddingSql = `[${queryEmbedding.join(",")}]`;

      // Perform vector similarity search
      const matches = await db
        .select({
          domainId: domainEmbeddings.domainId,
          similarity: sql<number>`1 - (${domainEmbeddings.embedding} <=> ${embeddingSql}::vector)`,
        })
        .from(domainEmbeddings)
        .where(sql`${domainEmbeddings.embedding} <=> ${embeddingSql}::vector < 0.4`) // Threshold for relevance
        .orderBy(t => desc(t.similarity))
        .limit(3);

      const results: { subDomain: SubDomain; weight: number }[] = [];

      for (const match of matches) {
        const sd = getSubDomainById(match.domainId);
        if (sd) {
          // Normalize similarity to a weight (e.g., 0.6 to 1.0 range usually for good matches)
          results.push({ subDomain: sd, weight: Math.min(1.0, match.similarity * 1.2) });
        }
      }

      if (results.length === 0) {
        console.log("[SkillEngine] Vector search returned no matches, falling back to keywords");
        return matchHybridSubDomains(query);
      }

      return results;
    } catch (error) {
      console.warn("[SkillEngine] Vector match failed, falling back to keywords:", error);
      return matchHybridSubDomains(query);
    }
  }

  /**
   * Synthesize multiple skills into a single coherent Hybrid Protocol
   */
  static async synthesizeProtocol(
    skills: { skill: UnifiedSkill; weight: number }[],
    role: string
  ): Promise<string> {
    if (skills.length === 0) return "";
    if (skills.length === 1) return skills[0].skill.content;

    const primary = skills[0];
    const secondaries = skills.slice(1);

    const systemPrompt = `You are an Expert Protocol Synthesizer. You merge multiple specialized research protocols into a single, coherent "Hybrid Protocol" for a ${role} specialist.
    
    Rules for Synthesis:
    1. PRIMARY IDENTITY: Use the persona, tone, and identity of the primary domain: ${primary.skill.id}.
    2. PROTOCOL MERGE: Subsume and union all probe libraries, checklists, and success criteria.
    3. CONFLICT RESOLUTION: If instructions conflict, the weighted Primary domain (${primary.weight}) always wins.
    4. STRUCTURE: Output in XML sections (<persona>, <probe_library>, <success_criteria>, etc.).
    5. FLOW: Ensure the hybrid result feels like one expert speaking, not a list of distinct blocks.
    6. WEIGHTING: Influence themes and probes based on weights (Primary: ${primary.weight}, Secondaries: ${secondaries.map(s => `${s.skill.id}:${s.weight}`).join(", ")}).`;

    const prompt = `Merge these protocols into a production-ready hybrid skill:\n\n` + 
      skills.map((s, i) => `[${i === 0 ? "PRIMARY" : "SECONDARY"}] ID: ${s.skill.id} | Weight: ${s.weight}\nContent:\n${s.skill.content}`).join("\n\n---\n\n");

    try {
      const { text } = await generateText({
        model: flashLiteModel,
        system: systemPrompt,
        prompt,
      });

      return text;
    } catch (error) {
      console.warn("[SkillEngine] Synthesis failed, falling back to concatenation:", error);
      return skills.map(s => s.skill.content).join("\n\n---\n\n");
    }
  }

  /**
   * Load the role-specific skill content for a subdomain
   */
  static async loadSkill(
    subDomainId: string, 
    role: "creation" | "conducting" | "analytics"
  ): Promise<UnifiedSkill | null> {
    const subDomain = getSubDomainById(subDomainId);
    if (!subDomain) return null;

    const family = getFamilyById(subDomain.familyId);
    if (!family) return null;

    const skillPath = path.join(this.SKILLS_DIR, family.familyFolder, `${subDomainId}-${role}.md`);

    if (!fs.existsSync(skillPath)) {
      console.warn(`[SkillEngine] Skill file not found: ${skillPath}`);
      return null;
    }

    try {
      const content = fs.readFileSync(skillPath, "utf-8");
      const nodes = this.parseCoverageModel(content);
      return {
        id: subDomainId,
        content: content.replace(/---[\s\S]*?---/, "").trim(),
        nodes,
      };
    } catch (error) {
      console.error(`[SkillEngine] Error loading skill ${subDomainId}:`, error);
      return null;
    }
  }

  /**
   * Extract key data structures (Checklist/Nodes) from the skill markdown
   * Specifically parses Section 4: Coverage Model tables
   */
  static parseCoverageModel(markdown: string): { id: string, label: string, priority: number }[] {
    const nodes: { id: string, label: string, priority: number }[] = [];
    
    // Flexible match for Coverage Model section (Section 4 or named variations)
    const sectionMatch = markdown.match(/(?:## (?:Section 4: )?Coverage Model(?: Specifications)?)([\s\S]*?)(?:## Section 5|## Decision Map|## Constitutional|$)/i);
    if (!sectionMatch) return nodes;

    const lines = sectionMatch[1].split("\n");
    let isHeader = true;
    for (const line of lines) {
      if (line.includes("|") && !line.includes("---")) {
        const parts = line.split("|").map(p => p.trim()).filter(p => p !== "");
        if (parts.length < 2) continue;

        const id = parts[0];
        // Only process if ID looks like a Node ID (e.g., RT-01)
        if (!/^[A-Z]{2}-\d+$/.test(id)) {
          if (id.toLowerCase() !== "node id" && id.toLowerCase() !== "node") isHeader = false;
          continue;
        }

        // Logic for different table structures:
        // Conducting: | Node ID | Focus Area | Probes | Priority | Success |
        // Creation:   | Node | Weight | Threshold | Description |
        let label = "";
        let priority = 0.5;

        if (parts.length >= 4 && (parts[3].includes(".") || !isNaN(parseFloat(parts[3])))) {
          // Likely Conducting structure
          label = parts[1].replace(/\*\*/g, "");
          priority = parseFloat(parts[3]) || 0.5;
        } else if (parts.length >= 4) {
          // Likely Creation structure or other
          label = parts[3].replace(/\*\*/g, "").split("(")[0].trim(); // Use description as label
          const weightStr = parts[1].replace("%", "");
          priority = (parseFloat(weightStr) / 100) || 0.5;
        } else {
          label = parts[1].replace(/\*\*/g, "");
        }

        nodes.push({ id, label, priority });
      }
    }
    return nodes;
  }

  /**
   * Match a subdomain from a natural language description (legacy compatibility)
   */
  static match(query: string): SubDomain | null {
    return matchSubDomain(query);
  }
}
