import { tool, streamText, type ModelMessage } from "ai";
import { defaultModel } from "@/lib/ai";
import { logUsage } from "@/lib/billing/logger";
import { SkillRegistry } from "./skill-registry";
import { loadDomainSkills } from "./domain-skill-loader";
import { stepCountIs } from "ai";
import { z } from "zod";
import { BaseSpecialistAgent } from "./base-agent";
import type { AgentContext, ChecklistItem, SpecialistChecklist } from "./types";
import type { SurveyConfig } from "@/lib/prompts";
import type { VoiceAgentFunction } from "@/lib/voice/deepgram-voice-agent";
import { getDb } from "@/db";
import { eq } from "drizzle-orm";
import { surveys, surveyCreationConversations } from "@/db/schema";

export class CreationSpecialist extends BaseSpecialistAgent {
  constructor(context: AgentContext) {
    super("creation", context);
  }

  // --------------------------------------------------------------------------
  // Agent-Defined Success Criteria
  // --------------------------------------------------------------------------

  protected buildChecklist(config: SurveyConfig): SpecialistChecklist {
    const domainName = this.context.loadedDomainSkills?.domainName ?? "survey";
    const collected = (config as any).collectedInfo || {};
    const expertState = config.expertState || {};

    return {
      required: [
        this.makeChecklistItem(
          "subjectDefined",
          "Identified the specific product, service, or experience being surveyed (not vague)",
          !!(collected.subjectDefined || expertState.subjectDescription),
        ),
        this.makeChecklistItem(
          "domainIdentified",
          `Classified the survey into the correct domain (currently: ${domainName})`,
          !!(collected.domainIdentified || config.domainId),
        ),
        this.makeChecklistItem(
          "subject_intelligence",
          "Built a deep model of the subject through expert questioning (Subject Intelligence Protocol)",
          !!(collected.subject_intelligence || config.subjectModelComplete),
        ),
        this.makeChecklistItem(
          "objective",
          "Collected a specific, actionable objective with context and decision to be made",
          !!(collected.objective || expertState.objective?.goal),
        ),
        this.makeChecklistItem(
          "targetAudience",
          "Defined who will be surveyed with relationship, knowledge level, and specifics",
          !!(
            collected.targetAudience || expertState.targetAudience?.description
          ),
        ),
        this.makeChecklistItem(
          "metrics",
          "PROACTIVE DESIGN: Suggested and agreed upon a measurement strategy (NPS, CSAT, or custom metrics)",
          !!(collected.metrics || config.metrics?.length),
        ),
        this.makeChecklistItem(
          "personal_info",
          "Verified if any participant demographics/personal info should be captured",
          !!(collected.personalInfo || config.personalInfo?.length),
        ),
        this.makeChecklistItem(
          "required_questions",
          "Identified mandatory questions that MUST be asked in every interview",
          !!(collected.requiredQuestions || config.requiredQuestions?.length),
        ),
        this.makeChecklistItem(
          "scope",
          "Established breadth vs depth preference and main topics to cover",
          !!(collected.scope || expertState.scope?.mainTopics?.length),
        ),
        this.makeChecklistItem(
          "tone",
          "Decided on the conversation tone (formal/casual/playful/empathetic)",
          !!(collected.tone || config.tone),
        ),
        this.makeChecklistItem(
          "media",
          "PROACTIVE DESIGN: Recommended specific media (Optional) and captured its feedback goal.",
          !!(collected.media || config.media?.length),
        ),
      ],
      aspirational: [
        this.makeChecklistItem(
          "hypotheses",
          "Surfaced any existing assumptions or beliefs the creator wants to test",
          !!(
            collected.hypotheses || expertState.hypotheses?.assumptions?.length
          ),
        ),
        this.makeChecklistItem(
          "constraints",
          "Confirmed time limits and any sensitive topics to avoid",
          !!(collected.constraints || expertState.constraints?.timeLimit),
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

    if (this.context.loadedDomainSkills) {
      const { domainName, coreContent, surveyTypeContent } =
        this.context.loadedDomainSkills;
      const checklist = this.buildChecklist(config);

      const progressReport = checklist.required
        .map((i) => `${i.id}: ${i.status === "met" ? "✓" : "○"}`)
        .join(" | ");

      return `
<role>
IDENTITY: You are a professional ${domainName} Survey Design Specialist.
GOAL: Collaborate with the creator to design a high-signal, production-ready survey about: "${config.information || "a new subject"}"
LANGUAGE: ${config.language ?? "en"}
</role>

${this.getGlobalArchitectureRules()}

${this.getChecklistSection()}

${this.getConstitutionalConstraints()}

<expert_design_protocols>
${coreContent || ""}
${surveyTypeContent || ""}
</expert_design_protocols>

<design_phase_context>
Progress: ${progressReport}
</design_phase_context>

${this.getSkillsSection()}

${this.getKnowledgeSection()}

<proactive_analyst_rules>
1. NEVER ASK "What do you want to measure?". Instead, suggest: "Based on your objective of [Goal], I recommend measuring [Metric A] and [Metric B]. Does that align?"
2. MEDIA REQUIREMENT: You MUST execute the Media Recommendation Protocol before finishing.
3. PERSONAL INFO & REQUIRED QUESTIONS: These are NOT optional. You must explicitly ask the creator if they need to capture specific ID/Demographics or have 'must-ask' questions.
4. VAGUELY REJECTED: If the user says "just the usual", challenge them: "To get high-quality insights, we should be more specific. Would [Example] be more useful?"
5. SUBJECT INTELLIGENCE: You MUST call 'save_subject_intelligence' once you have modeled the specific subject's domain (e.g. products, learning goals, or population segments). This is NOT optional for production surveys.
</proactive_analyst_rules>

<media_recommendation_protocol>
Before calling 'finishSurvey', you MUST:
1. DELIBERATE: Based on the domain (${domainName}) and goal, decide if media (Image/Video/Audio) would help respondents understand the context better.
2. RECOMMEND & ASK: Explicitly suggest the CREATOR upload media to show respondents. Say: "I recommend you add a [Type] of [Description] so participants can [Specific Goal]. Would you like to upload one now?"
3. WAIT FOR CONSENT: DO NOT call 'requestMediaUpload' yet. Wait for the user to explicitly agree (e.g., "Yes", "Sure", "Okay", "Alright"). 
4. TRIGGER TOOL: ONLY after semantic agreement, call 'requestMediaUpload' with the relevant details.
</media_recommendation_protocol>

<completion_protocol>
When all REQUIRED checklist items are marked 'met' (including 'subject_intelligence'):
1. Summarize the survey architecture briefly.
2. Direct the user: "Click 'Go to Sample Conversations' to test the AI's conduct."
3. Call 'finishSurvey'.
</completion_protocol>

<final_directive>
Use 'think_and_respond' to update your design state in every turn. Lead the conversation, don't follow.
</final_directive>
`.trim();
    }

    // DISCOVERY MODE (Generic Fallback)
    return `
<role>
IDENTITY: You are a professional Survey Design Consultant.
GOAL: Identify the survey's domain to load specialized expertise.
</role>

<discovery_mission>
Your goal is to determine which of these domains fits the user's need:
1: Customer Experience (Software, Products, NPS)
2: Market Research (New Concepts, Branding)
3: Workforce (Internal, Employees, HR)
5: Education (Students, Training)
6: Civic Engagement (Government, Community)
7: Academic Research
10: Infrastructure (IT, Usability)

TRIGGER: As soon as you can guess the domain, silently call 'setSurveyDomain' with a briefing note.
</discovery_mission>

<rules>
1. START: Greet warmly. Ask: ${this.context.language === "de" ? '"Was möchten wir heute messen?"' : this.context.language === "fr" ? "\"Qu'allons-nous mesurer aujourd'hui ?\" " : this.context.language === "es" ? '"¿Qué vamos a medir hoy?"' : this.context.language === "it" ? '"Cosa vogliamo misurare oggi?"' : '"What are we looking to measure today?"'}
2. NO INTERROGATION: Get the gist and switch. Don't ask for details yet.
</rules>
`.trim();
  }

  // --------------------------------------------------------------------------
  // Get Tools for Deepgram Voice Agent
  // --------------------------------------------------------------------------

  getDeepgramFunctions(): VoiceAgentFunction[] {
    return [
      {
        name: "think_and_respond",
        description:
          "REQUIRED: Use to plan your response and update state. The message_to_user is spoken aloud.",
        parameters: {
          type: "object",
          properties: {
            message_to_user: {
              type: "string",
              description: "The message to speak aloud (conversational).",
            },
            internal_reasoning: {
              type: "string",
              description: "Internal step-by-step thinking.",
            },
            state_updates: {
              type: "object",
              description: "Checklist completions (e.g. { objective: true }).",
            },
          },
          required: ["message_to_user", "internal_reasoning"],
        },
      },
      {
        name: "setSurveyDomain",
        description: "Lock in the survey domain based on discovery.",
        parameters: {
          type: "object",
          properties: {
            domainId: {
              type: "number",
              description: "The numeric ID of the domain.",
            },
            summaryOfWhatWeKnow: {
              type: "string",
              description: "Briefing note for the specialist agent.",
            },
          },
          required: ["domainId", "summaryOfWhatWeKnow"],
        },
      },
      {
        name: "finishSurvey",
        description: "Signal the survey design is complete.",
        parameters: {
          type: "object",
          properties: {
            summary: { type: "string", description: "Brief design summary." },
          },
          required: ["summary"],
        },
      },
      {
        name: "requestMediaUpload",
        description: "Trigger the media upload UI widget.",
        parameters: {
          type: "object",
          properties: {
            allowedTypes: {
              type: "array",
              items: { type: "string", enum: ["image", "audio", "video"] },
            },
            description: { type: "string" },
            learningGoal: { type: "string" },
          },
          required: ["allowedTypes", "description"],
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
        description: "Update the survey design state and plan your response.",
        inputSchema: z.object({
          internal_reasoning: z
            .string()
            .describe("Internal analysis of the turn."),
          state_updates: z
            .record(z.any())
            .optional()
            .describe("Checklist item completions."),
        }),
        execute: async ({ internal_reasoning, state_updates }) => {
          console.log(
            `[CreationSpecialist:think_and_respond] Reasoning: ${internal_reasoning.substring(0, 50)}...`,
          );
          return { success: true, message: "State updated." };
        },
      }),
      setSurveyDomain: tool({
        description: "Silently lock in the survey domain.",
        inputSchema: z.object({
          domainId: z.number().describe("The numeric ID of the chosen domain."),
          summaryOfWhatWeKnow: z
            .string()
            .describe("Briefing for the specialist."),
        }),
        execute: async ({ domainId, summaryOfWhatWeKnow }) => {
          if (!ctx.surveyConfig?.id) return { error: "No active survey." };
          await getDb().transaction(async (tx) => {
            await tx
              .update(surveys)
              .set({ domainId })
              .where(eq(surveys.id, ctx.surveyConfig!.id));
            const [currentSurvey] = await tx
              .select()
              .from(surveys)
              .where(eq(surveys.id, ctx.surveyConfig!.id));
            if (currentSurvey) {
              const expertState = (currentSurvey.expertState || {}) as any;
              await tx
                .update(surveys)
                .set({
                  expertState: {
                    ...expertState,
                    established_context: summaryOfWhatWeKnow,
                  },
                })
                .where(eq(surveys.id, ctx.surveyConfig!.id));
            }
            const [currentConv] = await tx
              .select()
              .from(surveyCreationConversations)
              .where(
                eq(surveyCreationConversations.surveyId, ctx.surveyConfig!.id),
              );
            if (currentConv) {
              const currentExtracted = (currentConv.extractedData || {}) as any;
              await tx
                .update(surveyCreationConversations)
                .set({ extractedData: { ...currentExtracted, domainId } })
                .where(
                  eq(
                    surveyCreationConversations.surveyId,
                    ctx.surveyConfig!.id,
                  ),
                );
            }
          });
          const loadedSkills = await loadDomainSkills(
            domainId,
            "creation",
            summaryOfWhatWeKnow,
          );
          return {
            status: "Domain successfully established.",
            domainName: loadedSkills?.domainName || "Specialist",
          };
        },
      }),
      loadSkill: tool({
        description: "Load a specialized design skill.",
        inputSchema: z.object({
          skillId: z.string().describe("The ID of the skill to load."),
        }),
        execute: async ({ skillId }) => {
          const skill = await SkillRegistry.getSkill(skillId);
          return skill
            ? { instructions: skill.content }
            : { error: "Skill not found" };
        },
      }),
      save_subject_intelligence: tool({
        description:
          "Save deep domain findings (Subject Intelligence) about the survey topic.",
        inputSchema: z.object({
          findings: z
            .record(z.any())
            .describe(
              "Domain-specific expert findings (e.g. learning goals, pain points, identity dimensions)",
            ),
          intelligentProbes: z
            .array(z.string())
            .describe("Specific deep-dive questions for the conductor to use"),
          confidence: z
            .enum(["high", "medium", "low"])
            .describe("AI confidence in the extracted model"),
          confidenceReason: z.string().optional(),
        }),
        execute: async (si) => {
          if (ctx.surveyConfig?.id) {
            await getDb().transaction(async (tx) => {
              const [currentSurvey] = await tx
                .select()
                .from(surveys)
                .where(eq(surveys.id, ctx.surveyConfig!.id));
              if (currentSurvey) {
                const expertState = (currentSurvey.expertState || {}) as Record<
                  string,
                  any
                >;
                await tx
                  .update(surveys)
                  .set({
                    expertState: {
                      ...expertState,
                      subjectIntelligence: si,
                      subjectModelComplete: true,
                    },
                  })
                  .where(eq(surveys.id, ctx.surveyConfig!.id));
              }
            });
          }
          return {
            success: true,
            message: "Subject intelligence model saved.",
          };
        },
      }),
      save_survey_configuration: tool({
        description: "Update exact survey configuration fields.",
        inputSchema: z.object({
          journeyStage: z.string().optional(),
          metric: z.string().optional(),
          surveyType: z.string().optional(),
          subjectDescription: z.string().optional(),
          targetAudience: z
            .object({
              description: z.string(),
              relationship: z.string(),
              knowledgeLevel: z.string(),
            })
            .optional(),
          objective: z
            .object({
              goal: z.string(),
              context: z.string(),
              decision: z.string(),
            })
            .optional(),
          tone: z.string().optional(),
          constraints: z.string().optional(),
          scope: z.string().optional(),
          hypotheses: z.string().optional(),
          requiredQuestions: z
            .array(z.string())
            .describe(
              "An array of specific questions that MUST be asked during the survey.",
            )
            .optional(),
          metrics: z
            .array(z.string())
            .describe(
              "An array of specific metrics to track, e.g. ['NPS', 'CSAT', 'Ease of Use']",
            )
            .optional(),
          personalInfo: z
            .array(z.string())
            .describe(
              "An array of personal details that MUST be collected, e.g. ['Name', 'Email']",
            )
            .optional(),
          subjectIntelligence: z.any().optional(),
          extraContext: z.string().optional(),
        }),
        execute: async (statePartial) => {
          if (ctx.surveyConfig?.id) {
            await getDb().transaction(async (tx) => {
              const [currentSurvey] = await tx
                .select()
                .from(surveys)
                .where(eq(surveys.id, ctx.surveyConfig!.id));
              if (currentSurvey) {
                const expertState = (currentSurvey.expertState || {}) as Record<
                  string,
                  any
                >;
                await tx
                  .update(surveys)
                  .set({ expertState: { ...expertState, ...statePartial } })
                  .where(eq(surveys.id, ctx.surveyConfig!.id));
                const [currentConv] = await tx
                  .select()
                  .from(surveyCreationConversations)
                  .where(
                    eq(
                      surveyCreationConversations.surveyId,
                      ctx.surveyConfig!.id,
                    ),
                  );
                if (currentConv) {
                  const extractedData = (currentConv.extractedData ||
                    {}) as Record<string, any>;
                  await tx
                    .update(surveyCreationConversations)
                    .set({
                      extractedData: {
                        ...extractedData,
                        ...statePartial,
                        domainIdentified: true,
                      },
                      collectedInfo: {
                        ...(currentConv.collectedInfo || {}),
                        ...Object.keys(statePartial).reduce(
                          (a, c) => ({ ...a, [c]: true }),
                          {},
                        ),
                        domainIdentified: true,
                      },
                    })
                    .where(eq(surveyCreationConversations.id, currentConv.id));
                }
              }
            });
          }
          return { success: true, message: "Configuration saved." };
        },
      }),
      finishSurvey: tool({
        description: "Finalize the survey design.",
        inputSchema: z.object({
          summary: z.string().describe("Brief design summary."),
        }),
        execute: async ({ summary }) => {
          if (ctx.surveyConfig?.id) {
            await getDb()
              .update(surveyCreationConversations)
              .set({
                collectedInfo: {
                  objective: true,
                  targetAudience: true,
                  scope: true,
                  successCriteria: true,
                  constraints: true,
                  hypotheses: true,
                  tone: true,
                  requiredQuestions: true,
                  metrics: true,
                  personalInfo: true,
                  subjectDefined: true,
                  domainIdentified: true,
                  media: true,
                  subjectModelComplete: true,
                },
                status: "completed",
              })
              .where(
                eq(surveyCreationConversations.surveyId, ctx.surveyConfig.id),
              );
          }
          return { success: true, message: "Survey design complete", summary };
        },
      }),
      requestMediaUpload: tool({
        description: "Request the user upload an image, audio, or video.",
        inputSchema: z.object({
          reason: z.string().describe("Why media is needed."),
          allowedTypes: z.array(z.enum(["image", "audio", "video"])).optional(),
          description: z.string().optional(),
          learningGoal: z.string().optional(),
        }),
        // Client-side tool
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
      maxOutputTokens: 2000,
      stopWhen: stepCountIs(5),
      onFinish: async (result) => {
        logUsage({
          userId: ctx.userId,
          organizationId: ctx.organizationId,
          surveyId: ctx.surveyConfig?.id,
          type: "llm_text",
          provider: "google",
          modelName: (defaultModel as any).modelId ?? "gemini-2.5-flash",
          promptTokens: result.usage.inputTokens,
          completionTokens: result.usage.outputTokens,
          totalTokens: result.usage.totalTokens,
        });
        if (onFinish) await onFinish(result);
      },
    });
  }
}
