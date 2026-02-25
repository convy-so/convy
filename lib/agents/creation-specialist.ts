/**
 * Creation Specialist Agent
 *
 * Guides survey creators through the design process with domain-specific
 * expertise. Replaces the static `getSurveyCreationSystemPrompt` function
 * with an agent that:
 *
 * 1. Presents itself as a domain specialist (not a generic AI)
 * 2. Defines its own success criteria based on what THIS survey needs
 * 3. Applies domain-specific creation methodology (not generic questions)
 * 4. Uses learned patterns from past surveys in this domain (via RAG)
 *
 * This agent is used in: /api/surveys/[surveyId]/create/route.ts
 */

import { tool, streamText, type ModelMessage } from "ai";
import { defaultModel } from "@/lib/ai";
import { logUsage } from "@/lib/billing/logger";
import { stripScratchpadFromText } from "./scratchpad-filter";
import { SkillRegistry } from "./skill-registry";
import { stepCountIs } from "ai";
import { z } from "zod";
import { BaseSpecialistAgent } from "./base-agent";
import type { AgentContext, ChecklistItem, SpecialistChecklist } from "./types";
import type { SurveyConfig } from "@/lib/prompts";
import { REQUIRED_INFORMATION } from "@/lib/surveys";
import type { VoiceAgentFunction } from "@/lib/voice/deepgram-voice-agent";
// Research imports removed

export class CreationSpecialist extends BaseSpecialistAgent {
  constructor(context: AgentContext) {
    super("creation", context);
  }

