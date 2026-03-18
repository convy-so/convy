import { AgentContext, ChecklistItem, SpecialistChecklist } from "./types";
import { searchKnowledgeBase } from "@/lib/rag/search";
import { rerankResults } from "@/lib/rag/reranker";
import { SurveyConfig } from "@/lib/prompts";
import { SkillEngine } from "./skill-system/engine";
import { SUB_DOMAINS } from "./skill-system/registry";
import { ExpertStateStore } from "@/lib/expert-state-store";
import { ExpertState } from "@/lib/schemas/expert-state";
import { getRedisClient } from "@/lib/redis";

// Intelligence Engines (V2 Architecture)
import { psychologicalEngine } from "@/lib/psychology";
import { domainBrain } from "@/lib/domain-brain";
import { probeEngine } from "@/lib/probe-engine";
import { MemoryBridge } from "@/lib/memory-bridge";

const PRELOAD_CACHE_TTL_SECONDS = 300; // 5 minutes

export abstract class BaseSpecialistAgent {
  protected role: string;
  protected context: AgentContext;

  constructor(role: string, context: AgentContext) {
    this.role = role;
    this.context = context;
  }

  async initialize(): Promise<void> {
    console.log(
      `[BaseAgent] initialize: Role=${this.role}. SID=${this.context.surveyConfig?.id || "none"}. Domain=${this.context.surveyConfig?.domainId || "none"}`,
    );
    if (this.context.surveyConfig?.domainId) {
      // Find subdomain by ID (e.g., 'cx-nps-loyalty')
      // Note: surveyConfig.domainId currently stores a number (Family ID).
      // We need to resolve which subdomain within that family was selected.
      // For now, if it's a number, we'll use it as a hint for matching.
      
      const surveyDescription = [
        this.context.surveyConfig.coreObjective,
        this.context.surveyConfig.expertState?.objective?.goal,
        this.context.surveyConfig.expertState?.objective?.subjectDescription,
      ].filter(Boolean).join(" ");

      const phaseMap: Record<string, "creation" | "conducting" | "analytics"> = {
        creation: "creation",
        conducting: "conducting",
        analytics: "analytics",
      };
      const phase = phaseMap[this.role] || "creation";

      // V2 GENIUS: Semantic Hybrid Matching
      const matchedSubDomains = await SkillEngine.semanticMatch(surveyDescription);
      
      if (matchedSubDomains.length > 0) {
        // Load all skills for synthesis
        const skillEntries: { skill: import("./skill-system/types").UnifiedSkill; weight: number }[] = [];
        for (const match of matchedSubDomains) {
          const skill = await SkillEngine.loadSkill(match.subDomain.id, phase);
          if (skill) {
            skillEntries.push({ skill, weight: match.weight });
          }
        }

        if (skillEntries.length > 0) {
          // Synthesize hybrid protocol
          const synthesizedContent = await SkillEngine.synthesizeProtocol(skillEntries, this.role);
          
          this.context.loadedDomainSkills = {
            domainName: matchedSubDomains.map(m => m.subDomain.name).join(" + "),
            coreContent: synthesizedContent,
            surveyTypeContent: "",
            matchedSurveyType: matchedSubDomains[0].subDomain.id,
            hybridDomains: matchedSubDomains.map(m => ({ id: m.subDomain.id, weight: m.weight }))
          };
          
          console.log(`[BaseAgent] Hybrid Protocol Synthesized: ${this.context.loadedDomainSkills.domainName}`);
        }
      }
    }
  }

  abstract buildSystemPrompt(): string;

  abstract getTools(): any;

  protected abstract buildChecklist(config: SurveyConfig): SpecialistChecklist;

  protected getSpecialistIdentity(): string {
    return `${this.role} Specialist`;
  }

  protected makeChecklistItem(
    id: string,
    description: string,
    status: ChecklistItem["status"] | boolean = "pending",
  ): ChecklistItem {
    const finalStatus =
      typeof status === "boolean" ? (status ? "met" : "pending") : status;
    return { id, description, status: finalStatus };
  }

