import { AgentContext, ChecklistItem, SpecialistChecklist } from "./types";
import { rerankResults } from "@/lib/rag/reranker";
import { SurveyConfig } from "@/lib/prompts";
import { SkillEngine } from "./skill-system/engine";
import { SUB_DOMAINS } from "./skill-system/registry";
import { ExpertStateStore } from "@/lib/expert-state-store";
import { ExpertState } from "@/lib/schemas/expert-state";
import { getRedisClient } from "@/lib/redis";

// Intelligence Engines (V2 Architecture)
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

  /**
   * Public API to update the agent's context mid-session.
   * Useful for voice handlers that need to sync background state changes (ExpertState)
   * into the agent's reasoning brain.
   */
  public updateContext(updates: Partial<AgentContext>): void {
    this.context = { ...this.context, ...updates };
  }

  async initialize(): Promise<void> {
    /*
    console.log(
      `[BaseAgent] initialize: Role=${this.role}. SID=${this.context.surveyConfig?.id || "none"}. Domain=${this.context.surveyConfig?.domainId || "none"}`,
    );
    */

    const phaseMap: Record<string, "creation" | "conducting" | "analytics"> = {
      creation: "creation",
      conducting: "conducting",
      analytics: "analytics",
    };
    const phase = phaseMap[this.role] || "creation";

    // ── PRIMARY PATH: Use Precompiled Intelligent Skills from ExpertState ──
    const compiledContent = (this.context.expertState?.sessionMeta as any)?.compiledSkills?.[phase];
    if (compiledContent) {
      this.context.loadedDomainSkills = {
        domainName: this.context.surveyConfig?.domainId || "Precompiled Domain",
        coreContent: compiledContent,
        surveyTypeContent: "",
        matchedSurveyType: this.context.surveyConfig?.domainId || "",
        hybridDomains: this.context.surveyConfig?.hybridDomains || [],
        activeNodes: SkillEngine.parseCoverageModel(compiledContent),
      };
      // console.log(`[BaseAgent] Precompiled skills loaded for ${phase}`);
      return;
    }

    // ── FALLBACK PATH: LLM-based semantic match (used when no precompiled skills are present) ──
    if (this.context.surveyConfig?.domainId) {
      const surveyDescription = [
        this.context.surveyConfig.coreObjective,
        this.context.surveyConfig.expertState?.objective?.goal,
        this.context.surveyConfig.expertState?.objective?.subjectDescription,
      ].filter(Boolean).join(" ");

      const matchedSubDomains = await SkillEngine.semanticMatch(surveyDescription);

      if (matchedSubDomains.length > 0) {
        const skillEntries: { skill: import("./skill-system/types").UnifiedSkill; weight: number }[] = [];
        for (const match of matchedSubDomains) {
          const skill = await SkillEngine.loadSkill(match.subDomain.id, phase);
          if (skill) {
            skillEntries.push({ skill, weight: match.weight });
          }
        }

        if (skillEntries.length > 0) {
          const synthesizedContent = await SkillEngine.synthesizeProtocol(skillEntries, this.role);

          this.context.loadedDomainSkills = {
            domainName: matchedSubDomains.map(m => m.subDomain.name).join(" + "),
            coreContent: synthesizedContent,
            surveyTypeContent: "",
            matchedSurveyType: matchedSubDomains[0].subDomain.id,
            hybridDomains: matchedSubDomains.map(m => ({ id: m.subDomain.id, weight: m.weight }))
          };

          // console.log(`[BaseAgent] Fallback SkillEngine loaded: ${this.context.loadedDomainSkills.domainName}`);
        }
      }
    }
  }

  /**
   * Returns the loaded domain skills (core content from the bundle).
   * Used by the voice handler to cache the bundle for the agent-turn endpoint.
   */
  getLoadedDomainSkills() {
    return this.context.loadedDomainSkills;
  }

  abstract buildSystemPrompt(): string;

  abstract getTools(): any;

  protected abstract buildChecklist(config: SurveyConfig): SpecialistChecklist;

  protected getSpecialistIdentity(): string {
    return `${this.role} Specialist`;
  }

  /**
   * Extracts the behavioral profile from the loaded domain skills based on role and modality.
   * - For analytics: returns full coreContent (analytics files don't have voice/text sections)
   * - For conducting/creation: routes to the correct modality section
   */
  protected getBehavioralProfile(): string {
    const { coreContent } = this.context.loadedDomainSkills || {};
    if (!coreContent) return "";

    // Analytics skills don't have voice/text behavioral sections —
    // they contain interpretation frameworks. Return the whole content.
    if (this.role === "analytics") {
      return coreContent.trim();
    }

    const modality = this.context.modality || "text";

    if (modality === "voice") {
      const voiceSection = coreContent.match(/## Section 2: Voice Behavioral Profile([\s\S]*?)(?=## Section|$)/i);
      if (voiceSection) return voiceSection[1].trim();
    } else {
      const textSection = coreContent.match(/## Section 3: Text Behavioral Profile([\s\S]*?)(?=## Section|$)/i);
      if (textSection) return textSection[1].trim();
    }

    return coreContent.trim();
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
    const config = this.context.surveyConfig;
    if (!config) return "";

    // V4 Unified Node-Only Architecture
    // We strictly follow the nodes in the ExpertState (The Source of Truth)
    const trackerNodes = this.context.expertState?.coverageTracker?.nodes || [];
    
    // Fallback for initialization phase: If no tracker nodes exist yet, build a temporary checklist
    if (trackerNodes.length === 0) {
      const checklist = this.buildChecklist(config);
      return `
<success_criteria>
[INITIALIZATION PHASE] Define the research parameters.
${checklist.required.map((i) => `• [${i.status.toUpperCase()}] ${i.description}`).join("\n")}
</success_criteria>
      `.trim();
    }

    return `
<success_criteria>
You are bound by a "Measurement Contract" (Expert Nodes). To succeed, you must satisfy these criteria.

CONTRACT NODES:
${trackerNodes.map((n) => `• [${n.status.toUpperCase()}] ID: ${n.id} | ${n.label}${n.priority >= 0.9 ? " [CRITICAL]" : ""}`).join("\n")}

CRITICAL OPERATIONAL RULES:
1. You operate in a low-latency STREAMING JSON MODE.
2. Every response MUST be a raw JSON object with:
   - "reasoning": Concise internal audit (under 50 words). MUST explicitly cite Node IDs (e.g. "[Satisfied RT-01]").
   - "response": Conversational text spoken to the user.
3. Once a Node is "met", mark it in the reasoning and pivot to the next priority.
</success_criteria>
    `.trim();
  }

  /**
   * Universal Node Factory: Transmutes any survey requirement into a standardized ExpertState Node.
   * Useful for initializing the ExpertState coverage tracker.
   */
  public getUnifiedNodes(): any[] {
    const config = this.context.surveyConfig;
    if (!config) return [];

    const skillNodes = this.context.loadedDomainSkills?.activeNodes || [];
    const customNodes: any[] = [];

    // 1. Goal Alignment
    customNodes.push({
      id: "GOAL-01",
      label: "Core Objective Alignment",
      priority: 1.0,
      status: "pending"
    });

    // 2. Metrics -> MTR-##
    if (config.metrics?.length) {
      config.metrics.forEach((m, i) => {
        customNodes.push({
          id: `MTR-${(i + 1).toString().padStart(2, "0")}`,
          label: `Metric: ${m}`,
          priority: 0.8,
          status: "pending"
        });
      });
    }

    // 3. Required Questions -> REQ-##
    if (config.requiredQuestions?.length) {
      config.requiredQuestions.forEach((q, i) => {
        customNodes.push({
          id: `REQ-${(i + 1).toString().padStart(2, "0")}`,
          label: `Required: ${q.slice(0, 50)}...`,
          priority: 1.0,
          status: "pending"
        });
      });
    }

    // 4. Personal Info -> PERS-01
    if (config.personalInfo?.length) {
      customNodes.push({
        id: "PERS-01",
        label: `Personal Info: ${config.personalInfo.join(", ")}`,
        priority: 0.7,
        status: "pending"
      });
    }

    // Combine. Ensure skill nodes come first for expertise dominance.
    return [...skillNodes, ...customNodes].map(node => ({
      ...node,
      parentId: null,
      confidenceScore: 0,
      touchCount: 0,
      qualityScore: 0,
      verbatimQuotes: [],
      children: []
    }));
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
You operate under a Role-Goal-Skill-Constraint (RGSC) framework:
- IDENTITY: Your defined role and domain expertise.
- OBJECTIVE: The specific survey goal and metric contract.
- SKILLS: Specialized expert protocols (Coverage Models) loaded for this session.
- CONSTRAINTS: Hard rules and constitutional principles.

Always prioritize Objective > Skills > Identity > Constraints. If a domain skill suggests a behavior that contradicts the core survey goal, the goal wins. Your "Measurement Contract" in the success criteria is your primary definition of success.
</architecture_rules>
    `.trim();
  }

  // ── V2 Intelligence Helpers ──────────────────────────────────────────────

  protected getPrunedStateSection(): string {
    const state = this.context.expertState;
    if (!state) return "";

    const prunedState = {
      ...state,
      transcript: `[${state.transcript.turns.length} turns]`
    };
    const omittedSummary = "Omitted for brevity.";

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

    // Derive engagement summary directly from ExpertState aggregates (no external engine needed)
    const agg = state.qualitySignals.sessionAggregates;
    const lastRecord = state.qualitySignals.turnRecords.slice(-1)[0];
    const engagementSummary = `Reliability: ${Math.round(agg.overallReliability * 100)}% | Evasion: ${Math.round(agg.evasionIndex * 100)}% | Current Engagement: ${lastRecord ? Math.round(lastRecord.engagementScore * 100) : 0}%`;

    return `
<adaptation_hints>
1. PSYCHOLOGICAL: ${engagementSummary}
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


  // ── Expert State Persistence ─────────────────────────────────────────────

  protected async saveExpertState(update: Partial<ExpertState>): Promise<void> {
    const surveyId = this.context.surveyConfig?.id;
    if (!surveyId) return;

    try {
      await ExpertStateStore.update(surveyId, update);
      // console.log(`[BaseSpecialistAgent] ExpertState saved for survey ${surveyId}`);
    } catch (error) {
      console.error(`[BaseSpecialistAgent] Failed to save ExpertState:`, error);
    }
  }

  // ── Skills ──────────────────────────────────────────────────────────────────

  protected getSkillsSection(): string {
    const { domainName, matchedSurveyType } = this.context.loadedDomainSkills || {};
    if (!domainName) return "";

    return `
<active_skill_modules>
The following specialized expertise has been synchronized with your reasoning core.
DOMAIN: ${domainName}
SKILL_ID: ${matchedSurveyType || "universal"}
STATUS: Dynamic protocols (Sections 1-4) are ACTIVE.
</active_skill_modules>
    `.trim();
  }

  public async preloadSkills(): Promise<void> {
    console.log("[BaseAgent] preloadSkills: starting...");
    try {
      const redis = getRedisClient();
      const cacheKey = "agent:skills-metadata";

      // Check Redis cache first — skills list rarely changes
      const cached = await redis.get(cacheKey).catch(() => null);
      if (cached) {
        // console.log("[BaseSpecialistAgent] preloadSkills: cache hit");
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
<available_expertise>
The following specialized expertise has been synchronized with your reasoning core. You should apply these "Expert Protocols" automatically whenever a matching scenario is detected in the conversation.

${formatted}
</available_expertise>`.trim();

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
