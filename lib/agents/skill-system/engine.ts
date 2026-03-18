import fs from "fs";
import path from "path";
import { UnifiedSkill, SubDomain } from "./types";
import { getSubDomainById, matchSubDomain, getFamilyById, SUB_DOMAINS, matchHybridSubDomains } from "./registry";
import { generateText } from "ai";
import { flashLiteModel } from "@/lib/ai";

export class SkillEngine {
  private static readonly SKILLS_DIR = path.join(process.cwd(), ".agent", "skills");

  /**
   * Match subdomains using semantic LLM classification with a keyword fallback
   */
  static async semanticMatch(query: string): Promise<{ subDomain: SubDomain; weight: number }[]> {
    const domains = SUB_DOMAINS.map(sd => ({
      id: sd.id,
      name: sd.name,
      description: sd.description,
    }));

    const systemPrompt = `You are a research domain classification expert. Identify the most relevant specialized domains for a survey objective.
    
    A survey can span multiple domains (Hybrid). Provide a "Weight" (0.0 to 1.0) for each identified domain. 
    Total weight does NOT need to sum to 1.0; each weight reflects how much that domain's protocols are needed.
    
    Available Domains:
    ${JSON.stringify(domains, null, 2)}
    
    Output Format (JSON only):
    [{ "id": "domain-id", "weight": 0.8, "reasoning": "..." }]`;

    try {
      const { text } = await generateText({
        model: flashLiteModel,
        system: systemPrompt,
        prompt: `Objective: "${query}"`,
      });

      // Clean result (sometimes models add markdown blocks)
      const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
      const raw = JSON.parse(cleaned);
      const results: { subDomain: SubDomain; weight: number }[] = [];

      for (const item of raw) {
        const sd = getSubDomainById(item.id);
        if (sd && item.weight > 0.3) {
          results.push({ subDomain: sd, weight: item.weight });
        }
      }

      if (results.length === 0) return matchHybridSubDomains(query);
      return results.sort((a, b) => b.weight - a.weight);
    } catch (error) {
      console.warn("[SkillEngine] semanticMatch failed, falling back to keywords:", error);
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
      return {
        id: subDomainId,
        content: content.replace(/---[\s\S]*?---/, "").trim(),
      };
    } catch (error) {
      console.error(`[SkillEngine] Error loading skill ${subDomainId}:`, error);
      return null;
    }
  }

  /**
   * Match a subdomain from a natural language description (legacy compatibility)
   */
  static match(query: string): SubDomain | null {
    return matchSubDomain(query);
  }
}
