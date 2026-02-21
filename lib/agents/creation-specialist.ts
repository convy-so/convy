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
import { SkillRegistry } from "./skill-registry";
import { stepCountIs } from "ai";
import { z } from "zod";
import { BaseSpecialistAgent } from "./base-agent";
import type { AgentContext, SpecialistChecklist } from "./types";
import type { SurveyConfig } from "@/lib/prompts";
import { REQUIRED_INFORMATION } from "@/lib/surveys";
import { defaultModel } from "@/lib/ai";
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

    return {
      required: [
        this.makeChecklistItem(
          "subject",
          "Identified the specific product, service, or experience being surveyed (not vague)",
        ),
        this.makeChecklistItem(
          "domain_classification",
          `Classified the survey into the correct domain (currently: ${domainName})`,
        ),
        this.makeChecklistItem(
          "subject_intelligence",
          "Built a deep model of the subject through expert questioning (Subject Intelligence Protocol)",
        ),
        this.makeChecklistItem(
          "objective",
          "Collected a specific, actionable objective with context and decision to be made",
        ),
        this.makeChecklistItem(
          "audience",
          "Defined who will be surveyed with relationship, knowledge level, and specifics",
        ),
        this.makeChecklistItem(
          "scope",
          "Established breadth vs depth preference and main topics to cover",
        ),
        this.makeChecklistItem(
          "constraints",
          "Confirmed time limits and any sensitive topics to avoid",
        ),
        this.makeChecklistItem(
          "tone",
          "Agreed on conversation tone (formal/casual/playful/empathetic)",
        ),
        this.makeChecklistItem(
          "metrics",
          "Identified which metrics to track (NPS, CSAT, CES, or custom)",
        ),
      ],
      aspirational: [
        this.makeChecklistItem(
          "hypotheses",
          "Surfaced any existing assumptions or beliefs the creator wants to test",
        ),
        this.makeChecklistItem(
          "required_questions",
          "Collected any specific questions the creator wants to ensure are asked",
        ),
        this.makeChecklistItem(
          "media",
          "Determined if any media (images, audio, video) should be shown during conversations",
        ),
        this.makeChecklistItem(
          "domain_onboarding",
          `Applied domain-specific onboarding questions for ${domainName}`,
        ),
      ],
    };
  }

  // --------------------------------------------------------------------------
  // System Prompt — Domain-Specialist Creation Guide
  // --------------------------------------------------------------------------

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

<rules priority="1">
1. SUBJECT FIRST: Always identify the specific product/service/experience before anything else
3. SPEECH: Ask one question at a time. Wait for answer.
4. CLARITY: If answer is vague, ask for 3 examples.
</rules>

<completion_behavior>
When all checklist items are MET:
1. Summarize the design in 2-3 sentences.
2. Say: "Please click the 'Go to Sample Conversations' button below to test your survey."
3. Call 'finishSurvey'.
</completion_behavior>`;
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

<rules priority="1">
1. SUBJECT FIRST: Always identify the specific product/service/experience before anything else
2. NEVER INFER: Ask explicitly, never assume from context
3. REQUIRE SPECIFICITY: Reject vague answers
4. ONE QUESTION AT A TIME: Single focused question, wait for response
5. ACKNOWLEDGE FIRST: Always acknowledge the user's response before asking the next question
</rules>

<completion_behavior>
When all required information is collected:
1. Give a brief, confident summary: "Here's what we've designed..."
2. Say exactly: "Please click the 'Go to Sample Conversations' button below to test your survey."
3. Then call the 'finishSurvey' tool.
4. Do NOT ask more questions after this point.
</completion_behavior>`;
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
          },
          required: ["allowedTypes"],
        },
      },
    ];
  }

  // --------------------------------------------------------------------------
  // Stream — returns a streamText result for the API route
  // --------------------------------------------------------------------------

  stream(messages: ModelMessage[]) {
    const ctx = this.context;
    if (!ctx.surveyConfig) {
      throw new Error("Cannot stream without survey configuration");
    }

    return streamText({
      model: defaultModel,
      system: this.buildSystemPrompt(),
      messages,
      tools: {
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
        // researchBestPractices tool removed
        finishSurvey: tool({
          description:
            "Signal that all required survey information has been collected and the survey design is complete.",
          inputSchema: z.object({
            summary: z
              .string()
              .describe("Brief summary of the survey that was designed"),
          }),
          execute: async ({ summary }) => ({
            success: true,
            message: "Survey design complete",
            summary,
          }),
        }),
        requestMediaUpload: tool({
          description:
            "Request the user to upload media (image, audio, or video) to include in the survey.",
          inputSchema: z.object({
            reason: z
              .string()
              .describe(
                "Why you are requesting media and how it will be used in the survey",
              ),
          }),
          execute: async ({ reason }) => ({
            success: true,
            message: "Media upload requested",
            reason,
          }),
        }),
      },
      stopWhen: stepCountIs(10),
    });
  }
}
