import { tool, streamText, type ModelMessage, stepCountIs } from "ai";
import { defaultModel } from "@/lib/ai";
import { logUsage } from "@/lib/billing/logger";
import { SkillEngine } from "./skill-system/engine";
import { z } from "zod";
import { BaseSpecialistAgent } from "./base-agent";
import type { AgentContext, SpecialistChecklist } from "./types";
import type { SurveyConfig } from "@/lib/prompts";
import type { VoiceAgentFunction } from "@/lib/voice/deepgram-voice-agent";
import { getDb } from "@/db";
import { eq } from "drizzle-orm";
import { surveys, surveyCreationConversations } from "@/db/schema";
import { expertStateSchema } from "@/lib/schemas/expert-state";
import { SUB_DOMAINS } from "./skill-system/registry";
import type { UnifiedSkill } from "./types";

export class CreationSpecialist extends BaseSpecialistAgent {
  constructor(context: AgentContext) {
    super("creation", context);
  }

  // --------------------------------------------------------------------------
  // Agent-Defined Success Criteria
  // --------------------------------------------------------------------------

  protected buildChecklist(config: SurveyConfig): SpecialistChecklist {
    // Legacy support: V4 uses getUnifiedNodes() and ExpertState nodes.
    return { required: [], aspirational: [] };
  }

  // --------------------------------------------------------------------------
  // System Prompt — Domain-Specialist Creation Guide
  // --------------------------------------------------------------------------

  buildSystemPrompt(): string {
    const config = this.context.surveyConfig;
    if (!config) return "Survey configuration is missing.";

    const { domainName, coreContent, surveyTypeContent } =
      this.context.loadedDomainSkills || { domainName: "Generalist" };
    
    return `
<role>
IDENTITY: You are a professional ${domainName} Survey Design Specialist.
GOAL: Collaborate with the creator to design a high-signal, production-ready survey.
LANGUAGE: ${config.language ?? "en"}
</role>

${this.getGlobalArchitectureRules()}
${this.getChecklistSection()}
${this.getConstitutionalConstraints()}

<expert_design_protocols>
${this.getBehavioralProfile()}
${surveyTypeContent || ""}
</expert_design_protocols>

${this.getAdaptationHintsSection()}

${this.getPrunedStateSection()}

${this.getSkillsSection()}
${this.getKnowledgeSection()}

<proactive_analyst_rules>
1. LOGIC TREE: Once the objective is clear, you MUST suggest a research hierarchy.
2. V2 COMPLIANCE: Every update MUST follow the strict ExpertState schema.
</proactive_analyst_rules>

<thinking_protocol>
You are operating in a low-latency STREAMING JSON MODE.
For every turn, your response MUST be a perfectly formatted, raw JSON object containing:
1. "reasoning": Concise internal audit of design progress.
2. "response": Natural conversational text for the creator.

CONVERSATIONAL SILENCE RULES:
- If you are calling 'setSurveyDomain', your "response" MUST be empty (""). Do not speak until the domain is locked in and you have your specialized skills in Step 2.
- If you are calling 'finishSurvey', you SHOULD provide a friendly closing message in the "response" field.
</thinking_protocol>

<completion_protocol>
When all REQUIRED checklist items are marked 'met': call 'finishSurvey'.
</completion_protocol>
`.trim();
  }

  // --------------------------------------------------------------------------
  // Get Tools for Deepgram Voice Agent
  // --------------------------------------------------------------------------

