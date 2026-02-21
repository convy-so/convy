/**
 * Analytics Specialist Agent
 *
 * Interprets survey data with domain-specific analytical frameworks.
 * Used in two contexts:
 * 1. Generating analytics insights (survey-analytics.worker.ts)
 * 2. "Chat with your data" — answering creator questions about their data
 *
 * Key capabilities:
 * - Applies domain-specific metrics (NPS for CX, engagement scores for HR, etc.)
 * - Uses domain segmentation strategies to find meaningful patterns
 * - Distinguishes signal from noise using domain knowledge
 * - Generates actionable recommendations, not just observations
 */

import {
  generateText,
  streamText,
  tool,
  stepCountIs,
  type ModelMessage,
} from "ai";
import { z } from "zod";
import { BaseSpecialistAgent } from "./base-agent";
import type { AgentContext, SpecialistChecklist } from "./types";
import type { SurveyConfig } from "@/lib/prompts";
import { analysisModel, defaultModel } from "@/lib/ai";

export class AnalyticsSpecialist extends BaseSpecialistAgent {
  constructor(context: AgentContext) {
    super("analytics", context);
  }

  // --------------------------------------------------------------------------
  // Agent-Defined Success Criteria
  // --------------------------------------------------------------------------

  protected buildChecklist(config: SurveyConfig): SpecialistChecklist {
    const metrics = config.metrics ?? [];
    const insightTypes = config.successCriteria?.insightTypes ?? [];

    return {
      required: [
        this.makeChecklistItem(
          "objective_answer",
          `Directly answered the survey objective: "${config.objective?.goal ?? "the survey goal"}"`,
        ),
        this.makeChecklistItem(
          "pattern_identification",
          "Identified the top 3-5 patterns across all conversations",
        ),
        ...(metrics.length > 0
          ? [
              this.makeChecklistItem(
                "metrics_analysis",
                `Analyzed and interpreted: ${metrics.join(", ")}`,
              ),
            ]
          : []),
        this.makeChecklistItem(
          "actionable_recommendations",
          "Provided specific, actionable recommendations (not just observations)",
        ),
      ],
      aspirational: [
        ...(config.hypotheses?.assumptions?.length
          ? [
              this.makeChecklistItem(
                "hypotheses_verdict",
                `Rendered a verdict on each hypothesis: ${config.hypotheses.assumptions.slice(0, 2).join("; ")}`,
              ),
            ]
          : []),
        ...(insightTypes.includes("emotional")
          ? [
              this.makeChecklistItem(
                "emotional_patterns",
                "Identified emotional peaks, valleys, and the dominant sentiment arc",
              ),
            ]
          : []),
        ...(insightTypes.includes("behavioral")
          ? [
              this.makeChecklistItem(
                "behavioral_patterns",
                "Mapped the most common behavioral sequences and decision points",
              ),
            ]
          : []),
        this.makeChecklistItem(
          "segmentation",
          "Identified meaningful differences between participant segments",
        ),
      ],
    };
  }

  // --------------------------------------------------------------------------
  // System Prompt — Domain-Specialist Analyst
  // --------------------------------------------------------------------------

  buildSystemPrompt(): string {
    const config = this.context.surveyConfig;
    if (!config) {
      return "You are an analytics assistant. Error: Survey configuration is missing.";
    }

    const identity = this.getSpecialistIdentity();

    return `<role>
You are ${identity}.
You are analyzing survey data for: ${config.objective?.goal ?? config.information}
Target audience surveyed: ${config.targetAudience?.description ?? "survey participants"}
</role>

<specialist_mindset>
You are NOT a generic data summarizer. You are a domain expert who interprets data through the lens of survey research.
Your analysis should reveal insights that only a specialist would see — not just what the data says, but what it MEANS.
</specialist_mindset>

${this.getChecklistSection()}

${
  this.context.loadedDomainSkills
    ? `
<domain_skills>
${this.context.loadedDomainSkills.coreContent}

${this.context.loadedDomainSkills.surveyTypeContent}
</domain_skills>`
    : ""
}

${this.getKnowledgeSection()}

<analysis_principles>
1. ANSWER THE OBJECTIVE FIRST: Start with the survey's core question, then support with evidence
2. PATTERNS OVER ANECDOTES: Identify what's consistent across multiple responses
3. HYPOTHESES VERDICT: If hypotheses were defined, explicitly confirm or refute each one
4. SIGNAL VS NOISE: Distinguish meaningful patterns from outliers using domain knowledge
5. ACTIONABLE RECOMMENDATIONS: Every insight must connect to a specific action the creator can take
6. HONEST UNCERTAINTY: If the data is insufficient to conclude, say so clearly
7. VISUALIZE WHEN POSSIBLE: If a pattern or trend is best explained visually, use the 'renderChart' tool.
</analysis_principles>`;
  }

  // --------------------------------------------------------------------------
  // Generate — for batch analytics (used in workers)
  // --------------------------------------------------------------------------

  async generate(prompt: string): Promise<string> {
    const { text } = await generateText({
      model: analysisModel,
      system: this.buildSystemPrompt(),
      prompt,
      temperature: 0.3,
    });
    return text;
  }

  // --------------------------------------------------------------------------
  // Stream — for "chat with your data" interactive queries
  // --------------------------------------------------------------------------

  stream(messages: ModelMessage[]) {
    const config = this.context.surveyConfig;
    if (!config) {
      throw new Error("Cannot stream without survey configuration");
    }
    const { id: surveyId } = config;

    return streamText({
      model: defaultModel,
      system: this.buildSystemPrompt(),
      messages,
      temperature: 0.4,
      tools: {
        searchSurveyData: tool({
          description:
            "Search across all survey responses, insights, and analytics for specific information.",
          inputSchema: z.object({
            query: z
              .string()
              .describe("The search query to find relevant survey data"),
          }),
          execute: async ({ query }) => {
            const { hybridSearch } = await import("@/lib/rag/search");
            const results = await hybridSearch(query, {
              surveyId,
              limit: 5,
            });

            if (results.length === 0) {
              return {
                results: [],
                message: "No relevant data found for this query.",
              };
            }

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
          description:
            "Render a visualization (Bar, Line, Pie) to represent survey data patterns.",
          inputSchema: z.object({
            type: z
              .enum(["bar", "line", "pie"])
              .describe("The type of chart to render"),
            title: z.string().describe("The title of the chart"),
            description: z
              .string()
              .optional()
              .describe("A brief description of what the chart shows"),
            data: z
              .array(z.any())
              .describe(
                "The data points for the chart. For Bar/Pie: [{ label: string, value: number, color?: string }]. For Line: [{ x: string|number, y: number }]",
              ),
            config: z
              .object({
                xAxisLabel: z.string().optional(),
                yAxisLabel: z.string().optional(),
                dataKey: z.string().optional(),
              })
              .optional(),
          }),
          execute: async (args) => {
            // Generative UI tool: return args to be handled by the client
            return args;
          },
        }),
      },
      stopWhen: stepCountIs(3),
    });
  }
}
