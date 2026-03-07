import { tool, streamText, stepCountIs, type ModelMessage } from "ai";
import { z } from "zod";
import { BaseSpecialistAgent } from "./base-agent";
import type { AgentContext, SpecialistChecklist } from "./types";
import type { SurveyConfig } from "@/lib/prompts";
import { defaultModel } from "@/lib/ai";
import { logUsage } from "@/lib/billing/logger";
import { TONE_PROFILES } from "@/lib/surveys";
import { SkillRegistry } from "./skill-registry";
import type { VoiceAgentFunction } from "@/lib/voice/deepgram-voice-agent";

export class ConductingSpecialist extends BaseSpecialistAgent {
  constructor(context: AgentContext) {
    super("conducting", context);
  }

  // --------------------------------------------------------------------------
  // Agent-Defined Success Criteria
  // --------------------------------------------------------------------------

  protected buildChecklist(config: SurveyConfig): SpecialistChecklist {
    const required: ReturnType<typeof this.makeChecklistItem>[] = [];
    const aspirational: ReturnType<typeof this.makeChecklistItem>[] = [];

    // REQUIRED 1: Core Goal Alignment
    required.push(
      this.makeChecklistItem(
        "goal_alignment",
        `Ensure the participant addresses the primary objective: ${config.coreObjective || config.expertState?.objective?.goal || config.information}`,
      ),
    );

    // REQUIRED 2: Explicit Metrics (The "Metric Contract")
    if (config.metrics?.length) {
      config.metrics.forEach((metric, i) => {
        required.push(
          this.makeChecklistItem(
            `metric_${i}`,
            `Gathered sufficient data to evaluate Metric: "${metric}"`,
          ),
        );
      });
    }

    // REQUIRED 3: Mandatory Questions
    if (config.requiredQuestions?.length) {
      config.requiredQuestions.forEach((q, i) => {
        required.push(
          this.makeChecklistItem(
            `mandatory_q_${i}`,
            `Asked required question: "${q.slice(0, 80)}${q.length > 80 ? "..." : ""}"`,
          ),
        );
      });
    }

    // REQUIRED 4: Personal Information
    if (config.personalInfo?.length) {
      required.push(
        this.makeChecklistItem(
          "personal_info_captured",
          `Captured personal info: ${config.personalInfo.join(", ")}`,
        ),
      );
    }

    // ASPIRATIONAL: Hypotheses & Success Criteria
    if (config.expertState?.hypotheses?.assumptions?.length) {
      config.expertState.hypotheses.assumptions.forEach(
        (assumption: string, i: number) => {
          aspirational.push(
            this.makeChecklistItem(
              `hypothesis_${i}`,
              `Tested creator assumption: "${assumption.slice(0, 80)}..."`,
            ),
          );
        },
      );
    }

    const insightTypes =
      config.expertState?.successCriteria?.insightTypes ?? [];
    if (insightTypes.includes("emotional")) {
      aspirational.push(
        this.makeChecklistItem(
          "emotional_peak",
          "Captured emotional peak/valley moments (The 'Feelings' layer)",
        ),
      );
    }
    if (insightTypes.includes("behavioral")) {
      aspirational.push(
        this.makeChecklistItem(
          "journey_reconstruction",
          "Reconstructed the specific user journey/behavior (The 'Action' layer)",
        ),
      );
    }

    return { required, aspirational };
  }

  // Reasoning logic is handled by the think_and_respond tool.

  buildSystemPrompt(): string {
    const config = this.context.surveyConfig;
    if (!config) return "Survey configuration is missing.";

    const context = this.context.rollingContext;
    const { domainName, coreContent, surveyTypeContent } =
      this.context.loadedDomainSkills || {};

    // Build Subject Intelligence Section
    let subjectIntelSection = "";
    if (this.context.subjectIntelligence) {
      const si = this.context.subjectIntelligence;
      subjectIntelSection = `
<subject_intelligence>
Vocabulary: ${si.userVocabulary.join(", ")}
Known Pain Points: ${si.knownPainPoints.join(", ")}
Intelligent Probes: ${si.intelligentProbes.join(", ")}
</subject_intelligence>`;
    }

    const mediaSection = config.media?.length
      ? `\n<available_media>\n${config.media.map((m) => `• ID: ${m.id} | ${m.description} | Goal: ${m.contextForUse}`).join("\n")}\nPROACITVITY RULE: You MUST show media before the 70% progress mark if it aids feedback. Verbally name the media ID when displayed.\n</available_media>`
      : "";

    const contextSection = context
      ? `
<conversation_context>
Progress: ${Math.round(context.progress.completionPercentage)}%
Elapsed: ${Math.round(context.progress.elapsedMinutes)} min
Style: ${context.memory.participantStyle ?? "Neutral"}
Topics Covered: ${context.memory.topicsCovered.join(", ") || "None"}
</conversation_context>`
      : "";

    return `
<role>
IDENTITY: You are a professional ${domainName || "Survey"} Conducting Specialist.
GOAL: Conduct a master-class interview regarding: "${config.coreObjective || config.expertState?.objective?.goal || config.information}"
AUDIENCE: ${config.expertState?.targetAudience?.description || "Survey Participants"}
${this.getToneGuidelines()}
LANGUAGE: ${this.context.language ?? config.language ?? "en"}
</role>

${this.getGlobalArchitectureRules()}

${this.getChecklistSection()}

${this.getConstitutionalConstraints()}

<expert_protocols>
${coreContent || ""}
${surveyTypeContent || ""}
${this.buildQuestioningStrategy(config.expertState?.successCriteria?.insightTypes ?? [])}
</expert_protocols>

${subjectIntelSection}

${contextSection}

${mediaSection}

${this.getSkillsSection()}

${this.getKnowledgeSection()}

${this.getPatternLearningsSection()}

<completion_protocol>
Once the REQUIRED checklist IDs are marked 'met':
1. Express sincere gratitude.
2. Call 'finishSurvey'.
3. Do NOT ask any further questions.
</completion_protocol>

<final_directive>
Use 'think_and_respond' to plan your next move. Capture qualitative evidence for a DIFFERENT required ID in each turn if possible.
</final_directive>
`.trim();
  }

