/**
 * Agent Orchestrator
 *
 * The top-level coordinator that routes requests to the appropriate
 * specialist subagent. Uses AI SDK v6's Experimental_Agent for the
 * orchestrator itself, with specialists invoked as subagents via tools.
 *
 * Architecture:
 *
 *   User message
 *       ↓
 *   Orchestrator (Experimental_Agent)
 *       ↓ delegates via tool call
 *   ┌─────────────────────────────────────┐
 *   │  CreationSpecialist  (survey design) │
 *   │  ConductingSpecialist (interviews)   │
 *   │  AnalyticsSpecialist  (data analysis)│
 *   └─────────────────────────────────────┘
 *
 * The orchestrator's job is NOT to answer questions itself — it's to
 * understand the context and delegate to the right specialist.
 *
 * For direct streaming (API routes), specialists are called directly
 * without going through the orchestrator, for lower latency.
 * The orchestrator is used for complex multi-step tasks.
 */

import { ToolLoopAgent, tool, generateText, stepCountIs } from "ai";
import { z } from "zod";
import { CreationSpecialist } from "./creation-specialist";
import { ConductingSpecialist } from "./conducting-specialist";
import { AnalyticsSpecialist } from "./analytics-specialist";
import type { AgentContext } from "./types";
import { defaultModel, analysisModel } from "@/lib/ai";

// ============================================================================
// Orchestrator — Multi-Agent Coordinator
// ============================================================================

export class AgentOrchestrator {
  private readonly context: AgentContext;

  constructor(context: AgentContext) {
    this.context = context;
  }

  // --------------------------------------------------------------------------
  // Build Subagent Tools
  //
  // Each specialist is exposed as a tool to the orchestrator.
  // This is the AI SDK v6 subagent pattern: the orchestrator delegates
  // by calling a specialist as a tool, passing the conversation context.
  // --------------------------------------------------------------------------

  private buildSubagentTools() {
    const context = this.context;

    return {
      /**
       * Delegate to the Creation Specialist.
       * Used when: helping a creator design their survey.
       */
      delegateToCreationSpecialist: tool({
        description:
          "Delegate to the Creation Specialist for survey design tasks. " +
          "Use when the user is designing a survey, defining objectives, " +
          "setting up questions, or configuring survey parameters.",
        inputSchema: z.object({
          userMessage: z
            .string()
            .describe("The user's message to pass to the specialist"),
          additionalContext: z
            .string()
            .optional()
            .describe("Any additional context the specialist should know"),
        }),
        execute: async ({ userMessage, additionalContext }) => {
          const specialistContext: AgentContext = {
            ...context,
            knowledgeContext: additionalContext,
          };
          const specialist = new CreationSpecialist(specialistContext);
          const systemPrompt = specialist.buildSystemPrompt();

          const { text } = await generateText({
            model: defaultModel,
            system: systemPrompt,
            prompt: userMessage,
          });

          return { response: text, specialist: "creation" };
        },
      }),

      /**
       * Delegate to the Conducting Specialist.
       * Used when: conducting a live survey conversation with a respondent.
       */
      delegateToConductingSpecialist: tool({
        description:
          "Delegate to the Conducting Specialist for live survey interviews. " +
          "Use when conducting an actual survey conversation with a participant, " +
          "asking follow-up questions, or probing for deeper insights.",
        inputSchema: z.object({
          userMessage: z
            .string()
            .describe("The participant's message to respond to"),
          conversationSummary: z
            .string()
            .optional()
            .describe("Brief summary of the conversation so far"),
        }),
        execute: async ({ userMessage, conversationSummary }) => {
          const specialistContext: AgentContext = {
            ...context,
            knowledgeContext: conversationSummary,
          };
          const specialist = new ConductingSpecialist(specialistContext);
          await specialist.preloadSkills();
          const systemPrompt = specialist.buildSystemPrompt();

          const { text } = await generateText({
            model: defaultModel,
            system: systemPrompt,
            prompt: userMessage,
          });

          return { response: text, specialist: "conducting" };
        },
      }),

      /**
       * Delegate to the Analytics Specialist.
       * Used when: analyzing survey data or answering questions about results.
       */
      delegateToAnalyticsSpecialist: tool({
        description:
          "Delegate to the Analytics Specialist for data analysis tasks. " +
          "Use when analyzing survey responses, generating insights, " +
          "answering questions about survey data, or interpreting patterns.",
        inputSchema: z.object({
          query: z
            .string()
            .describe("The analysis question or data to analyze"),
          dataContext: z
            .string()
            .optional()
            .describe("The survey data or context to analyze"),
        }),
        execute: async ({ query, dataContext }) => {
          const specialistContext: AgentContext = {
            ...context,
            knowledgeContext: dataContext,
          };
          const specialist = new AnalyticsSpecialist(specialistContext);
          const response = await specialist.generate(query);
          return { response, specialist: "analytics" };
        },
      }),
    };
  }

  // --------------------------------------------------------------------------
  // Orchestrator Agent
  //
  // The orchestrator uses Experimental_Agent from AI SDK v6.
  // It understands the task and delegates to the right specialist.
  // --------------------------------------------------------------------------

  buildAgent(): ToolLoopAgent<any, any, any> {
    const config = this.context.surveyConfig;
    const domainName =
      this.context.loadedDomainSkills?.domainName ?? "the survey domain";

    const systemPrompt = `You are the orchestrator for a multi-agent survey system.
Your job is to understand what the user needs and delegate to the right specialist.

Survey context:
- Domain: ${domainName}
- Objective: ${config?.objective?.goal ?? config?.information ?? "not yet defined"}
- Audience: ${config?.targetAudience?.description ?? "survey participants"}

Available specialists:
1. Creation Specialist — survey design, configuration, question design
2. Conducting Specialist — live interviews, participant conversations
3. Analytics Specialist — data analysis, insights, pattern recognition

Rules:
- ALWAYS delegate to a specialist — never answer directly
- Choose the specialist that best matches the task
- Pass all relevant context to the specialist
- Return the specialist's response verbatim`;

    return new ToolLoopAgent({
      model: analysisModel, // Use Flash-Lite for orchestration (cost-efficient)
      instructions: systemPrompt,
      tools: this.buildSubagentTools(),
      stopWhen: stepCountIs(3), // Orchestrator → Specialist → Response
    });
  }

  // --------------------------------------------------------------------------
  // Direct Specialist Access (for API routes — lower latency)
  //
  // For streaming API routes, we bypass the orchestrator and call specialists
  // directly. The orchestrator is used for complex multi-step tasks only.
  // --------------------------------------------------------------------------

  getCreationSpecialist(): CreationSpecialist {
    return new CreationSpecialist(this.context);
  }

  getConductingSpecialist(): ConductingSpecialist {
    return new ConductingSpecialist(this.context);
  }

  getAnalyticsSpecialist(): AnalyticsSpecialist {
    return new AnalyticsSpecialist(this.context);
  }
}