  getDeepgramFunctions(): VoiceAgentFunction[] {
    return [
      {
        name: "setSurveyDomain",
        description: "Lock in the survey domain.",
        parameters: {
          type: "object",
          properties: {
            domains: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  weight: { type: "number" },
                },
                required: ["id", "weight"],
              },
            },
            summaryOfWhatWeKnow: { type: "string" },
          },
          required: ["domains", "summaryOfWhatWeKnow"],
        },
      },
      {
        name: "finishSurvey",
        description: "Signal design complete.",
        parameters: {
          type: "object",
          properties: { summary: { type: "string" } },
          required: ["summary"],
        },
      },
    ];
  }

  // --------------------------------------------------------------------------
  // Agent Tools (AI SDK)
  // --------------------------------------------------------------------------

  getTools(): Record<string, any> {
    const ctx = this.context;
    return {
      // think_and_respond removed in favor of direct JSON streaming
      setSurveyDomain: tool({
        description: "Lock in the research domain(s). Provide a primary domain and any relevant secondary domains.",
        inputSchema: z.object({
          domains: z.array(z.object({
            id: z.string().describe("The subdomain ID (e.g. 'cx-nps-loyalty')"),
            weight: z.number().describe("Importance weight (0-1)")
          })),
          summaryOfWhatWeKnow: z.string(),
        }),
        execute: async ({ domains, summaryOfWhatWeKnow }) => {
          if (!ctx.surveyConfig?.id) return { error: "No active survey." };
          
          const primaryDomain = domains.sort((a, b) => b.weight - a.weight)[0];
          const primarySd = SUB_DOMAINS.find(s => s.id === primaryDomain.id);

          // Update ExpertState with synthesized domain knowledge
          if (this.context.expertState) {
            this.context.expertState.brief.productContext = {
              ...this.context.expertState.brief.productContext,
              description: summaryOfWhatWeKnow,
              domainFamily: primarySd?.familyId?.toString()
            };
            await this.saveExpertState({ brief: this.context.expertState.brief });
          }
          
          await getDb().transaction(async (tx) => {
            await tx
              .update(surveys)
              .set({ 
                domainId: primaryDomain.id,
                hybridDomains: domains 
              })
              .where(eq(surveys.id, ctx.surveyConfig!.id));
          });

          // Reload skills for the hybrid set
          const skillEntries: { skill: UnifiedSkill; weight: number }[] = [];
          for (const d of domains) {
            const skill = await SkillEngine.loadSkill(d.id, "creation");
            if (skill) skillEntries.push({ skill, weight: d.weight });
          }

          if (skillEntries.length > 0) {
            const synthesized = await SkillEngine.synthesizeProtocol(skillEntries, "creation");
            
            // NEW: Extract nodes from the primary skill to initialize the research hierarchy
            const primarySkill = skillEntries[0].skill;
            const skillNodes = SkillEngine.parseCoverageModel(primarySkill.content);

            this.context.loadedDomainSkills = {
               domainName: domains.map(d => SUB_DOMAINS.find(s => s.id === d.id)?.name || d.id).join(" + "),
               coreContent: synthesized,
               surveyTypeContent: "",
               matchedSurveyType: primaryDomain.id,
               hybridDomains: domains,
               activeNodes: skillNodes
            };

            // PERSIST: Save precompiled creation skill and initialize nodes in ExpertState
            if (this.context.expertState) {
              // Initialize nodes from unified factory (Skills + Custom Metrics + Goals)
              const unifiedNodes = this.getUnifiedNodes();
              
              this.context.expertState.coverageTracker.nodes = unifiedNodes;

              this.context.expertState.sessionMeta.compiledSkills = {
                ...this.context.expertState.sessionMeta.compiledSkills,
                creation: synthesized
              };
              
              await this.saveExpertState({ 
                sessionMeta: this.context.expertState.sessionMeta,
                coverageTracker: this.context.expertState.coverageTracker
              });
            }
          }
          
          return { status: "Hybrid domain strategy successfully established and precompiled." };
        },
      }),
      finishSurvey: tool({
        description: "Finalize the survey design.",
        inputSchema: z.object({
          summary: z.string(),
        }),
        execute: async ({ summary }) => {
          if (!ctx.surveyConfig?.id) return { error: "No active survey." };

          const exportState = this.context.expertState;
          if (exportState) {
            // ONE-TIME PRECOMPILATION: Generate protocols for next phases
            const domains = ctx.surveyConfig.hybridDomains || (ctx.surveyConfig.domainId ? [{ id: ctx.surveyConfig.domainId, weight: 1 }] : []);
            
            if (domains.length > 0) {
              // console.log(`[CreationSpecialist] Precompiling final skills for ${ctx.surveyConfig.id}...`);
              
              const conductingEntries: { skill: UnifiedSkill; weight: number }[] = [];
              const analyticsEntries: { skill: UnifiedSkill; weight: number }[] = [];

              for (const d of domains) {
                const condSkill = await SkillEngine.loadSkill(d.id, "conducting");
                const analSkill = await SkillEngine.loadSkill(d.id, "analytics");
                if (condSkill) conductingEntries.push({ skill: condSkill, weight: d.weight });
                if (analSkill) analyticsEntries.push({ skill: analSkill, weight: d.weight });
              }

              const conductingSynthesis = await SkillEngine.synthesizeProtocol(conductingEntries, "conducting");
              const analyticsSynthesis = await SkillEngine.synthesizeProtocol(analyticsEntries, "analytics");

              exportState.sessionMeta.compiledSkills = {
                ...exportState.sessionMeta.compiledSkills,
                conducting: conductingSynthesis,
                analytics: analyticsSynthesis
              };
              await this.saveExpertState({ sessionMeta: exportState.sessionMeta });
            }
          }

          await getDb()
            .update(surveyCreationConversations)
            .set({ status: "completed" })
            .where(
              eq(surveyCreationConversations.surveyId, ctx.surveyConfig.id),
            );

          return { success: true, summary };
        },
      }),
    };
  }

  stream(
    messages: ModelMessage[],
    onFinish?: (result: {
      text: string;
      usage: import("ai").LanguageModelUsage;
      response: any;
    }) => Promise<void>,
    dynamicSystemDirective?: string,
  ) {
    const ctx = this.context;
    if (!ctx.surveyConfig)
      throw new Error("Cannot stream without survey configuration");
    const baseSystem = this.buildSystemPrompt();
    const finalSystem = dynamicSystemDirective
      ? `${baseSystem}\n\n<dynamic_instruction>\n${dynamicSystemDirective}\n</dynamic_instruction>`
      : baseSystem;
    return streamText({
      model: defaultModel,
      system: finalSystem,
      messages,
      tools: this.getTools(),
      onFinish: async (result) => {
        if (ctx.surveyConfig?.id) {
          await logUsage({
            userId: ctx.userId,
            organizationId: ctx.organizationId,
            surveyId: ctx.surveyConfig.id,
            type: "llm_text",
            provider: (defaultModel).modelId?.includes("gpt") ? "openai" : "google",
            modelName: (defaultModel).modelId ?? "gemini-2.5-flash",
            promptTokens: result.usage.inputTokens,
            completionTokens: result.usage.outputTokens,
            totalTokens: result.usage.totalTokens,
          });
        }
        if (onFinish) await onFinish(result);
      },
      stopWhen: stepCountIs(3),
    });
  }
}
