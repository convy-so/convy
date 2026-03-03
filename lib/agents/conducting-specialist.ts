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
  //
  // The conducting agent derives its checklist from the survey config.
  // This is what makes it truly specialist: it knows exactly what "done"
  // means for THIS specific survey before the conversation starts.
  // --------------------------------------------------------------------------

  protected buildChecklist(config: SurveyConfig): SpecialistChecklist {
    const required: ReturnType<typeof this.makeChecklistItem>[] = [];
    const aspirational: ReturnType<typeof this.makeChecklistItem>[] = [];

    // Required: cover all main topics from scope
    if (config.expertState?.scope?.mainTopics?.length) {
      config.expertState.scope.mainTopics.forEach(
        (topic: string, i: number) => {
          required.push(
            this.makeChecklistItem(
              `topic_${i}`,
              `Covered topic: "${topic}" with sufficient depth`,
            ),
          );
        },
      );
    } else {
      required.push(
        this.makeChecklistItem(
          "core_objective",
          `Gathered information about: ${config.coreObjective || config.expertState?.objective?.goal || config.information || "the survey objective"}`,
        ),
      );
    }

    // Required: ask all required questions
    if (config.requiredQuestions?.length) {
      config.requiredQuestions.forEach((q, i) => {
        required.push(
          this.makeChecklistItem(
            `required_q_${i}`,
            `Asked required question: "${q.slice(0, 80)}${q.length > 80 ? "..." : ""}"`,
          ),
        );
      });
    }

    // Required: collect metrics if specified
    if (config.metrics?.length) {
      required.push(
        this.makeChecklistItem(
          "metrics",
          `Collected metric scores: ${config.metrics.join(", ")}`,
        ),
      );
    }

    // Required: collect personal info if specified
    if (config.personalInfo?.length) {
      required.push(
        this.makeChecklistItem(
          "personal_info",
          `Collected personal information: ${config.personalInfo.join(", ")}`,
        ),
      );
    }

    // Aspirational: test hypotheses
    if (config.expertState?.hypotheses?.assumptions?.length) {
      config.expertState.hypotheses.assumptions.forEach(
        (assumption: string, i: number) => {
          aspirational.push(
            this.makeChecklistItem(
              `hypothesis_${i}`,
              `Tested assumption: "${assumption.slice(0, 80)}${assumption.length > 80 ? "..." : ""}"`,
            ),
          );
        },
      );
    }

    // Aspirational: insight type depth based on successCriteria
    const insightTypes =
      config.expertState?.successCriteria?.insightTypes ?? [];
    if (insightTypes.includes("emotional")) {
      aspirational.push(
        this.makeChecklistItem(
          "emotional_depth",
          "Probed emotional peak moments and the final impression (peak-end rule)",
        ),
      );
    }
    if (insightTypes.includes("behavioral")) {
      aspirational.push(
        this.makeChecklistItem(
          "behavioral_depth",
          "Reconstructed specific actions and decision points (journey reconstruction)",
        ),
      );
    }
    if (insightTypes.includes("rational")) {
      aspirational.push(
        this.makeChecklistItem(
          "rational_depth",
          "Elicited comparisons, evaluations, and reasoned opinions",
        ),
      );
    }

    return { required, aspirational };
  }

  // --------------------------------------------------------------------------
  // System Prompt — Domain-Specialist Interviewer
  // --------------------------------------------------------------------------

  private getReflectionProtocol(): string {
    const isSample = this.context.isSample;
    const feedback = this.context.sampleFeedback;

    let creatorFeedbackSection = "";
    let extraCheck = "";

    if (isSample && feedback) {
      creatorFeedbackSection = `\n<creator_feedback>\nThe survey creator provided the following coaching feedback from previous sample runs. You MUST adjust your style and approach to account for this feedback, while still attempting to meet your primary data collection goals:\n\n${feedback}\n</creator_feedback>\n\n`;
      extraCheck = `\nCheck 6 — Creator Feedback: Does my response align with the guidance in <creator_feedback>?`;
    }

    return `${creatorFeedbackSection}<reflection_protocol>
Before EVERY response you write, open a <scratchpad> block and silently reason through these checks. The scratchpad is NEVER shown to the participant — it is stripped before delivery.

<scratchpad>
Topics already covered: [list from conversation_context]
Last participant message: [1-sentence summary of what they said]
Check 1 — Acknowledge: Does my response acknowledge what they just said before asking anything?
Check 2 — One question: Does my response contain exactly ONE question? (Count question marks.)
Check 3 — No repeat: Is my question about a topic NOT already in topics_covered?
Check 4 — Natural transition: Does my question connect logically to their last answer?
Check 5 — Depth: If their last answer was vague, am I probing deeper instead of moving on?${extraCheck}
Verdict: [PASS / REWRITE — and if REWRITE, state why in one short sentence]
</scratchpad>

If any check fails, write a corrected response AFTER the scratchpad. The scratchpad itself is always stripped — ONLY write what the participant should see after </scratchpad>.
</reflection_protocol>`;
  }

  buildSystemPrompt(): string {
    const config = this.context.surveyConfig;
    if (!config) {
      return "You are a survey assistant. Error: Survey configuration is missing.";
    }

    const context = this.context.rollingContext;

    // ------------------------------------------------------------------------
    // NEW SYSTEM with Loaded Skills (Hybrid support)
    // ------------------------------------------------------------------------
    if (this.context.loadedDomainSkills) {
      const { domainName, coreContent, surveyTypeContent } =
        this.context.loadedDomainSkills;
      const subjectIntel = this.context.subjectIntelligence;

      // Build insight-type-specific questioning strategy
      const insightTypes =
        config.expertState?.successCriteria?.insightTypes ?? [];
      const questioningStrategy = this.buildQuestioningStrategy(insightTypes);

      // Build Subject Intelligence Section
      let subjectIntelSection = "";
      if (subjectIntel) {
        subjectIntelSection = `
<subject_intelligence subject="${config.expertState?.objective?.subjectDescription ?? "the subject"}">
<vocabulary>
Use these terms to sound like an insider:
${subjectIntel.userVocabulary.map((v) => `• ${v}`).join("\n")}
</vocabulary>

<known_pain_points>
Probe for these known issues if relevant:
${subjectIntel.knownPainPoints.map((p) => `• ${p}`).join("\n")}
</known_pain_points>

<journey_context>
The user journey typically involves:
${subjectIntel.journeySteps.map((s) => `• ${s}`).join("\n")}
</journey_context>

<intelligent_probes>
Ask these if the conversation touches on relevant areas:
${subjectIntel.intelligentProbes.map((p) => `• ${p}`).join("\n")}
</intelligent_probes>
</subject_intelligence>
`;
      }

      // Build other standard sections
      let hypothesesSection = "";
      if (config.expertState?.hypotheses?.assumptions?.length) {
        hypothesesSection = `
<hypotheses_to_test>
The survey creator has these assumptions. Actively test them through your questions:
${config.expertState.hypotheses.assumptions.map((a: string, i: number) => `${i + 1}. "${a}"`).join("\n")}
When you get evidence for or against these, probe deeper.
</hypotheses_to_test>`;
      }

      let contextSection = "";
      if (context) {
        const { memory, progress, qualitySignals } = context;
        contextSection = `
<conversation_context>
Progress: ${Math.round(progress.completionPercentage)}% complete
Topics covered: ${memory.topicsCovered.join(", ") || "none yet"}
Current topic: ${memory.currentTopic ?? "opening"}
Time elapsed: ${Math.round(progress.elapsedMinutes)} min
Participant style: ${context.memory.participantStyle ?? "unknown"}
${qualitySignals ? `Response quality: avg length ${qualitySignals.averageResponseLength} chars` : ""}
${memory.keyFactsLearned.length > 0 ? `Key facts: ${memory.keyFactsLearned.slice(0, 3).join("; ")}` : ""}
</conversation_context>`;
      }

      let mediaSection = "";
      if (config.media?.length) {
        mediaSection = `
<available_media>
You have media available. Autonomously determine the best moment in the conversation to show this media to achieve its feedback goal, and use the 'showMedia' tool:
${config.media.map((m) => `• ID: ${m.id} | Type: ${m.type} | Description: "${m.description}"\n  Feedback goal: ${m.contextForUse}`).join("\n")}
</available_media>`;
      }

      return `<role>
You are the ${domainName} Conducting Specialist.
You are conducting a survey conversation about: ${config.coreObjective || config.expertState?.objective?.goal || config.information}
Audience: ${config.expertState?.targetAudience?.description || "survey participants"}
${this.getToneGuidelines()}
Language: ${this.context.language ?? config.language ?? "en"}
</role>

<specialist_mindset>
You are NOT a generic chatbot. You are a trained ${domainName} interviewer.
Apply your domain expertise at every turn — in how you probe, how you follow up, what you listen for.
Your goal is not to ask all the questions — it's to UNDERSTAND the participant's experience.
</specialist_mindset>

${this.getChecklistSection()}

${questioningStrategy}

<domain_skills>
${coreContent}

${surveyTypeContent}
</domain_skills>

${subjectIntelSection}

${hypothesesSection}

${contextSection}

${mediaSection}

${this.getSkillsSection()}

<identity_steering>
Based on the survey domain, consider loading these skills if appropriate:
${domainName?.toLowerCase().includes("enterprise") || domainName?.toLowerCase().includes("b2b") ? "• 'B2BDiscovery'" : ""}
${domainName?.toLowerCase().includes("child") ? "• 'PediatricResearcher'" : ""}
</identity_steering>

${this.getKnowledgeSection()}

${this.getPatternLearningsSection()}

${this.getReflectionProtocol()}

<scope>
Focus areas: ${config.expertState?.scope?.mainTopics?.join(", ") ?? "the survey objective"}
Depth preference: ${config.expertState?.scope?.breadthVsDepth ?? "balanced"}
Time limit: ${config.expertState?.constraints?.timeLimit ? `${config.expertState.constraints.timeLimit} minutes` : "no strict limit"}
${config.expertState?.constraints?.sensitiveTopics?.length ? `Avoid: ${config.expertState.constraints.sensitiveTopics.join(", ")}` : ""}
</scope>

<completion>
When all required checklist items are satisfied:
1. Thank the participant warmly
2. Give a brief closing statement appropriate to the domain
3. Call the 'finishSurvey' tool
Do NOT ask more questions after calling finishSurvey.
</completion>`;
    }

    // ------------------------------------------------------------------------
    // ------------------------------------------------------------------------
    // GENERIC SYSTEM FALLBACK (No domain skills loaded)
    // ------------------------------------------------------------------------
    // If no domain skills are loaded, we fall back to a robust generic conducting
    // specialist that follows best practices without specific domain knowledge.

    // Build insight-type-specific questioning strategy
    const insightTypes =
      config.expertState?.successCriteria?.insightTypes ?? [];
    const questioningStrategy = this.buildQuestioningStrategy(insightTypes);

    // Build hypotheses section
    let hypothesesSection = "";
    if (config.expertState?.hypotheses?.assumptions?.length) {
      hypothesesSection = `
<hypotheses_to_test>
The survey creator has these assumptions. Actively test them through your questions:
${config.expertState!.hypotheses.assumptions.map((a: string, i: number) => `${i + 1}. "${a}"`).join("\n")}

When you get evidence for or against these, probe deeper. Don't just accept surface answers.
</hypotheses_to_test>`;
    }

    // Build rolling context section
    let contextSection = "";
    if (context) {
      const { memory, progress, qualitySignals } = context;
      contextSection = `
<conversation_context>
Progress: ${Math.round(progress.completionPercentage)}% complete
Topics covered: ${memory.topicsCovered.join(", ") || "none yet"}
Current topic: ${memory.currentTopic ?? "opening"}
Time elapsed: ${Math.round(progress.elapsedMinutes)} min
Participant style: ${context.memory.participantStyle ?? "unknown"}
${qualitySignals ? `Response quality: avg length ${qualitySignals.averageResponseLength} chars` : ""}
${memory.keyFactsLearned.length > 0 ? `Key facts: ${memory.keyFactsLearned.slice(0, 3).join("; ")}` : ""}
</conversation_context>`;
    }

    // Build media section
    let mediaSection = "";
    if (config.media?.length) {
      mediaSection = `
<available_media>
You have media available. Autonomously determine the best moment in the conversation to show this media to achieve its feedback goal, and use the 'showMedia' tool:
${config.media
  .map(
    (m) => `
• ID: ${m.id} | Type: ${m.type} | Description: "${m.description}"
  Feedback goal: ${m.contextForUse}`,
  )
  .join("\n")}
</available_media>`;
    }

    return `<role>
You are a professional Survey Conducting Specialist.
You are conducting a survey conversation about: ${config.coreObjective || config.expertState?.objective?.goal || config.information}
Audience: ${config.expertState?.targetAudience?.description || "survey participants"}
${this.getToneGuidelines()}
Language: ${this.context.language ?? config.language ?? "en"}
</role>

<specialist_mindset>
You are NOT a generic chatbot. You are a trained interviewer.
Your goal is not to ask all the questions — it's to UNDERSTAND the participant's experience.
Ask follow-up questions. Probe for details. Get the "why" behind the "what".
</specialist_mindset>

${this.getChecklistSection()}

${questioningStrategy}

${hypothesesSection}

${contextSection}

${mediaSection}

${this.getSkillsSection()}

${this.getKnowledgeSection()}

${this.getPatternLearningsSection()}

${this.getReflectionProtocol()}

<scope>
Focus areas: ${config.expertState?.scope?.mainTopics?.join(", ") ?? "the survey objective"}
Depth preference: ${config.expertState?.scope?.breadthVsDepth ?? "balanced"}
Time limit: ${config.expertState?.constraints?.timeLimit ? `${config.expertState.constraints.timeLimit} minutes` : "no strict limit"}
${config.expertState?.constraints?.sensitiveTopics?.length ? `Avoid: ${config.expertState.constraints.sensitiveTopics.join(", ")}` : ""}
</scope>

<completion>
When all required checklist items are satisfied:
1. Thank the participant warmly
2. Give a brief closing statement
3. Call the 'finishSurvey' tool
Do NOT ask more questions after calling finishSurvey.
</completion>`;
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
  // Questioning Strategy — derived from successCriteria.insightTypes
  // This is what makes the agent adapt its technique to what the survey needs
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
  // Returns tools in Deepgram's function format (not Vercel AI SDK format)
  // --------------------------------------------------------------------------

  getDeepgramFunctions(): VoiceAgentFunction[] {
    const config = this.context.surveyConfig;
    const functions: VoiceAgentFunction[] = [];
    if (!config) return functions;

    // Add think_and_respond tool for structured reasoning
    functions.push({
      name: "think_and_respond",
      description:
        "Use this tool to plan your response, update the survey checklist state based on the user's input, and formulate the exact text you want to say to the user. You MUST call this tool.",
      parameters: {
        type: "object",
        properties: {
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
          message_to_user: {
            type: "string",
            description:
              "The FINAL text that will be spoken or shown to the user. This must NOT contain any internal thoughts or scratchpads.",
          },
        },
        required: ["internal_reasoning", "state_updates", "message_to_user"],
      },
    });

    // Add showMedia if survey has media
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

    // Always add finishSurvey
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
          message_to_user: z
            .string()
            .describe(
              "The FINAL text that will be spoken or shown to the user. This must NOT contain any internal thoughts or scratchpads.",
            ),
        }),
        execute: async ({
          internal_reasoning,
          state_updates,
          message_to_user,
        }) => {
          // In the AI SDK stream flow, this isn't strictly awaited for side-effects here
          // because we intercept it in the response route if needed.
          // However, returning success tells the model it worked.
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
  // Stream — returns a streamText result for the API route
  // --------------------------------------------------------------------------

  stream(
    messages: ModelMessage[],
    onMediaDisplay?: (media: any) => void,
    onFinish?: (params: {
      text: string;
      response: any;
      usage: any;
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

    return streamText({
      model: defaultModel,
      system: finalSystem,
      messages,
      tools: this.getTools(onMediaDisplay),
      maxOutputTokens: 2000,
      stopWhen: stepCountIs(5),
      onFinish: async (params) => {
        // Log usage for conducting agent
        logUsage({
          userId: this.context.userId,
          organizationId: this.context.organizationId,
          surveyId: config.id,
          type: "llm_text",
          provider: "google",
          modelName: (defaultModel as any).modelId ?? "gemini-2.5-flash",
          promptTokens: params.usage.inputTokens,
          completionTokens: params.usage.outputTokens,
          totalTokens: params.usage.totalTokens,
        });

        // Safe-strip scratchpad from final text for database/memory
        // The instruction implies we should pass the raw text, so removing the stripping.
        if (onFinish) await onFinish(params);
      },
    });
  }

  // --------------------------------------------------------------------------
  // Research Field Guide Section
  // --------------------------------------------------------------------------
}
