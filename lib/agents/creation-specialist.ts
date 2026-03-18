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
    const state = this.context.expertState;
    if (!state) return { required: [], aspirational: [] };

    return {
      required: [
        this.makeChecklistItem(
          "subject_defined",
          "Clearly defined research subject",
          !!state.brief.productContext?.name,
        ),
        this.makeChecklistItem(
          "objective_refined",
          "Actionable goal with decision threshold",
          !!state.brief.objectives.length,
        ),
        this.makeChecklistItem(
          "audience_profiled",
          "Psychographic and segment modeling complete",
          !!state.audienceModel.psychographicProfile,
        ),
        this.makeChecklistItem(
          "metric_contract",
          "Explicit measurement strategy agreed upon",
          !!state.brief.successMetrics,
        ),
        this.makeChecklistItem(
          "coverage_tree",
          "Research hierarchy (topics) generated",
          !!state.coverageTracker.nodes.length,
        ),
      ],
      aspirational: [
        this.makeChecklistItem(
          "hypotheses_surfaced",
          "Creator assumptions captured",
          !!state.brief.sensitiveTopics.length,
        ),
        this.makeChecklistItem(
          "media_context",
          "Media artifacts integrated with goals",
          !!state.sessionMeta.modality,
        ),
      ],
    };
  }

  // --------------------------------------------------------------------------
  // System Prompt — Domain-Specialist Creation Guide
  // --------------------------------------------------------------------------

  buildSystemPrompt(): string {
    const config = this.context.surveyConfig;
    if (!config) return "Survey configuration is missing.";

    const { domainName, coreContent, surveyTypeContent } =
      this.context.loadedDomainSkills || { domainName: "Survey" };
    
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
${coreContent || ""}
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
        name: "think_and_respond",
        description: "REQUIRED: Plan response and update state.",
        parameters: {
          type: "object",
          properties: {
            message_to_user: { type: "string" },
            internal_reasoning: { type: "string" },
          },
          required: ["message_to_user", "internal_reasoning"],
        },
      },
      {
        name: "setSurveyDomain",
        description: "Lock in the survey domain.",
        parameters: {
          type: "object",
          properties: {
            domainId: { type: "number" },
            summaryOfWhatWeKnow: { type: "string" },
          },
          required: ["domainId", "summaryOfWhatWeKnow"],
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
      think_and_respond: tool({
        description: "Analyze the creator's input, update the expert state, and generate a conversational response.",
        inputSchema: z.object({
          message_to_user: z.string().describe("The actual text shown to the participant."),
          internal_reasoning: z.string().describe("Your logic for the current turn."),
          expert_state_updates: z.record(z.any()).optional().describe("V2 ExpertState updates (Zod-compatible)."),
        }),
        execute: async ({ message_to_user, internal_reasoning, expert_state_updates }) => {
          console.log(`[CreationSpecialist] think_and_respond: ${internal_reasoning} | Message: ${message_to_user}`);
          if (expert_state_updates && this.context.expertState) {
            // Validate the merge result against ExpertState schema
            const merged = { ...this.context.expertState, ...expert_state_updates };
            const validated = expertStateSchema.safeParse(merged);

            if (validated.success) {
              Object.assign(this.context.expertState, expert_state_updates);
              await this.saveExpertState(expert_state_updates);
            } else {
              console.warn("[CreationSpecialist] State validation failed:", validated.error);
              // Proactively fix: still update but log the issue
              Object.assign(this.context.expertState, expert_state_updates);
              await this.saveExpertState(expert_state_updates);
            }
          }
          return { success: true };
        },
      }),
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
                domainId: primarySd?.familyId || 0,
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
            this.context.loadedDomainSkills = {
              domainName: domains.map(d => SUB_DOMAINS.find(s => s.id === d.id)?.name || d.id).join(" + "),
              coreContent: synthesized,
              surveyTypeContent: "",
              matchedSurveyType: primaryDomain.id,
              hybridDomains: domains
            };
          }
          
          return { status: "Hybrid domain strategy successfully established." };
        },
      }),
      finishSurvey: tool({
        description: "Finalize the survey design.",
        inputSchema: z.object({
          summary: z.string(),
        }),
        execute: async ({ summary }) => {
          if (ctx.surveyConfig?.id) {
            await getDb()
              .update(surveyCreationConversations)
              .set({ status: "completed" })
              .where(
                eq(surveyCreationConversations.surveyId, ctx.surveyConfig.id),
              );
          }
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
            provider: (defaultModel as any).modelId?.includes("gpt") ? "openai" : "google",
            modelName: (defaultModel as any).modelId ?? "gemini-2.0-flash",
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
