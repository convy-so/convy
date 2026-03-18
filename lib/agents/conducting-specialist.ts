import { tool, streamText, stepCountIs, type ModelMessage } from "ai";
import { z } from "zod";
import { BaseSpecialistAgent } from "./base-agent";
import type { AgentContext, SpecialistChecklist } from "./types";
import type { SurveyConfig } from "@/lib/prompts";
import { defaultModel } from "@/lib/ai";
import { logUsage } from "@/lib/billing/logger";
import { TONE_PROFILES } from "@/lib/surveys";
import { SkillEngine } from "./skill-system/engine";
import type { VoiceAgentFunction } from "@/lib/voice/deepgram-voice-agent";
import { KnowledgeService } from "@/lib/knowledge-service";

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

    const state = this.context.expertState;
    let adaptationSection = "";

    if (state) {
      // Logic for adaptation guidance is now centralized in BaseSpecialistAgent.getAdaptationHintsSection()
      adaptationSection = this.getAdaptationHintsSection();
    }

    // Build Subject Intelligence Section
    let subjectIntelSection = "";
    if (this.context.subjectIntelligence) {
      const si = this.context.subjectIntelligence;
      const findingsEntries = Object.entries(si.findings || {})
        .map(
          ([key, value]) =>
            `• ${key}: ${Array.isArray(value) ? value.join(", ") : value}`,
        )
        .join("\n");

      subjectIntelSection = `
<subject_intelligence>
${findingsEntries}
INTENT: Use these findings to conduct a deeper, more specialized interview.
${si.intelligentProbes?.length ? `PROBES: ${si.intelligentProbes.join(", ")}` : ""}
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

    const effectiveFeedback = this.context.sampleFeedback || config.improvementFeedback;
    const feedbackSection = effectiveFeedback
      ? `
<creator_feedback>
The following feedback was provided by the survey creator during previous rehearsals. YOU MUST apply these improvements precisely to your behavior and questioning strategy:
${effectiveFeedback}
</creator_feedback>`
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

${feedbackSection}

${subjectIntelSection}

${contextSection}

${mediaSection}

${this.getPrunedStateSection()}
      
${this.getSkillsSection()}

${this.getKnowledgeSection()}

<completion_protocol>
Once the REQUIRED checklist IDs are marked 'met':
1. Express sincere gratitude.
2. Call 'finishSurvey'.
3. Do NOT ask any further questions.
</completion_protocol>

<final_directive>
You MUST call 'think_and_respond' in EVERY turn.
1. Use 'internal_reasoning' to audit your progress against the REQUIRED IDs.
2. Formulate your conversational response in 'message_to_user'.
3. Update collected data in 'state_updates'.
Your 'message_to_user' is what the participant will actually see. Never leave it empty.
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
          expert_state_updates: z.object({
            metNodes: z.array(z.string()).optional().describe("IDs of research nodes (topics) that were adequately covered in this turn"),
            respondentSentiment: z.string().optional().describe("Brief label for participant's current sentiment"),
            observedBiases: z.array(z.string()).optional().describe("Any social or cognitive biases detected in this turn"),
            keyVerbatims: z.array(z.object({
              nodeId: z.string(),
              quote: z.string()
            })).optional().describe("Structured quotes to attach to specific research nodes")
          }).optional().describe("V2 Architecture: Structured updates for the ExpertState"),
        },
        required: ["message_to_user", "internal_reasoning"],
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
        description: "Analyze the respondent's input, update the expert state, and generate a conversational response.",
        inputSchema: z.object({
          message_to_user: z.string().describe("The actual text shown to the participant."),
          internal_reasoning: z.string().describe("Your logic for the current turn."),
          expert_state_updates: z.record(z.any()).optional().describe("V2 ExpertState updates (Zod-compatible)."),
        }),
        execute: async ({ message_to_user, internal_reasoning, expert_state_updates }) => {
          if (expert_state_updates && this.context.expertState) {
            // Apply updates to local context
            Object.assign(this.context.expertState, expert_state_updates);
            
            // Persist to Redis
            await this.saveExpertState(expert_state_updates);

            // Index insights if any nodes were marked as 'met'
            if (expert_state_updates.coverageTracker?.nodes) {
              await KnowledgeService.indexSurveyInsights(
                this.context.surveyConfig?.id || "unknown",
                expert_state_updates.coverageTracker.nodes
              );
            }
          }
          return { success: true };
        },
      }),
      loadSkill: tool({
        description: "Load detailed instructions for a specific specialized skill.",
        inputSchema: z.object({
          skillId: z.string().describe("The ID of the skill to load."),
        }),
        execute: async ({ skillId }) => {
          const skill = await SkillEngine.loadSkill(skillId, "conducting");
          return skill ? { instructions: skill.content } : { error: "Skill not found" };
        },
      }),
      showMedia: tool({
        description: "Show a piece of media (image/video) to the respondent.",
        inputSchema: z.object({
          mediaId: z.string().describe("The ID of the media to show."),
        }),
        execute: async ({ mediaId }) => {
          const media = config?.media?.find((m: any) => m.id === mediaId);
          if (media && onMediaDisplay) onMediaDisplay(media);
          return media ? { success: true } : { error: "Media not found" };
        },
      }),
      handoffToHuman: tool({
        description: "Escalate the conversation to a human moderator.",
        inputSchema: z.object({
          reason: z.string().optional().describe("Why is this being escalated?"),
        }),
        execute: async ({ reason }) => ({ success: true, reason: reason ?? "complete" }),
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
