import { tool } from "ai";
import { AgentContext, ChecklistItem, SpecialistChecklist } from "./types";
import { searchKnowledgeBase } from "@/lib/rag/search";
import { rerankResults } from "@/lib/rag/reranker";
import { SurveyConfig } from "@/lib/prompts";
import { retrieveRelevantPatterns } from "@/lib/learning/knowledge-storage";
import { retrievePatternForSituation } from "@/lib/learning/context-engine";
import { SkillRegistry } from "./skill-registry";
import { loadDomainSkills } from "./domain-skill-loader";
import { getRedisClient } from "@/lib/redis";

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
      const surveyDescription = [
        this.context.surveyConfig.coreObjective,
        this.context.surveyConfig.expertState?.objective?.goal,
        this.context.surveyConfig.expertState?.objective?.subjectDescription,
        this.context.surveyConfig.expertState?.scope?.mainTopics?.join(" "),
      ]
        .filter(Boolean)
        .join(" ");

      const phaseMap: Record<string, "creation" | "conducting" | "analytics"> =
        {
          creation: "creation",
          conducting: "conducting",
          analytics: "analytics",
        };

      const phase = phaseMap[this.role] || "creation";

      this.context.loadedDomainSkills =
        (await loadDomainSkills(
          this.context.surveyConfig.domainId,
          phase,
          surveyDescription,
        )) || undefined;
    }
  }

  abstract buildSystemPrompt(): string;

  abstract getTools(): Record<string, any>;

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
3. Once a REQUIRED item is fully met, mark it as 'met' in your next state_update.
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

  // ── RAG: General knowledge context ─────────────────────────────────────────

  protected getKnowledgeSection(): string {
    if (!this.context.knowledgeContext && !this.context.ragContext) return "";
    let section = "<knowledge_context>\n";
    if (this.context.knowledgeContext) {
      section += `Context provided by orchestrator:\n${this.context.knowledgeContext}\n\n`;
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

  // ── Self-Learning: Situational pattern (high-precision, full detail) ────────

  /**
   * Formats the single best-fit situational pattern as a <target_technique> block.
   * This gets full detail because it's the ONE pattern most relevant to the current moment.
   */
  protected getSituationalPatternSection(): string {
    const p = this.context.situationalPattern;
    if (!p) return "";

    const lines = p.content.split("\n");
    const descStart = lines.findIndex((l) => l.startsWith("DESCRIPTION:"));
    const contextStart = lines.findIndex((l) => l.startsWith("CONTEXT:"));
    const exampleStart = lines.findIndex((l) =>
      l.startsWith("EXAMPLE FROM CONVERSATION:"),
    );

    const description =
      descStart >= 0
        ? lines
            .slice(
              descStart + 1,
              contextStart > 0 ? contextStart : descStart + 4,
            )
            .join(" ")
            .trim()
        : "";
    const example =
      exampleStart >= 0
        ? lines[exampleStart + 1]?.trim().replace(/^"|"$/g, "") || ""
        : "";

    return `
<target_technique source="${p.source}"${p.experimentId ? ` experiment_id="${p.experimentId}" variant="${p.experimentVariant}"` : ""}>
Technique: ${p.title}
Instruction: ${description}
${example ? `Example: "${example}"` : ""}
</target_technique>`.trim();
  }

  // ── Self-Learning: Broad pattern hints (compressed bullets) ────────────────

  /**
   * Fetches patterns by category and formats them as compressed 1-line bullets.
   * Each bullet: • "Title" — trigger: action
   * ~15 tokens/pattern vs ~120 tokens with the verbose format.
   */
  protected async loadPatternLearnings(
    category:
      | "questioning"
      | "probing"
      | "transition"
      | "engagement"
      | "creation"
      | "general",
    limit: number = 3,
  ): Promise<string> {
    try {
      const domainId = this.context.surveyConfig?.domainId ?? null;
      const patterns = await retrieveRelevantPatterns(
        domainId,
        category,
        limit,
      );
      if (patterns.length === 0) return "";

      const bullets = patterns.map((pattern) => {
        const lines = pattern.content.split("\n");

        // Extract trigger from CONTEXT line (first sentence only)
        const contextIdx = lines.findIndex((l) => l.startsWith("CONTEXT:"));
        const contextFull =
          contextIdx >= 0 ? lines[contextIdx + 1]?.trim() || "" : "";
        const trigger = contextFull
          .split(/\.|,/)[0]
          .trim()
          .toLowerCase()
          .slice(0, 70);

        // Extract action from DESCRIPTION (first sentence only)
        const descIdx = lines.findIndex((l) => l.startsWith("DESCRIPTION:"));
        const descFull = descIdx >= 0 ? lines[descIdx + 1]?.trim() || "" : "";
        const action = descFull.split(".")[0].trim().slice(0, 90);

        return `• "${pattern.title}" — ${trigger || "relevant moment"}: ${action || "apply technique"}`;
      });

      return bullets.join("\n");
    } catch (error) {
      console.warn(
        `[BaseSpecialistAgent] Failed to load pattern learnings:`,
        error,
      );
      return "";
    }
  }

  /**
   * Returns the full self-learning section for the system prompt.
   * - <target_technique>: one full-detail situational pattern (high precision)
   * - <learned_techniques>: compressed bullet hints from broad semantic search
   */
  protected getPatternLearningsSection(): string {
    const situational = this.getSituationalPatternSection();
    const broad = this.context.patternLearnings;

    if (!situational && !broad) return "";

    const parts: string[] = [];
    if (situational) parts.push(situational);
    if (broad)
      parts.push(`<learned_techniques>\n${broad}\n</learned_techniques>`);

    return parts.join("\n\n");
  }

  /**
   * Preloads pattern learnings into context. Call this BEFORE buildSystemPrompt().
   *
   * Step 1 (Conducting only): Situational retrieval from ContextEngine.
   *   → Checks active A/B experiments, then exact phase+style match, then phase-only,
   *     then vector fallback. Returns the single best-fit pattern in full detail.
   *
   * Step 2: Broad semantic search across categories.
   *   → Returns compressed 1-line bullets for ambient technique awareness.
   */
  public async preloadPatternLearnings(
    categories: Array<
      | "questioning"
      | "probing"
      | "transition"
      | "engagement"
      | "creation"
      | "general"
    > = ["general"],
    limitPerCategory: number = 2,
    query?: string,
  ): Promise<void> {
    console.log(
      `[BaseAgent] preloadPatternLearnings: Cats=${categories.join(",")}`,
    );
    try {
      // ── Step 1: Situational (conducting only, requires rolling context) ──────
      if (this.role === "conducting" && this.context.rollingContext) {
        const { stateContext, memory } = this.context.rollingContext;

        const phaseMap: Record<
          string,
          "opening" | "exploration" | "deepdive" | "closing"
        > = {
          GREETING: "opening",
          EXPLORING_INITIAL: "exploration",
          DRILLING_DEEPER: "deepdive",
          COVERING_TOPIC: "exploration",
          TRANSITIONING: "exploration",
          CHECKING_COVERAGE: "deepdive",
          WRAPPING_UP: "closing",
          CONCLUDING: "closing",
        };

        const situation = {
          phase: phaseMap[stateContext?.currentState ?? ""] || "exploration",
          style: memory?.participantStyle || "neutral",
        };

        const retrieved = await retrievePatternForSituation(
          situation,
          query || "effective engagement technique",
          this.context.conversationId ?? "unknown",
          this.context.surveyConfig?.domainId,
        );

        if (retrieved) {
          this.context.situationalPattern = retrieved;
        }
      }

      // ── Step 2: Broad semantic search (Redis-cached) ──────────────────────────
      const cacheKey = `agent:patterns:${categories.join(",")}:${limitPerCategory}`;
      const redis = getRedisClient();
      const cachedBullets = await redis.get(cacheKey).catch(() => null);

      if (cachedBullets) {
        console.log(
          `[BaseSpecialistAgent] preloadPatternLearnings: cache hit (${cacheKey})`,
        );
        this.context.patternLearnings = cachedBullets;
        return;
      }

      const bullets: string[] = [];
      for (const category of categories) {
        const categoryBullets = await this.loadPatternLearnings(
          category,
          limitPerCategory,
        );
        if (categoryBullets) bullets.push(categoryBullets);
      }

      if (bullets.length > 0) {
        const joined = bullets.join("\n");
        this.context.patternLearnings = joined;
        redis
          .set(cacheKey, joined, "EX", PRELOAD_CACHE_TTL_SECONDS)
          .catch(() => {});
      }
    } catch (error) {
      console.warn(
        `[BaseSpecialistAgent] Failed to preload pattern learnings:`,
        error,
      );
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

      const skills = await SkillRegistry.listSkills();
      if (skills.length === 0) return;

      const callableSkills = skills.filter((s) => !s.id.endsWith("-core"));

      if (callableSkills.length === 0) return;

      const formatted = callableSkills
        .map(
          (s) =>
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
}