  // --------------------------------------------------------------------------
  // Agent-Defined Success Criteria
  //
  // The creation agent defines what it needs to collect for THIS survey.
  // This is derived from the survey config and domain, not hardcoded.
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
          "scope",
          "Established breadth vs depth preference and main topics to cover",
          !!(collected.scope || expertState.scope?.mainTopics?.length),
        ),
        this.makeChecklistItem(
          "constraints",
          "Confirmed time limits and any sensitive topics to avoid",
          !!(collected.constraints || expertState.constraints?.timeLimit),
        ),
        this.makeChecklistItem(
          "tone",
          "Agreed on conversation tone (formal/casual/playful/empathetic)",
          !!(collected.tone || config.tone),
        ),
        this.makeChecklistItem(
          "metrics",
          "Identified which metrics to track (NPS, CSAT, CES, or custom)",
          !!(collected.metrics || config.metrics?.length),
        ),
        this.makeChecklistItem(
          "media",
          "Presented a specific, contextual recommendation for adding media. If yes, captured the description and learning goal.",
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
          "required_questions",
          "Collected any specific questions the creator wants to ensure are asked",
          !!(collected.required_questions || config.requiredQuestions?.length),
        ),
        this.makeChecklistItem(
          "domain_onboarding",
          `Applied domain-specific onboarding questions for ${domainName}`,
          !!collected.domain_onboarding,
        ),
      ],
    };
  }

  protected makeChecklistItem(
    id: string,
    description: string,
    status: ChecklistItem["status"] | boolean = "pending",
  ): ChecklistItem {
    return super.makeChecklistItem(id, description, status);
  }

  // --------------------------------------------------------------------------
  // System Prompt — Domain-Specialist Creation Guide
  // --------------------------------------------------------------------------

  private getReflectionProtocol(): string {
    return `<reflection_protocol>
Before EVERY response you write, open a <scratchpad> block and silently reason through these checks. The scratchpad is NEVER shown to the survey creator — it is stripped before delivery.

<scratchpad>
Check 1 — On-Topic: Did the user answer the question I just asked, or did they go off on a tangent or paste irrelevant info?
Check 2 — Clarification Needed: Is their answer vague or specific enough to check off a requirement?
Check 3 — Next Step: Which pending checklist item am I addressing next?
Verdict: [PASS / REDIRECT — and if REDIRECT, explicitly state how you will politely steer them back]
</scratchpad>

If the user goes off-topic, write a response AFTER the scratchpad that acknowledges their input but firmly redirects them to the current survey design question. The scratchpad itself is always stripped — ONLY write what the creator should see after </scratchpad>.
</reflection_protocol>`;
  }

  buildSystemPrompt(): string {
    const config = this.context.surveyConfig;
    if (!config) {
      return "You are a survey creation assistant. Error: Survey configuration is missing.";
    }

    // ------------------------------------------------------------------------
    // NEW SYSTEM with Loaded Skills (Hybrid support)
    // ------------------------------------------------------------------------
    if (this.context.loadedDomainSkills) {
      const { domainName, coreContent, surveyTypeContent, matchedSurveyType } =
        this.context.loadedDomainSkills;
      // Calculate progress and phase
      const checklist = this.buildChecklist(config);
      const pendingSubjectIntel = checklist.required.find(
        (i) => i.id === "subject_intelligence" && i.status === "pending",
      );
      const progress = checklist.required
        .map((i) => `${i.id}: ${i.status === "met" ? "✓" : "○"}`)
        .join(" | ");

      // Phase-specific instructions
      let phaseInstruction = "";
      if (pendingSubjectIntel && config.domainId) {
        phaseInstruction = `
<phase_instruction priority="CRITICAL">
PHASE: SUBJECT INTELLIGENCE
The domain is identified as ${domainName}.
Now you must build a deep model of the subject using the "Subject Intelligence Protocol" defined in the domain skills below.

INSTRUCTIONS:
1. Ignore standard questions about objective/scope/audience for now.
2. Follow the protocol in the loaded skills exactly.
3. Ask ONE question at a time.
4. When you have built a complete model, mark the item as done.
</phase_instruction>
`;
      }

      return `<role>
You are the Creation Specialist for ${domainName}.
You leverage specialized domain knowledge to design high-quality conversational surveys.
Language: ${config.language ?? "en"}
</role>

<specialist_mindset>
You are NOT a generic AI. You are a ${domainName} expert.
Speak with authority. Use the vocabulary of the domain.
Reject vague answers.
</specialist_mindset>

${this.getChecklistSection()}

<current_progress>
${progress}
</current_progress>

${phaseInstruction}

<domain_skills>
${coreContent}

${surveyTypeContent}
</domain_skills>

${this.getSkillsSection()}

${this.getKnowledgeSection()}

${this.getReflectionProtocol()}

<rules priority="1">
1. SUBJECT FIRST: Always identify the specific product/service/experience before anything else
3. SPEECH: Ask one question at a time. Wait for answer.
4. CLARITY: If answer is vague, ask for 3 examples.
5. MAINTAIN CONTROL: If the user provides info that is off-topic (e.g. pasting sample data), politely redirect them back to the current design question. Do NOT follow tangents.
</rules>

<completion_behavior>
When all checklist items EXCEPT potentially 'media' are MET:
1. You MUST execute the <media_protocol> before finalizing.

When ALL items (including media decision) are MET:
1. Summarize the design in 2-3 sentences.
2. Say: "Please click the 'Go to Sample Conversations' button below to test your survey."
3. Call 'finishSurvey'.
</completion_behavior>

<media_protocol>
You are strictly forbidden from calling 'finishSurvey' until you have addressed the media requirement.
1. EVALUATE: Based on the current survey subject, determine if an image, audio, or video would improve response quality.
2. RECOMMEND: Provide a specific, reasoned recommendation (e.g., "Since you're surveying about a product defect, an image would help respondents visualize the issue").
3. DECIDE: Ask the user if they want to add media. 
4. COLLECT: If YES, ask for a description and what they want to learn from it BEFORE calling the tool.
5. TRIGGER: Once context is captured, call 'requestMediaUpload'.
</media_protocol>

<media_guidance>
- NPS/CSAT: Usually no media needed, but a 'Thank You' image can boost engagement.
- Product Testing: Image/Video is HIGHLY RECOMMENDED.
- Support/Ticketing: Screenshot/Image is HIGHLY RECOMMENDED.
- Demographic: No media needed.
</media_guidance>`;
    }

    // ------------------------------------------------------------------------
    // ------------------------------------------------------------------------
    // GENERIC FALLBACK (No domain skills loaded)
    // ------------------------------------------------------------------------
    const collectedInfo = config as any;
    const progress = Object.entries(REQUIRED_INFORMATION)
      .map(([key]) => {
        const collected = collectedInfo[key] != null;
        return `${key}: ${collected ? "✓" : "○"}`;
      })
      .join(" | ");

    return `<role>
You are a professional Survey Creation Specialist.
You help survey creators design effective conversational surveys.
You collect information through natural conversation — not a form or checklist.
Language: ${config?.language ?? "en"}
</role>

<specialist_mindset>
You are NOT a generic AI assistant. You are a consultant.
Your goal is to guide the user to a high-quality survey design.
Reject vague answers. Demand specificity.
</specialist_mindset>

${this.getChecklistSection()}

<current_progress>
${progress}
</current_progress>

${this.getSkillsSection()}

${this.getKnowledgeSection()}

${this.getPatternLearningsSection()}

${this.getReflectionProtocol()}

<rules priority="1">
1. SUBJECT FIRST: Always identify the specific product/service/experience before anything else
2. NEVER INFER: Ask explicitly, never assume from context
3. REQUIRE SPECIFICITY: Reject vague answers
4. ONE QUESTION AT A TIME: Single focused question, wait for response
5. ACKNOWLEDGE FIRST: Always acknowledge the user's response before asking the next question
6. MAINTAIN CONTROL: If the user provides info that is off-topic (e.g. pasting sample data), politely redirect them back to the current design question. Do NOT follow tangents.
</rules>

<completion_behavior>
When all required information EXCEPT potentially 'media' is collected:
1. You MUST execute the <media_protocol> before finalizing.

When ALL information (including media decision) is collected:
1. Give a brief, confident summary: "Here's what we've designed..."
2. Say exactly: "Please click the 'Go to Sample Conversations' button below to test your survey."
3. Then call the 'finishSurvey' tool.
4. Do NOT ask more questions after this point.
</completion_behavior>

<media_protocol>
You are strictly forbidden from calling 'finishSurvey' until you have addressed the media requirement.
1. EVALUATE: Based on the current survey subject, determine if an image, audio, or video would improve response quality.
2. RECOMMEND: Provide a specific, reasoned recommendation (e.g., "Since you're surveying about a product defect, an image would help respondents visualize the issue").
3. DECIDE: Ask the user if they want to add media. 
4. COLLECT: If YES, ask for a description and what they want to learn from it BEFORE calling the tool.
5. TRIGGER: Once context is captured, call 'requestMediaUpload'.
</media_protocol>`;
  }

  // --------------------------------------------------------------------------
  // Get Tools for Deepgram Voice Agent
  // Returns tools in Deepgram's function format (not Vercel AI SDK format)
  // --------------------------------------------------------------------------

  getDeepgramFunctions(): VoiceAgentFunction[] {
    return [
      {
        name: "finishSurvey",
        description:
          "Signal that all required survey information has been collected and the survey design is complete.",
        parameters: {
          type: "object",
          properties: {
            summary: {
              type: "string",
              description: "Brief summary of the survey that was designed",
            },
          },
          required: ["summary"],
        },
      },
      {
        name: "requestMediaUpload",
        description:
          "Trigger the media upload UI for the user. Call this when the user wants to add images, audio, or video to the survey.",
        parameters: {
          type: "object",
          properties: {
            allowedTypes: {
              type: "array",
              items: { type: "string", enum: ["image", "audio", "video"] },
              description: "List of media types the user is allowed to upload.",
            },
            description: {
              type: "string",
              description: "A brief description of what the media is.",
            },
            learningGoal: {
              type: "string",
              description:
                "What the survey creator wants to learn from this media.",
            },
          },
          required: ["allowedTypes", "description"],
        },
      },
    ];
  }

  // --------------------------------------------------------------------------
  // Agent Tools
  // --------------------------------------------------------------------------

  getTools(): Record<string, any> {
    const ctx = this.context;
    return {
      loadSkill: tool({
        description:
          "Load detailed instructions for a specific specialized skill.",
        inputSchema: z.object({
          skillId: z
            .string()
            .describe("The ID of the skill to load (e.g., 'BiasDetector')"),
        }),
        execute: async ({ skillId }) => {
          const skill = await SkillRegistry.getSkill(skillId);
          if (!skill) return { error: "Skill not found" };
          return { instructions: skill.content };
        },
      }),
      save_survey_configuration: tool({
        description:
          "Update the survey context with specific configuration or state data based on the active domain protocol. Examples: { journeyStage: 'Onboarding' } or { metric: 'NPS' }.",
        inputSchema: z
          .record(z.string(), z.any())
          .describe(
            "A flat JSON object containing key-value pairs of the newly discovered state according to the expert schema.",
          ),
        execute: async (statePartial) => {
          const { db } = await import("@/db");
          const { eq } = await import("drizzle-orm");
          const { surveys, surveyCreationConversations } =
            await import("@/db/schema");

          if (ctx.surveyConfig?.id) {
            await db.transaction(async (tx) => {
              const currentSurvey = (
                await tx
                  .select()
                  .from(surveys)
                  .where(eq(surveys.id, ctx.surveyConfig!.id))
              )[0];

              if (currentSurvey) {
                const expertState = (currentSurvey.expertState || {}) as Record<
                  string,
                  any
                >;
                const newState = { ...expertState, ...statePartial };

                await tx
                  .update(surveys)
                  .set({
                    expertState: newState,
                  })
                  .where(eq(surveys.id, ctx.surveyConfig!.id));

                // Also update the creation conversation so the UI can use it
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

                  // Ensure domainIdentified is set if we are saving configuration (expert flow)
                  const flagsToSet = {
                    ...statePartial,
                    domainIdentified: true,
                  };

                  await tx
                    .update(surveyCreationConversations)
                    .set({
                      extractedData: { ...extractedData, ...flagsToSet },
                      collectedInfo: {
                        ...(currentConv.collectedInfo || {}),
                        ...Object.keys(flagsToSet).reduce(
                          (a, c) => ({ ...a, [c]: true }),
                          {},
                        ),
                      },
                    })
                    .where(eq(surveyCreationConversations.id, currentConv.id));
                }
              }
            });
          }

          return {
            success: true,
            message: `Configuration saved successfully.`,
          };
        },
      }),
      finishSurvey: tool({
        description:
          "Signal that all required survey information has been collected and the survey design is complete.",
        inputSchema: z.object({
          summary: z
            .string()
            .describe("Brief summary of the survey that was designed"),
        }),
        execute: async ({ summary }) => {
          // Mark all collectedInfo flags as complete so the frontend can show the button
          if (ctx.surveyConfig?.id) {
            try {
              const { db } = await import("@/db");
              const { eq } = await import("drizzle-orm");
              const { surveyCreationConversations } =
                await import("@/db/schema");
              await db
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
            } catch (e) {
              console.error(
                "[finishSurvey] Failed to update collectedInfo:",
                e,
              );
            }
          }
          return { success: true, message: "Survey design complete", summary };
        },
      }),
      requestMediaUpload: tool({
        description:
          "Request the user to upload media (image, audio, or video) to include in the survey. This is a CLIENT-SIDE tool — do NOT expect a server result. The user will be shown an upload widget in the chat.",
        inputSchema: z.object({
          reason: z
            .string()
            .describe(
              "Why you are requesting media and what specific feedback the survey creator wants to collect about it",
            ),
          allowedTypes: z
            .array(z.enum(["image", "audio", "video"]))
            .optional()
            .describe("List of media types the user is allowed to upload."),
          description: z
            .string()
            .optional()
            .describe("A brief description provided by the user."),
          learningGoal: z
            .string()
            .optional()
            .describe("What the user wants to learn from this media."),
        }),
        // No execute: intentionally client-side. The frontend MediaUploadFlow component
        // handles this tool call and provides the result via addToolOutput.
      }),
    };
  }

  // --------------------------------------------------------------------------
  // Stream — returns a streamText result for the API route
  // --------------------------------------------------------------------------

  stream(
    messages: ModelMessage[],
    onFinish?: (params: {
      text: string;
      response: any;
      usage: any;
    }) => Promise<void>,
  ) {
    const ctx = this.context;
    if (!ctx.surveyConfig) {
      throw new Error("Cannot stream without survey configuration");
    }

    return streamText({
      model: defaultModel,
      system: this.buildSystemPrompt(),
      messages,
      tools: this.getTools(),
      stopWhen: stepCountIs(10),
      onFinish: async (result) => {
        // Log usage for creation agent
        logUsage({
          userId: ctx.userId,
          organizationId: ctx.organizationId,
          surveyId: ctx.surveyConfig?.id,
          type: "llm_text",
          provider: "google",
          modelName: (defaultModel as any).modelId,
          promptTokens: result.usage.inputTokens,
          completionTokens: result.usage.outputTokens,
          totalTokens: result.usage.totalTokens,
        });

        if (onFinish) {
          await onFinish({
            text: result.text,
            response: result.response,
            usage: result.usage,
          });
        }
      },
    });
  }
}
