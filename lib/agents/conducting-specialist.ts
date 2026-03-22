import { tool, streamText, stepCountIs, type ModelMessage } from "ai";
import { z } from "zod";
import { BaseSpecialistAgent } from "./base-agent";
import type { AgentContext, SpecialistChecklist } from "./types";
import type { SurveyConfig } from "@/lib/prompts";
import { defaultModel } from "@/lib/ai";
import { logUsage } from "@/lib/billing/logger";
import { TONE_PROFILES } from "@/lib/surveys";
import type { VoiceAgentFunction } from "@/lib/voice/deepgram-voice-agent";
import { domainBrain } from "@/lib/domain-brain";
import { assembleTranscriptContext } from "@/lib/memory-bridge";

export class ConductingSpecialist extends BaseSpecialistAgent {
  constructor(context: AgentContext) {
    super("conducting", context);
  }

  // --------------------------------------------------------------------------
  // Agent-Defined Success Criteria
  // --------------------------------------------------------------------------

  protected buildChecklist(config: SurveyConfig): SpecialistChecklist {
    // Legacy support: Returning empty as V4 uses getUnifiedNodes() and ExpertState nodes.
    return { required: [], aspirational: [] };
  }

  // Reasoning logic is handled by the think_and_respond tool.

  buildSystemPrompt(): string {
    const config = this.context.surveyConfig;
    if (!config) return "Survey configuration is missing.";
    const { domainName, coreContent, surveyTypeContent } =
      this.context.loadedDomainSkills || {};

    const modality = this.context.modality || "text";
    const behavioralProfile = this.getBehavioralProfile();

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

    const contextSection = state
      ? `
<conversation_context>
Progress: ${Math.round(domainBrain.calculateCoverage(state) * 100)}%
Adaptation: ${this.getEngagementSummaryFromState(state)}
Next Priority: ${domainBrain.getNextPriorityTopic(state)?.label || "Wrap up"}
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
GOAL: Conduct a master-class interview regarding: "${config.expertState?.objective?.goal || config.coreObjective || config.information}"
AUDIENCE: ${config.expertState?.targetAudience?.description || "Survey Participants"}
${this.getToneGuidelines()}
LANGUAGE: ${this.context.language ?? config.language ?? "en"}
</role>

${this.getGlobalArchitectureRules()}

${this.getChecklistSection()}

${this.getConstitutionalConstraints()}

<expert_protocols>
${behavioralProfile}
${surveyTypeContent || ""}
${this.buildQuestioningStrategy(config.expertState?.successCriteria?.insightTypes ?? [])}
</expert_protocols>

<thinking_protocol>
You are operating in a low-latency STREAMING JSON MODE.
For every turn, your response MUST be a perfectly formatted, raw JSON object containing exactly two fields:
1. "reasoning": A brief internal audit of the checklist. Keep this EXTREMELY concise (under 50 words).
2. "response": The natural, conversational text spoken to the user.

Example Format:
{
  "reasoning": "User answered X. This satisfies Node [RT-01]. Next, I must probe for [RT-02] to understand Y.",
  "response": "That makes perfect sense. What did you think of Z?"
}
</thinking_protocol>

${feedbackSection}

${subjectIntelSection}

${contextSection}

${mediaSection}

${this.getPrunedStateSection()}
      
${this.getSkillsSection()}

${this.getKnowledgeSection()}

<completion_protocol>
Once the REQUIRED checklist IDs are marked 'met', you may conclude:
1. Express sincere gratitude.
2. Call 'finishSurvey' tool if available.
3. Do NOT ask any further questions.
</completion_protocol>

<final_directive>
Do NOT use markdown formatting (like \`\`\`json). Output the raw JSON object starting with '{'.
Do NOT output any other text before or after the JSON object.
Never leave the response field empty.
</final_directive>
`.trim();
  }

  // --------------------------------------------------------------------------
  // Internal helpers
  // --------------------------------------------------------------------------

  /**
   * Compute the engagement summary string directly from ExpertState aggregates.
   * Replaces the old psychologicalEngine.getEngagementSummary() dependency.
   */
  private getEngagementSummaryFromState(state: import("@/lib/schemas/expert-state").ExpertState): string {
    const agg = state.qualitySignals.sessionAggregates;
    const last = state.qualitySignals.turnRecords.slice(-1)[0];
    return `Reliability: ${Math.round(agg.overallReliability * 100)}% | Evasion: ${Math.round(agg.evasionIndex * 100)}% | Current Engagement: ${last ? Math.round(last.engagementScore * 100) : 0}%`;
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

    // think_and_respond tool removed in favor of direct JSON streaming response for better performance
    
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
      // think_and_respond has been replaced by the StreamFieldExtractor JSON structural contract.
      // State updates are now handled asynchronously by ConversationManager.updateMemoryAsync.
      // loadSkill removed in favor of V2 synthesized protocols pre-loaded from ExpertState.
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
      finishSurvey: tool({
        description: "Signal that the survey conversation is complete and should end. Call this when you have covered all required topics and gathered sufficient information from the participant.",
        inputSchema: z.object({
          reason: z.string().optional().describe("Optional brief reason for ending (e.g., 'all topics covered')"),
        }),
        execute: async ({ reason }) => ({ success: true, completed: true, reason }),
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

    let baseSystem = this.buildSystemPrompt();
    let finalMessages = messages;

    // V2 MemoryBridge Integration
    if (this.context.expertState && this.context.memoryBridge) {
      // ISSUE-07 FIXED: use top-level ESM import instead of runtime require()
      const transcriptText = assembleTranscriptContext(
        this.context.expertState.transcript.turns,
        this.context.memoryBridge.contextBudget
      );
      baseSystem += `\n\n<conversation_history>\n${transcriptText}\n</conversation_history>\n\nReview the conversation history above and respond to the participant's latest message below.`;

      // Preserve only the current user message — history is embedded in the system prompt above
      const lastMsg = messages[messages.length - 1];
      finalMessages = lastMsg ? [lastMsg] : messages;
    }

    const finalSystem = dynamicSystemDirective
      ? `${baseSystem}\n\n<dynamic_instruction>\n${dynamicSystemDirective}\n</dynamic_instruction>`
      : baseSystem;

    console.log(
      `[ConductingAgent:Stream] Configured SystemPrompt length: ${finalSystem.length}`,
    );

    return streamText({
      model: defaultModel,
      system: finalSystem,
      messages: finalMessages,
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