  protected getChecklistSection(): string {
    if (!this.context.surveyConfig) return "";
    const checklist = this.buildChecklist(this.context.surveyConfig);
    return `
<success_criteria>
You are bound by a "Measurement Contract." To succeed, you must satisfy these criteria.

REQUIRED (Contractual):
${checklist.required.map((i) => `• [${i.status.toUpperCase()}] ID: ${i.id} | ${i.description}`).join("\n")}

ASPIRATIONAL (Excellence):
${checklist.aspirational.map((i) => `• [${i.status.toUpperCase()}] ID: ${i.id} | ${i.description}`).join("\n")}

CRITICAL OPERATIONAL RULES:
1. Every turn MUST begin with a 'think_and_respond' call.
2. Use 'internal_reasoning' to audit your progress against the REQUIRED IDs above.
3. Put your conversational response in 'message_to_user'. This is the ONLY text that will be shown to the participant.
4. Once a REQUIRED item is fully met, mark it as 'met' in your next state_update.
</success_criteria>
    `.trim();
  }

  protected getConstitutionalConstraints(): string {
    const languageNames: Record<string, string> = {
      en: "English",
      fr: "French",
      de: "German",
      es: "Spanish",
      it: "Italian",
    };
    const targetLang = this.context.language || "en";
    const targetLangName = languageNames[targetLang] || "English";

    return `
<output_language_enforcement>
1. MANDATORY: You must ONLY speak in ${targetLangName}.
2. NO CODE: Never output raw markdown code blocks unless explicitly requested.
3. UNSUPPORTED LANGUAGE: If the participant provides input in a language other than [English, French, German, Spanish, Italian], you MUST respond in ${targetLangName} with: "I apologize, but I am only able to assist you in English, French, German, Spanish, or Italian. Could we please continue in ${targetLangName}?" (Translate this refusal into ${targetLangName}).
4. PIVOT: After the refusal, immediately try to pivot back to the last valid topic in ${targetLangName}.
</output_language_enforcement>

<constitutional_constraints>
1. MINIMAL FOOTPRINT: Prefer the shortest effective path to the next data point. Do not ramble.
2. EMOTIONAL CALIBRATION: Acknowledge participant sentiment specifically before pivoting to the next question.
3. GROUNDING ENFORCEMENT: Never assume a metric or topic is satisfied without a direct participant quote or clear evidence.
4. ONE AT A TIME: Ask exactly ONE question per turn. Never double-barrel questions.
5. NO HALLUCINATION: If a participant asks about product features or company policies not in your <knowledge_context>, do not guess. State that you are a researcher focused on their feedback.
6. TOOL PRECEDENCE: Tool calculations and state updates are your source of truth for "progress," not your own memory.
</constitutional_constraints>
    `.trim();
  }

  protected getGlobalArchitectureRules(): string {
    return `
<architecture_rules>
You operate under a Role-Goal-Constraint (RGC) framework:
- IDENTITY: Your defined role and domain expertise.
- OBJECTIVE: The specific survey goal and metric contract.
- CONSTRAINTS: Hard rules and constitutional principles.

Always prioritize Objective > Identity > Constraints. If a domain skill suggests a behavior that contradicts the core survey goal, the goal wins.
</architecture_rules>
    `.trim();
  }

  // ── V2 Intelligence Helpers ──────────────────────────────────────────────

  protected getPrunedStateSection(): string {
    const state = this.context.expertState;
    if (!state) return "";

    const prunedState = MemoryBridge.pruneExpertState(state);
    const omittedSummary = MemoryBridge.summarizeOmittedNodes(state);

    return `
<expert_state_pruned>
${JSON.stringify(prunedState, null, 2)}
</expert_state_pruned>

<omitted_topics_summary>
${omittedSummary}
</omitted_topics_summary>
    `.trim();
  }

  protected getAdaptationHintsSection(): string {
    const state = this.context.expertState;
    if (!state) return "";

    const strategy = probeEngine.selectStrategy(state);
    const nextTopic = domainBrain.getNextPriorityTopic(state);
    const hint = probeEngine.generateAdaptationHint(strategy, nextTopic?.label || "the research objective");

    return `
<adaptation_hints>
1. PSYCHOLOGICAL: ${psychologicalEngine.getEngagementSummary(state)}
2. PENDING_TOPICS: ${domainBrain.getPendingTopics(state).map((t) => t.label).join(", ") || "None"}
3. NEXT_PRIORITY: ${nextTopic?.label ?? "Wrap up"}
4. PROBE_STRATEGY: ${strategy.toUpperCase()}
5. ADAPTATION_HINT: ${hint}
</adaptation_hints>
    `.trim();
  }

