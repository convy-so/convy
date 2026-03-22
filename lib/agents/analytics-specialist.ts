import { z } from "zod";
import {
  generateText,
  streamText,
  tool,
  stepCountIs,
  type ModelMessage,
} from "ai";
import { BaseSpecialistAgent } from "./base-agent";
import type { AgentContext, SpecialistChecklist } from "./types";
import type { SurveyConfig } from "@/lib/prompts";
import { analysisModel, defaultModel } from "@/lib/ai";
import { logUsage } from "@/lib/billing/logger";
import { evaluateResponse } from "@/lib/rag/evaluate";
import { SkillEngine } from "./skill-system/engine";

export class AnalyticsSpecialist extends BaseSpecialistAgent {
  constructor(context: AgentContext) {
    super("analytics", context);
  }

  // --------------------------------------------------------------------------
  // Agent-Defined Success Criteria
  // --------------------------------------------------------------------------

  protected buildChecklist(config: SurveyConfig): SpecialistChecklist {
    const state = this.context.expertState;
    if (!state) return { required: [], aspirational: [] };

    return {
      required: [
        this.makeChecklistItem("objective_answered", "Directly addressed the survey goal", !!state.brief.objectives.length),
        this.makeChecklistItem("metrics_validated", "Rendered verdicts on all success metrics", !!state.brief.successMetrics),
        this.makeChecklistItem("pattern_detection", "Identified latent behavioral patterns", "pending"),
        this.makeChecklistItem("grounded_evidence", "All claims cited with [Source ID]", "pending"),
      ],
      aspirational: [
        this.makeChecklistItem("longitudinal_insight", "Detected changes in sentiment over time", !!state.sessionMeta.modality),
        this.makeChecklistItem("audience_validation", "Verified psychographic assumptions", !!state.audienceModel.psychographicProfile),
      ],
    };
  }

  // --------------------------------------------------------------------------
  // System Prompt — Domain-Specialist Analyst
  // --------------------------------------------------------------------------

  buildSystemPrompt(): string {
    const config = this.context.surveyConfig;
    if (!config) return "Survey configuration is missing.";

    const { domainName, coreContent, surveyTypeContent } =
      this.context.loadedDomainSkills || {};

    return `
<role>
IDENTITY: You are a professional ${domainName || "Survey"} Insight Analyst.
GOAL: Interpret data to answer the core objective: "${config.expertState?.objective?.goal || config.coreObjective || config.information}"
AUDIENCE: Survey Creators / Stakeholders seeking actionable insights.
</role>

${this.getGlobalArchitectureRules()}

${this.getChecklistSection()}

${this.getConstitutionalConstraints()}

<expert_analytical_protocols>
${coreContent || ""}
${surveyTypeContent || ""}
</expert_analytical_protocols>

${this.getAdaptationHintsSection()}

${this.getPrunedStateSection()}

${this.getSkillsSection()}

${this.getKnowledgeSection()}

<proactive_insight_rules>
1. COGNITIVE ANALYST: identify why participants behaved a certain way.
2. CITATION MANDATORY: Every claim MUST end with [Source ID: <id>].
3. DECISION-MAP ALIGNMENT: Structure directly address Creator's threshold.
</proactive_insight_rules>

<thinking_protocol>
You are operating in a low-latency STREAMING JSON MODE.
For every turn, your response MUST be a perfectly formatted, raw JSON object containing:
1. "reasoning": Concise internal audit of data patterns.
2. "response": Professional insight report.
</thinking_protocol>
`.trim();
  }

  // --------------------------------------------------------------------------
  // Generate — for batch analytics (used in workers)
  // --------------------------------------------------------------------------

  async generate(prompt: string): Promise<string> {
    const result = await generateText({
      model: analysisModel,
      system: this.buildSystemPrompt(),
      prompt,
      temperature: 0.1, // Lower temperature for more consistent analysis
      tools: this.getTools(),
      stopWhen: stepCountIs(3),
    });
    
    // LAYER 6: Evaluation Triad (Synchronous Gate)
    // Extract retrieved context from tool results
    let retrievedContexts: string[] = [];
    
    // Define schema for tool output validation - flexible but type-safe
    const searchResultsSchema = z.object({
      results: z.array(z.object({
        content: z.string(),
      }).passthrough()),
    }).passthrough();

    if (result.toolResults) {
      for (const res of result.toolResults) {
        if (res.toolName === "searchSurveyData") {
          const parsed = searchResultsSchema.safeParse(res.output);
          if (parsed.success) {
            retrievedContexts.push(...parsed.data.results.map((r) => r.content));
          }
        }
      }
    }
    
    // If we used RAG, evaluate the response
    if (retrievedContexts.length > 0) {
      const evaluation = await evaluateResponse(prompt, retrievedContexts, result.text);
      if (!evaluation.isGrounded) {
        return "I'm sorry, but I do not have sufficient evidence in the retrieved survey results to provide a fully grounded answer to this objective. Please adjust your query or review the raw responses directly.";
      }
    }

    return result.text;
  }

  // --------------------------------------------------------------------------
  // Agent Tools
  // --------------------------------------------------------------------------

  getTools() {
    const config = this.context.surveyConfig;
    const surveyId = config?.id;

    return {
      // loadSkill removed in favor of V2 synthesized protocols pre-loaded from ExpertState.
      searchSurveyData: tool({
        description:
          "Search across all survey responses, insights, and analytics.",
        inputSchema: z.object({ query: z.string().describe("Search query.") }),
        execute: async ({ query }) => {
          if (!surveyId) return { error: "No survey ID available" };
          const { executeRAGQuery } = await import("@/lib/rag/search");
          const results = await executeRAGQuery(
            query,
            { surveyId, organizationId: this.context.organizationId, limit: 20 },
            (this.context.language as any) || "en",
          );
          return {
            results: results.map((r) => ({
              content: r.content,
              source: r.sourceType,
              relevance: r.score,
            })),
          };
        },
      }),
      renderChart: tool({
        description: "Render a Bar, Line, or Pie chart to visualize patterns.",
        inputSchema: z.object({
          type: z.enum(["bar", "line", "pie"]),
          title: z.string(),
          description: z.string().optional(),
          data: z.array(z.any()),
          config: z
            .object({
              xAxisLabel: z.string().optional(),
              yAxisLabel: z.string().optional(),
              dataKey: z.string().optional(),
            })
            .optional(),
        }),
        execute: async (args) => args,
      }),
      renderTable: tool({
        description: "Render a formatted data table.",
        inputSchema: z.object({
          title: z.string(),
          description: z.string().optional(),
          columns: z.array(z.string()),
          rows: z.array(z.array(z.string())),
        }),
        execute: async (args) => args,
      }),
    };
  }

  // --------------------------------------------------------------------------
  // Stream
  // --------------------------------------------------------------------------

  stream(
    messages: ModelMessage[],
    onFinish?: (params: {
      text: string;
      response: any;
      usage: import("ai").LanguageModelUsage;
    }) => Promise<void>,
  ) {
    const config = this.context.surveyConfig;
    if (!config) throw new Error("Cannot stream without survey configuration");

    return streamText({
      model: defaultModel,
      system: this.buildSystemPrompt(),
      messages,
      temperature: 0.2,
      tools: this.getTools(),
      onFinish: async (result) => {
        logUsage({
          userId: this.context.userId,
          organizationId: this.context.organizationId,
          surveyId: config.id,
          type: "llm_text",
          provider: (defaultModel as any).modelId?.includes("gpt")
            ? "openai"
            : "google",
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
      stopWhen: stepCountIs(3),
    });
  }
}