  // --------------------------------------------------------------------------
  // Tone Guidelines
  // --------------------------------------------------------------------------

  protected getToneGuidelines(): string {
    const config = this.context.surveyConfig;
    if (!config) return "";

    const tone = config.tone || "casual";
    const toneProfile = TONE_PROFILES[tone];

    if (!toneProfile) return "";

    return `\nCONVERSATION STYLE (${tone}):\n- ${toneProfile.guidelines}\n- Example phrasing: "${toneProfile.example}"`;
  }

  // --------------------------------------------------------------------------
  // Questioning Strategy
  // --------------------------------------------------------------------------

  private buildQuestioningStrategy(
    insightTypes: ("emotional" | "behavioral" | "rational")[],
  ): string {
    if (!insightTypes.length) return "";

    const strategies: string[] = [];

    if (insightTypes.includes("emotional")) {
      strategies.push(`
EMOTIONAL INSIGHTS (required):
• Use feeling-first questions: "How did that make you feel?"
• Probe emotional triggers: "What was going through your mind when...?"
• Ask about peaks and valleys: "What was the most frustrating/delightful moment?"
• Surface underlying emotions: "When you say 'disappointed', what do you mean exactly?"`);
    }

    if (insightTypes.includes("behavioral")) {
      strategies.push(`
BEHAVIORAL INSIGHTS (required):
• Use journey reconstruction: "Walk me through exactly what happened"
• Ask about specific actions: "What did you click/do/say next?"
• Probe decision points: "At that moment, what made you decide to...?"
• Get concrete examples, not generalizations`);
    }

    if (insightTypes.includes("rational")) {
      strategies.push(`
RATIONAL INSIGHTS (required):
• Ask for comparisons: "Compared to [alternative], how does this...?"
• Probe reasoning: "What made you think that?" "Why did that matter?"
• Ask for evaluations: "On a scale of 1-10..." then always ask "Why that score?"
• Surface trade-offs: "What would you give up to get...?"`);
    }

    return `<questioning_strategy>
The survey creator needs these types of insights. Calibrate your questioning accordingly:
${strategies.join("\n")}
</questioning_strategy>`;
  }

  // --------------------------------------------------------------------------
  // Get Tools for Deepgram Voice Agent
  // --------------------------------------------------------------------------