  // ── RAG: General knowledge context ─────────────────────────────────────────

  protected getKnowledgeSection(): string {
    if (!this.context.knowledgeContext && !this.context.ragContext) return "";
    let section = "<knowledge_context>\n";
    if (this.context.knowledgeContext) {
      section += `Context provided by previous turns:\n${this.context.knowledgeContext}\n\n`;
    }
    if (this.context.ragContext) {
      section += `Retrieved knowledge:\n${this.context.ragContext}\n`;
    }
    section += "</knowledge_context>";
    return section;
  }

  protected async enrichWithKnowledge(
    query: string,
    limit: number = 3,
  ): Promise<void> {
    try {
      const kbResults = await searchKnowledgeBase(
        query,
        limit,
        undefined,
        (this.context.language as any) || "en",
      );
      if (kbResults.length === 0) return;
      const reranked = await rerankResults(
        query,
        kbResults.map((r) => r.content),
      );
      const knowledge = reranked
        .map((r, i) => `[Fact ${i + 1}]: ${r.item}`)
        .join("\n\n");
      this.context.ragContext =
        (this.context.ragContext || "") + "\n" + knowledge;
    } catch (error) {
      console.warn(`[BaseSpecialistAgent] RAG enrichment failed:`, error);
    }
  }

  // ── Expert State Persistence ─────────────────────────────────────────────

  protected async saveExpertState(update: Partial<ExpertState>): Promise<void> {
    const surveyId = this.context.surveyConfig?.id;
    if (!surveyId) return;

    try {
      await ExpertStateStore.update(surveyId, update);
      console.log(`[BaseSpecialistAgent] ExpertState saved for survey ${surveyId}`);
    } catch (error) {
      console.error(`[BaseSpecialistAgent] Failed to save ExpertState:`, error);
    }
  }

  // ── Skills ──────────────────────────────────────────────────────────────────

  protected getSkillsSection(): string {
    return this.context.skillsMetadata || "";
  }

  public async preloadSkills(): Promise<void> {
    console.log("[BaseAgent] preloadSkills: starting...");
    try {
      const redis = getRedisClient();
      const cacheKey = "agent:skills-metadata";

      // Check Redis cache first — skills list rarely changes
      const cached = await redis.get(cacheKey).catch(() => null);
      if (cached) {
        console.log("[BaseSpecialistAgent] preloadSkills: cache hit");
        this.context.skillsMetadata = cached;
        return;
      }

      const skills = SUB_DOMAINS;
      if (skills.length === 0) return;

      const formatted = skills
        .map(
          (s: any) =>
            `• ID: ${s.id} | Name: ${s.name} | Description: ${s.description}`,
        )
        .join("\n");

      const metadata = `
<available_skills>
You have access to the following specialized skills. These are "Expert Protocols" you can apply to handle specific conversation scenarios.
To use a skill, call the 'loadSkill' tool with its ID to get detailed instructions.

${formatted}

Rules for Skills:
1. ONLY load a skill if the specific trigger condition in its description is met.
2. Once loaded, strictly follow the skill's instructions until the situation is resolved.
3. IMPORTANT: You MUST use the standard native JSON format to call tools. DO NOT use python-style 'tool_code' blocks or write raw code.
</available_skills>`.trim();

      this.context.skillsMetadata = metadata;

      // Store in Redis for next request
      redis
        .set(cacheKey, metadata, "EX", PRELOAD_CACHE_TTL_SECONDS)
        .catch(() => {});
    } catch (error) {
      console.warn(`[BaseSpecialistAgent] Failed to preload skills:`, error);
    }
  }

  /**
   * Stub for preloading specialized pattern learnings.
   * Specializations can override this to fetch domain-specific intelligence.
   */
  public async preloadPatternLearnings(
    _patterns: string[],
    _depth: number = 2
  ): Promise<void> {
    // Default implementation is a no-op.
    // This allows the route.ts to call it even if the specialist hasn't overridden it.
    return Promise.resolve();
  }
}
