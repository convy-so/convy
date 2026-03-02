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
import { loadDomainSkills } from "./domain-skill-loader";
import { stepCountIs } from "ai";
import { z } from "zod";
import { BaseSpecialistAgent } from "./base-agent";
import type { AgentContext, ChecklistItem, SpecialistChecklist } from "./types";
import type { SurveyConfig } from "@/lib/prompts";
import { REQUIRED_INFORMATION } from "@/lib/surveys";
import type { VoiceAgentFunction } from "@/lib/voice/deepgram-voice-agent";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { surveys, surveyCreationConversations } from "@/db/schema";
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
        this.makeChecklistItem(
          "domain_onboarding",
          `Applied domain-specific onboarding questions for ${domainName}`,
          !!collected.domain_onboarding,
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
      const pendingDomainOnboarding = checklist.required.find(
        (i) => i.id === "domain_onboarding" && i.status === "pending",
      );
      const progress = checklist.required
        .map((i) => `${i.id}: ${i.status === "met" ? "✓" : "○"}`)
        .join(" | ");

      // Phase-specific instructions
      let phaseInstruction = "";
      if (pendingDomainOnboarding && config.domainId) {
        phaseInstruction = `
<phase_instruction priority="CRITICAL">
PHASE: DOMAIN ONBOARDING
The domain is identified as ${domainName}.
Now you must onboard the user using the "Dynamic Domain Onboarding" protocol defined in the domain skills below.

INSTRUCTIONS:
1. Ignore standard questions about metric bundles or survey structures for now.
2. Follow Step 1 in the Subject Intelligence Protocol exactly.
3. Ask ONE question at a time to get the missing context.
4. When you have collected the context, mark 'domain_onboarding' as done.
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
1. DELIBERATE: Based on the current survey subject, objective, and audience, decide if adding media (image, audio, or video) would significantly improve response quality or clarity.
2. RECOMMEND & REASON: 
   - If media is NOT needed: Explain why (e.g., "Since this is a quick internal pulse survey, I recommend keeping it text-only for speed").
   - If media IS recommended: Suggest a specific type (Image/Audio/Video) and explicitly explain why it fits the objective (e.g., "Given your goal of testing the new UI, a video of the checkout flow would be essential for context").
3. DECIDE: Ask the user if they agree with your recommendation or want to do something different.
4. COLLECT: If they want to proceed, ask for a description and learning goal (or propose them yourself if obvious from the context).
5. TRIGGER: Once context is captured, call 'requestMediaUpload' with the appropriate 'allowedTypes'.
6. ACKNOWLEDGE: After receiving the tool result (success or skip), acknowledge the user's choice and immediately transition to the <completion_behavior> to finalize the survey.
</media_protocol>

<media_guidance>
- NPS/CSAT (General): Usually no media needed. Text-only is faster for respondents.
- Product/UI Testing: Video or High-res Image is HIGHLY RECOMMENDED to anchor specific feedback points.
- Support/Ticketing: Screenshots are essential to confirm the issue being discussed.
- Employee Sentiment: A 'Personal Connection' image or a short video from leadership can boost empathy and response rates.
- Scientific/Academic: Diagram/Image is often needed for stimulus presentation.
- Market Research: Image (e.g., Logo/Concept) is essential for brand recognition tests.
</media_guidance>`;
    }

    // ------------------------------------------------------------------------
    // GENERIC FALLBACK (No domain skills loaded) -> DISCOVERY MODE
    // ------------------------------------------------------------------------
    return `<role>
You are an expert survey designer and consultant.
Your goal is to help the user design a high-quality survey by first understanding what they want to achieve.
Language: ${config?.language ?? "en"}
</role>

<specialist_mindset>
You are a warm, professional, and helpful consultant. 
You are NOT a generic AI assistant. You speak as a human expert who is here to guide the user.
</specialist_mindset>

<discovery_mission>
Your ONLY goal right now is to identify the broad **domain** of the survey.
Listen to the user's initial request. As soon as you have a general *gist* of the subject and audience, choose ONE of these exact domain IDs (Numbers):
1: Customer Experience & Satisfaction (products, software, user journeys, NPS)
2: Market Research & Consumer Intelligence (new concepts, brand awareness)
3: Workforce & Organizational Development (employee engagement, HR, internal)
5: Education & Learning Assessment (students, courses, training)
6: Civic Engagement & Public Opinion (governments, communities, non-profits)
7: Scientific & Academic Research (academic studies)
9: Demographic & Social Characterization (population studies)
10: Infrastructure & Systems Performance (IT, systems, usability)

DO NOT interrogate the user for specific details. As soon as you guess the domain, call the tool silently. The Domain Specialist will handle the detailed onboarding.
</discovery_mission>

${this.getReflectionProtocol()}

<rules priority="1">
1. INITIAL GREETING: If the very first message you receive is 'GREET_USER_START' or 'INITIAL_GREETING_SIGNAL', respond with a warm greeting like: "Hi! I'm looking forward to helping you build a great survey. What are we looking to measure today?"
2. FAST DISCOVERY: Do not interrogate the user for every detail. You only need the *gist* of their request. If they mention "customers" or "clients", it is Customer Experience. If they mention "employees", it is Workforce.
3. TRIGGER: As soon as you can guess the matching DOMAIN, immediately call the 'setSurveyDomain' tool with a brief 'summaryOfWhatWeKnow'. 
4. SILENT TRANSITION: Give NO warnings or explanations that you are calling a tool, switching roles, or picking a domain. Just call the tool silently.
</rules>`;
  }

  // --------------------------------------------------------------------------
  // Get Tools for Deepgram Voice Agent
  // Returns tools in Deepgram's function format (not Vercel AI SDK format)
  // --------------------------------------------------------------------------

  getDeepgramFunctions(): VoiceAgentFunction[] {
    return [
      {
        name: "setSurveyDomain",
        description:
          "Call this tool to lock in the survey domain once you have discovered the subject, audience, and objective.",
        parameters: {
          type: "object",
          properties: {
            domainId: {
              type: "number",
              description: "The exact numeric ID of the chosen domain",
            },
            summaryOfWhatWeKnow: {
              type: "string",
              description:
                "A detailed briefing note for the next agent summarizing the Subject, Audience, and Objective.",
            },
          },
          required: ["domainId", "summaryOfWhatWeKnow"],
        },
      },
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
      setSurveyDomain: tool({
        description:
          "Call this tool to lock in the survey domain once you have a general gist of the subject and audience. This happens silently and does not need to be announced to the user.",
        inputSchema: z.object({
          domainId: z
            .number()
            .describe(
              "The exact numeric ID of the chosen domain (e.g., 1, 3, 7)",
            ),
          summaryOfWhatWeKnow: z
            .string()
            .describe(
              "A detailed briefing note. Explain the Subject, Audience, and Objective so the next agent doesn't have to ask the user to repeat themselves.",
            ),
        }),
        execute: async ({ domainId, summaryOfWhatWeKnow }) => {
          if (!ctx.surveyConfig?.id) {
            return { error: "No active survey available." };
          }

          await db.transaction(async (tx) => {
            // 1. Update domain on survey table
            await tx
              .update(surveys)
              .set({ domainId })
              .where(eq(surveys.id, ctx.surveyConfig!.id));

            // 2. Put 'summaryOfWhatWeKnow' into expertState
            const currentSurvey = (
              await tx
                .select()
                .from(surveys)
                .where(eq(surveys.id, ctx.surveyConfig!.id))
            )[0];
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

            // 3. Update extractedData
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
                .set({
                  extractedData: { ...currentExtracted, domainId },
                })
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
            action_required: `PHASE: DOMAIN ONBOARDING. You are now the specialist for ${loadedSkills?.domainName || "this domain"}. Immediately ask the user for: 1. The name of the product/service, 2. What it does, and 3. Who the target users are. DO NOT suggest metrics or bundles yet.`,
          };
        },
      }),
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
          "Request the user to upload media (image, audio, or video) to include in the survey. This tool triggers a UI widget. After calling it, you will receive a result indicating if the upload was successful or skipped. You MUST acknowledge this result and then proceed to finalize the survey.",
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
      stopWhen: stepCountIs(5),
      tools: this.getTools(),
      onFinish: async (result) => {
        // Log usage for creation agent
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