  getDeepgramFunctions(): VoiceAgentFunction[] {
    const config = this.context.surveyConfig;
    const functions: VoiceAgentFunction[] = [];
    if (!config) return functions;

    functions.push({
      name: "think_and_respond",
      description:
        "Use this tool to plan your response and update the survey checklist state based on the user's input. You MUST call this tool FIRST.",
      parameters: {
        type: "object",
        properties: {
          message_to_user: {
            type: "string",
            description:
              "The FINAL message to speak aloud. Must be conversational and natural. No internal thoughts.",
          },
          internal_reasoning: {
            type: "string",
            description:
              "Deep context analysis. Think step-by-step about what the user just said, what you still need to ask based on your checklist, and what approach/tone to use.",
          },
          state_updates: {
            type: "object",
            description:
              "Key-value pairs of any checklist items or data points you have successfully collected from this specific turn.",
            additionalProperties: { type: "string" },
          },
        },
        required: ["message_to_user", "internal_reasoning", "state_updates"],
      },
    });

    if (config.media && config.media.length > 0) {
      functions.push({
        name: "showMedia",
        description:
          "Display a media item (image, audio, or video) to the participant in the conversation",
        parameters: {
          type: "object",
          properties: {
            mediaId: {
              type: "string",
              description: "The unique ID of the media item to display",
            },
          },
          required: ["mediaId"],
        },
      });
    }

    functions.push({
      name: "finishSurvey",
      description:
        "Signal that the survey conversation is complete and should end. Call this when you have covered all required topics and gathered sufficient information from the participant.",
      parameters: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            description:
              "Optional brief reason for ending (e.g., 'all topics covered', 'participant request')",
          },
        },
        required: [],
      },
    });

    return functions;
  }

  // --------------------------------------------------------------------------
  // Agent Tools
  // --------------------------------------------------------------------------

  getTools(onMediaDisplay?: (media: any) => void): Record<string, any> {
    const config = this.context.surveyConfig;
    return {
      think_and_respond: tool({
        description:
          "Use this tool to plan your response, update the survey checklist state based on the user's input, and formulate the exact text you want to say to the user. You MUST call this tool.",
        inputSchema: z.object({
          message_to_user: z
            .string()
            .describe(
              "The FINAL message to speak aloud. Must be conversational and natural. No internal thoughts.",
            ),
          internal_reasoning: z
            .string()
            .describe(
              "Deep context analysis. Think step-by-step about what the user just said, what you still need to ask based on your checklist, and what approach/tone to use.",
            ),
          state_updates: z
            .record(z.string())
            .describe(
              "Key-value pairs of any checklist items or data points you have successfully collected from this specific turn.",
            ),
        }),
        execute: async ({
          message_to_user,
          internal_reasoning,
          state_updates,
        }) => {
          console.log(
            `[ConductingAgent:Tool:think_and_respond] Message: ${message_to_user.slice(0, 50)}...`,
          );
          console.log(
            `[ConductingAgent:Tool:think_and_respond] Reasoning: ${internal_reasoning.slice(0, 100)}...`,
          );
          console.log(
            `[ConductingAgent:Tool:think_and_respond] State updates: ${Object.keys(state_updates).join(", ")}`,
          );
          return { success: true, message: "State logged." };
        },
      }),
      loadSkill: tool({
        description:
          "Load detailed instructions for a specific specialized skill.",
        inputSchema: z.object({
          skillId: z
            .string()
            .describe("The ID of the skill to load (e.g., 'STARProber')"),
        }),
        execute: async ({ skillId }) => {
          const skill = await SkillRegistry.getSkill(skillId);
          if (!skill) return { error: "Skill not found" };
          return { instructions: skill.content };
        },
      }),
      showMedia: tool({
        description:
          "Display a media item (image, audio, or video) to the participant",
        inputSchema: z.object({
          mediaId: z
            .string()
            .describe("The unique ID of the media item to display"),
        }),
        execute: async ({ mediaId }) => {
          const media = config?.media?.find((m: any) => m.id === mediaId);
          if (!media) return { error: "Media not found" };
          if (onMediaDisplay) onMediaDisplay(media);
          return { success: true, media };
        },
      }),
      finishSurvey: tool({
        description:
          "Signal that the survey conversation is complete. Call when all required topics are covered.",
        inputSchema: z.object({
          reason: z
            .string()
            .optional()
            .describe("Brief reason for ending the conversation"),
        }),
        execute: async ({ reason }) => ({
          success: true,
          message: "Survey complete",
          reason: reason ?? "all topics covered",
        }),
      }),
    };
  }

  // --------------------------------------------------------------------------
  // Stream
  // --------------------------------------------------------------------------

  stream(
    messages: ModelMessage[],
    onMediaDisplay?: (media: any) => void,
    onFinish?: (params: {
      text: string;
      response: any;
      usage: import("ai").LanguageModelUsage;
    }) => Promise<void>,
    dynamicSystemDirective?: string,
  ) {
    const config = this.context.surveyConfig;
    if (!config) {
      throw new Error("Cannot stream without survey configuration");
    }

    const baseSystem = this.buildSystemPrompt();
    const finalSystem = dynamicSystemDirective
      ? `${baseSystem}\n\n<dynamic_instruction>\n${dynamicSystemDirective}\n</dynamic_instruction>`
      : baseSystem;

    console.log(
      `[ConductingAgent:Stream] Messages: ${messages.length}. SystemPrompt length: ${finalSystem.length}`,
    );

    return streamText({
      model: defaultModel,
      system: finalSystem,
      messages,
      tools: this.getTools(onMediaDisplay),
      maxOutputTokens: 2000,
      stopWhen: stepCountIs(5),
      onFinish: async (params) => {
        logUsage({
          userId: this.context.userId,
          organizationId: this.context.organizationId,
          surveyId: config.id,
          type: "llm_text",
          provider: "google",
          modelName:
            (defaultModel as { modelId?: string }).modelId ??
            "gemini-2.5-flash",
          promptTokens: params.usage.inputTokens,
          completionTokens: params.usage.outputTokens,
          totalTokens: params.usage.totalTokens,
        });
        if (onFinish) await onFinish(params);
      },
    });
  }
}
