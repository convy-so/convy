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

export class AnalyticsSpecialist extends BaseSpecialistAgent {
  constructor(context: AgentContext) {
    super("analytics", context);
  }

  // --------------------------------------------------------------------------
  // Agent-Defined Success Criteria
  // --------------------------------------------------------------------------

  protected buildChecklist(config: SurveyConfig): SpecialistChecklist {
    const metrics = config.metrics ?? [];
    const insightTypes =
      config.expertState?.successCriteria?.insightTypes ?? [];

    return {
      required: [
        this.makeChecklistItem(
          "objective_answer",
          `Directly answered the survey objective: "${config.coreObjective || config.expertState?.objective?.goal || config.information}"`,
        ),
        this.makeChecklistItem(
          "metrics_comprehensive",
          `Reported on ALL defined metrics: ${metrics.join(", ") || "No explicit metrics defined"}`,
        ),
        this.makeChecklistItem(
          "media_performance",
          "Analyzed the effectiveness and reactions to any media shown in the survey",
        ),
        this.makeChecklistItem(
          "pattern_identification",
          "Identified the top 3-5 patterns across all conversations with supporting evidence",
        ),
        this.makeChecklistItem(
          "actionable_recommendations",
          "Provided specific, actionable recommendations (not just observations)",
        ),
      ],
      aspirational: [
        this.makeChecklistItem(
          "hypotheses_verdict",
          "Rendered a clear 'Confirmed' or 'Refuted' verdict on all creator assumptions",
        ),
        ...(insightTypes.includes("emotional")
          ? [
              this.makeChecklistItem(
                "emotional_arc",
                "Mapped the emotional sentiment arc of the participant pool",
              ),
            ]
          : []),
        this.makeChecklistItem(
          "segmentation",
          "Identified meaningful behavior differences between participant segments",
        ),
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
GOAL: Interpret data to answer the core objective: "${config.coreObjective || config.expertState?.objective?.goal || config.information}"
AUDIENCE: Survey Creators / Stakeholders seeking actionable insights.
</role>

${this.getGlobalArchitectureRules()}

${this.getChecklistSection()}

${this.getConstitutionalConstraints()}

<expert_analytical_protocols>
${coreContent || ""}
${surveyTypeContent || ""}
</expert_analytical_protocols>

${this.getSkillsSection()}

${this.getKnowledgeSection()}

<proactive_insight_rules>
1. METRICS FIRST: You MUST include a specific section evaluating every metric defined in the survey. If data is sparse, state "Inconclusive due to [Reason]".
2. MEDIA ANALYTICS: If media was included in the survey, explicitly report on participant reactions to specific Media IDs.
3. VISUALIZE: Use 'renderChart' for any distribution data (e.g., Sentiment, NPS, Frequency).
4. THE "WHY" FACTOR: Don't just report numbers. Use the qualitative responses to explain WHY a metric is high or low.
</proactive_insight_rules>

<completion_protocol>
1. Final output must be professional, structured, and free of conversational filler. 
2. Ensure every REQUIRED checklist item is addressed in the final report.
3. LANGUAGE: You MUST synthesize all findings and write the final report in ${this.context.language === "de" ? "German" : this.context.language === "fr" ? "French" : this.context.language === "es" ? "Spanish" : this.context.language === "it" ? "Italian" : "English"}.
</completion_protocol>
`.trim();
  }

  // --------------------------------------------------------------------------
  // Generate — for batch analytics (used in workers)
  // --------------------------------------------------------------------------

  async generate(prompt: string): Promise<string> {
    const { text } = await generateText({
      model: analysisModel,
      system: this.buildSystemPrompt(),
      prompt,
      temperature: 0.1, // Lower temperature for more consistent analysis
    });
    return text;
  }

  // --------------------------------------------------------------------------
  // Agent Tools
  // --------------------------------------------------------------------------

  getTools(): Record<string, unknown> {
    const config = this.context.surveyConfig;
    const surveyId = config?.id;

    return {
      loadSkill: tool({
        description:
          "Load detailed instructions for a specific specialized skill.",
        inputSchema: z.object({
          skillId: z.string().describe("The ID of the skill to load."),
        }),
        execute: async ({ skillId }) => {
          const { SkillRegistry } = await import("./skill-registry");
          const skill = await SkillRegistry.getSkill(skillId);
          return skill
            ? { instructions: skill.content }
            : { error: "Skill not found" };
        },
      }),
      searchSurveyData: tool({
        description:
          "Search across all survey responses, insights, and analytics.",
        inputSchema: z.object({ query: z.string().describe("Search query.") }),
        execute: async ({ query }) => {
          if (!surveyId) return { error: "No survey ID available" };
          const { hybridSearch } = await import("@/lib/rag/search");
          const results = await hybridSearch(
            query,
            { surveyId, limit: 10 },
            this.context.language || "en",
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
          data: z.array(z.record(z.unknown())),
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
      response: unknown;
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
          provider: (defaultModel as { modelId?: string }).modelId?.includes(
            "gpt",
          )
            ? "openai"
            : "google",
          modelName:
            (defaultModel as { modelId?: string }).modelId ??
            "gemini-2.5-flash",
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
